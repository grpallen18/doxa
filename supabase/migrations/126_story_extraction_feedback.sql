-- Human review signals for story extraction QA (admin UI).

set search_path = public, extensions;

create table if not exists public.story_extraction_feedback (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(story_id) on delete cascade,
  entity_type text not null check (entity_type in ('claim', 'evidence', 'position', 'event', 'relationship')),
  entity_id uuid,
  relationship_type text,
  relationship_source_id uuid,
  relationship_target_id uuid,
  rating text not null check (rating in ('like', 'dislike')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.story_extraction_feedback is
  'Admin QA feedback on extracted story entities and links; passive dataset for future eval/prompt tuning.';

create index if not exists idx_story_extraction_feedback_story_id
  on public.story_extraction_feedback(story_id);

create index if not exists idx_story_extraction_feedback_entity
  on public.story_extraction_feedback(story_id, entity_type, entity_id);

alter table public.story_extraction_feedback enable row level security;
