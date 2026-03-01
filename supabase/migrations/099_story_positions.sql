-- Story-level position tables. FK to canonical_positions (098).

set search_path = public, extensions;
-- All reference stories(story_id) with ON DELETE CASCADE so purge_drop_stories cascades.

-- story_positions: extracted positions per story, linked to canonical when matched
create table if not exists public.story_positions (
  story_position_id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(story_id) on delete cascade,
  raw_text text not null,
  extraction_confidence numeric not null,
  canonical_position_id uuid references public.canonical_positions(canonical_position_id) on delete set null,
  embedding vector(1536),
  run_id uuid references public.pipeline_runs(run_id) on delete set null,
  excerpt_text text,
  cue_phrases jsonb default '[]'::jsonb,
  speaker_type text check (speaker_type in ('narrator', 'quoted', 'critics', 'supporters')),
  created_at timestamptz not null default now()
);

comment on table public.story_positions is 'Extracted positions per story; linked to canonical_positions when matched.';
comment on column public.story_positions.excerpt_text is 'Cited span from chunk justifying the position.';
comment on column public.story_positions.cue_phrases is 'Phrases that justify inferred position (e.g. warned, praised, critics called).';

create index if not exists idx_story_positions_story_id on public.story_positions(story_id);
create index if not exists idx_story_positions_canonical on public.story_positions(canonical_position_id) where canonical_position_id is not null;

-- story_position_claims: which claims support this position in this story
create table if not exists public.story_position_claims (
  story_position_id uuid not null references public.story_positions(story_position_id) on delete cascade,
  story_claim_id uuid not null references public.story_claims(story_claim_id) on delete cascade,
  primary key (story_position_id, story_claim_id)
);

comment on table public.story_position_claims is 'Links story positions to supporting claims.';

create index if not exists idx_story_position_claims_position on public.story_position_claims(story_position_id);
create index if not exists idx_story_position_claims_claim on public.story_position_claims(story_claim_id);

-- story_position_evidence: which evidence supports this position
create table if not exists public.story_position_evidence (
  story_position_id uuid not null references public.story_positions(story_position_id) on delete cascade,
  evidence_id uuid not null references public.story_evidence(evidence_id) on delete cascade,
  primary key (story_position_id, evidence_id)
);

comment on table public.story_position_evidence is 'Links story positions to supporting evidence.';

create index if not exists idx_story_position_evidence_position on public.story_position_evidence(story_position_id);
create index if not exists idx_story_position_evidence_evidence on public.story_position_evidence(evidence_id);

-- RLS
alter table public.story_positions enable row level security;
alter table public.story_position_claims enable row level security;
alter table public.story_position_evidence enable row level security;

create policy "Public read story_positions" on public.story_positions for select using (true);
create policy "Public read story_position_claims" on public.story_position_claims for select using (true);
create policy "Public read story_position_evidence" on public.story_position_evidence for select using (true);
