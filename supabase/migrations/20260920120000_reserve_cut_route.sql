-- /cut is a page now (The Cut — the pass/keep deck), so the name has to join
-- the reserved list. Without this someone could take "cut" as a username and
-- their profile link would be shadowed by the page forever.

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
                          'cut', 'about', 'help', 'login', 'signup', 'explore', 'dist', 'functions', 'www') then
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
                       'reel', 'messages', 'store', 'store-item', 'search', 'settings', 'admin', 'glares',
                       'cut', 'about', 'help', 'login', 'signup', 'explore', 'dist', 'functions', 'www') then
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
