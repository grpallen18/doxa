-- Allow public read for draft topics so they appear on Browse topics and topic pages.
-- Draft topics are created but not yet processed; admins need to view them.

drop policy if exists "Public read access to topics" on public.topics;

create policy "Public read access to topics" on public.topics
  for select using (status in ('draft', 'under_review', 'stable', 'published'));
