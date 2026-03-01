-- Pending subtopic governance: proposed new subtopics awaiting approval.

set search_path = public, extensions;

create table if not exists public.pending_subtopics (
  pending_id uuid primary key default gen_random_uuid(),
  proposed_name text not null,
  suggested_topic_id uuid references public.topics(topic_id) on delete set null,
  example_position_id uuid references public.canonical_positions(canonical_position_id) on delete set null,
  excerpt_text text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decision_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.pending_subtopics is 'Proposed new subtopics from assign_ranked_subtopics when none fit.';

create table if not exists public.position_pending_subtopics (
  canonical_position_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  pending_id uuid not null references public.pending_subtopics(pending_id) on delete cascade,
  primary key (canonical_position_id, pending_id)
);

comment on table public.position_pending_subtopics is 'Links positions to proposed subtopics awaiting approval.';

create index if not exists idx_pending_subtopics_status on public.pending_subtopics(status);
create index if not exists idx_position_pending_subtopics_position on public.position_pending_subtopics(canonical_position_id);

alter table public.pending_subtopics enable row level security;
alter table public.position_pending_subtopics enable row level security;

create policy "Public read pending_subtopics" on public.pending_subtopics for select using (true);
create policy "Public read position_pending_subtopics" on public.position_pending_subtopics for select using (true);
