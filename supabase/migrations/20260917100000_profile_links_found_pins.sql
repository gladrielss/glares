-- Shareable profiles (glaress.pages.dev/<username>), Instagram link, pinned
-- post, and "Found" — the recommendation that actually helped.

alter table public.profiles
  add column if not exists instagram_handle text,
  add column if not exists pinned_request_id uuid references public.requests(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_instagram_handle_format;
alter table public.profiles add constraint profiles_instagram_handle_format
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 300);

alter table public.requests
  add column if not exists found_recommendation_id uuid references public.recommendations(id) on delete set null;

create index if not exists requests_found_idx on public.requests (found_recommendation_id) where found_recommendation_id is not null;
create index if not exists profiles_username_lower_idx on public.profiles (lower(username));


-- Profile URLs live at the site root, so a username can't shadow a page, and
-- two names that differ only in case would fight over the same link. Checked
-- only when a name is set or changed from the browser: existing accounts
-- (some with capitals) keep working, and the signup trigger — which runs as
-- the owner — isn't affected.
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

    if tg_op = 'INSERT' or new.username is distinct from old.username then
      if new.username !~ '^[a-z0-9._]{3,30}$' or new.username ~ '^[.]|[.]$|[.]{2}' then
        raise exception 'Usernames are 3–30 lowercase letters, numbers, dots or underscores' using errcode = '22023';
      end if;
      if new.username in ('api', 'css', 'js', 'images', 'index', 'profile', 'profiles', 'request', 'requests',
                          'reel', 'messages', 'store', 'store-item', 'search', 'settings', 'admin', 'glares',
                          'about', 'help', 'login', 'signup', 'explore', 'dist', 'functions', 'www') then
        raise exception 'That username is reserved' using errcode = '22023';
      end if;
      if exists (select 1 from public.profiles where lower(username) = lower(new.username) and id <> new.id) then
        raise exception 'That username is taken' using errcode = '23505';
      end if;
    end if;

    if new.pinned_request_id is not null
       and new.pinned_request_id is distinct from (case when tg_op = 'UPDATE' then old.pinned_request_id end)
       and not exists (select 1 from public.requests where id = new.pinned_request_id and user_id = new.id) then
      raise exception 'You can only pin your own posts' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


create or replace function public.guard_request_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_sponsored := false;
      new.found_recommendation_id := null;
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
      if new.found_recommendation_id is distinct from old.found_recommendation_id
         and new.found_recommendation_id is not null
         and not exists (select 1 from public.recommendations
                         where id = new.found_recommendation_id and request_id = new.id) then
        raise exception 'That recommendation is not on this post' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;


-- One call so the post's "found" pointer and the recommendation's favorite
-- flag can never disagree. Pass null to un-mark.
create or replace function public.set_request_found(p_request_id uuid, p_recommendation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.requests where id = p_request_id and user_id = auth.uid()) then
    raise exception 'Only the person who posted this can mark it found' using errcode = '42501';
  end if;
  if p_recommendation_id is not null
     and not exists (select 1 from public.recommendations where id = p_recommendation_id and request_id = p_request_id) then
    raise exception 'That recommendation is not on this post' using errcode = '22023';
  end if;

  update public.recommendations
     set is_favorite = coalesce(id = p_recommendation_id, false)
   where request_id = p_request_id
     and is_favorite is distinct from coalesce(id = p_recommendation_id, false);

  update public.requests set found_recommendation_id = p_recommendation_id where id = p_request_id;
end;
$$;

revoke all on function public.set_request_found(uuid, uuid) from public;
grant execute on function public.set_request_found(uuid, uuid) to authenticated;


-- New accounts get a lowercase, link-friendly username from the start.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  base_username text := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  candidate text;
  suffix int := 0;
begin
  if char_length(base_username) < 3 then
    base_username := base_username || 'user';
  end if;
  base_username := left(base_username, 24);
  if base_username in ('api', 'css', 'js', 'images', 'index', 'profile', 'profiles', 'request', 'requests',
                       'reel', 'messages', 'store', 'search', 'settings', 'admin', 'glares',
                       'about', 'help', 'login', 'signup', 'explore', 'dist', 'functions', 'www') then
    base_username := base_username || '_';
  end if;
  candidate := base_username;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;
  insert into public.profiles (id, username)
  values (new.id, candidate);
  return new;
end;
$$;
