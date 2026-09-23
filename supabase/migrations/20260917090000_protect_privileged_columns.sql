-- Row-level security decides which ROWS a user may write, never which
-- COLUMNS. "users can update their own profile" therefore let anyone set
-- is_admin = true on themselves (and from there delete any post or account),
-- and "users can insert/update their own requests" let anyone mark their own
-- post sponsored — skipping payment — or a staff pick. These triggers close
-- that at the column level.
--
-- The browser talks to Postgres as `anon` or `authenticated`. Server code
-- (the QPay webhook, admin-delete-user) uses the service role, and migrations
-- and SECURITY DEFINER functions run as the owner — none of those are
-- restricted here.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    elsif new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin can only be changed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
before insert or update on public.profiles
for each row execute function public.guard_profile_privileges();


create or replace function public.guard_request_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_sponsored := false;
      if not public.is_admin() then
        new.is_staff_pick := false;
        new.staff_pick_rank := null;
      end if;
    else
      if new.is_sponsored is distinct from old.is_sponsored then
        raise exception 'Promotion is only switched on by a confirmed payment' using errcode = '42501';
      end if;
      if (new.is_staff_pick is distinct from old.is_staff_pick
          or new.staff_pick_rank is distinct from old.staff_pick_rank)
         and not public.is_admin() then
        raise exception 'Only admins can change staff picks' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_guard_privileges on public.requests;
create trigger requests_guard_privileges
before insert or update on public.requests
for each row execute function public.guard_request_privileges();


-- "requesters can mark favorite" lets the owner of a request update any
-- recommendation on it. That's meant for picking the one that helped, not
-- for rewriting someone else's note, link or photo.
create or replace function public.guard_recommendation_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and old.user_id is distinct from auth.uid()
     and (to_jsonb(new) - 'is_favorite') is distinct from (to_jsonb(old) - 'is_favorite') then
    raise exception 'You can only mark a recommendation as the one that helped' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists recommendations_guard_update on public.recommendations;
create trigger recommendations_guard_update
before update on public.recommendations
for each row execute function public.guard_recommendation_update();
