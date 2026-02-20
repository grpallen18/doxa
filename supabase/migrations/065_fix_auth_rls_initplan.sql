-- Fix Auth RLS initplan (performance advisor 0003).
-- Replace auth.uid() with (select auth.uid()) so it's evaluated once per query, not per row.
-- Guest (anonymous sign-in) users still work: they have a valid auth.uid() from signInAnonymously().

drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;

create policy "Users can read own profile" on public.users
  for select using ((select auth.uid()) = id);

create policy "Users can update own profile" on public.users
  for update using ((select auth.uid()) = id);
