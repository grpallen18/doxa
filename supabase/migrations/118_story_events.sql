-- Story-level event tables. FK to events (117_canonical_events.sql).

set search_path = public, extensions;

create table if not exists public.story_events (
  story_event_id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(story_id) on delete cascade,
  event_summary text not null,
  extraction_confidence numeric not null,
  event_id uuid references public.events(event_id) on delete set null,
  primary_actor text,
  action text,
  object text,
  event_date date,
  event_timeframe_start date,
  event_timeframe_end date,
  location text,
  event_type text,
  embedding vector(1536),
  run_id uuid references public.pipeline_runs(run_id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.story_events is 'Extracted factual occurrences per story; linked to events when canonicalized.';
comment on column public.story_events.event_summary is 'Self-contained description of who did what, when/where.';

create index if not exists idx_story_events_story_id on public.story_events(story_id);
create index if not exists idx_story_events_event_id on public.story_events(event_id) where event_id is not null;

create table if not exists public.story_event_evidence (
  story_event_id uuid not null references public.story_events(story_event_id) on delete cascade,
  evidence_id uuid not null references public.story_evidence(evidence_id) on delete cascade,
  primary key (story_event_id, evidence_id)
);

comment on table public.story_event_evidence is 'Evidence grounding that an event was described in the article.';

create index if not exists idx_story_event_evidence_event on public.story_event_evidence(story_event_id);
create index if not exists idx_story_event_evidence_evidence on public.story_event_evidence(evidence_id);

create table if not exists public.story_event_claims (
  story_event_id uuid not null references public.story_events(story_event_id) on delete cascade,
  story_claim_id uuid not null references public.story_claims(story_claim_id) on delete cascade,
  relation_type text not null check (relation_type in ('about', 'describes', 'disputes', 'causes')),
  primary key (story_event_id, story_claim_id, relation_type)
);

comment on table public.story_event_claims is 'Claims asserting facts about a story event.';

create index if not exists idx_story_event_claims_event on public.story_event_claims(story_event_id);
create index if not exists idx_story_event_claims_claim on public.story_event_claims(story_claim_id);

create table if not exists public.story_event_positions (
  story_event_id uuid not null references public.story_events(story_event_id) on delete cascade,
  story_position_id uuid not null references public.story_positions(story_position_id) on delete cascade,
  relation_type text not null check (relation_type in ('about', 'interprets', 'responds_to', 'context_for')),
  primary key (story_event_id, story_position_id, relation_type)
);

comment on table public.story_event_positions is 'Positions arguing about or contextualizing a story event.';

create index if not exists idx_story_event_positions_event on public.story_event_positions(story_event_id);
create index if not exists idx_story_event_positions_position on public.story_event_positions(story_position_id);

alter table public.story_events enable row level security;
alter table public.story_event_evidence enable row level security;
alter table public.story_event_claims enable row level security;
alter table public.story_event_positions enable row level security;

create policy "Public read story_events" on public.story_events for select using (true);
create policy "Public read story_event_evidence" on public.story_event_evidence for select using (true);
create policy "Public read story_event_claims" on public.story_event_claims for select using (true);
create policy "Public read story_event_positions" on public.story_event_positions for select using (true);
