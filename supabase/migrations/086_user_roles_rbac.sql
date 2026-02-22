-- Role-based access control: add role to users, trigger for new signups, auth hook support.
create type public.app_role as enum ('user', 'admin');

alter table public.users
  add column if not exists role public.app_role not null default 'user';

comment on column public.users.role is 'Application role. New users default to user; elevate manually to admin.';

-- Backfill: create public.users for any auth.users that don't have one yet
insert into public.users (id, role)
select au.id, 'user'
from auth.users au
where not exists (select 1 from public.users u where u.id = au.id)
on conflict (id) do nothing;

-- Ensure new auth.users get a public.users row with role=user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auth hook needs to read users.role; grant access to supabase_auth_admin
grant usage on schema public to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;

-- Custom access token hook: add user_role claim to JWT
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role public.app_role;
begin
  select u.role into user_role
  from public.users u
  where u.id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if user_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  else
    claims := jsonb_set(claims, '{user_role}', 'null');
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

comment on function public.custom_access_token_hook(jsonb) is 'Auth hook: adds user_role from public.users to JWT. Enable in Dashboard: Auth > Hooks > Customize Access Token.';
