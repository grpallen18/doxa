-- Immutable claim versions for chunk claims QA lane + active pointer on story_chunks.

set search_path = public, extensions;

create table if not exists public.chunk_claim_versions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null,
  chunk_index int not null,
  version_number int not null,
  source text not null check (source in ('extractor', 'refiner')),
  parent_version_id uuid references public.chunk_claim_versions (id) on delete set null,
  created_from_review_artifact_id uuid references public.story_extraction_qa_artifacts (id) on delete set null,
  claims_json jsonb not null,
  review_outcome text check (
    review_outcome is null
    or review_outcome in ('passed', 'needs_refinement', 'needs_human_review')
  ),
  run_id uuid references public.pipeline_runs (run_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chunk_claim_versions_story_chunk_fk
    foreign key (story_id, chunk_index)
    references public.story_chunks (story_id, chunk_index)
    on delete cascade,
  constraint chunk_claim_versions_story_chunk_version_unique
    unique (story_id, chunk_index, version_number)
);

create index if not exists idx_chunk_claim_versions_story_chunk
  on public.chunk_claim_versions (story_id, chunk_index, version_number);

comment on table public.chunk_claim_versions is
  'Immutable claims-only extraction versions per chunk (v0 extractor, v1+ refiner).';

alter table public.story_chunks
  add column if not exists active_claim_version_id uuid;

alter table public.story_chunks
  drop constraint if exists story_chunks_active_claim_version_id_fkey;

alter table public.story_chunks
  add constraint story_chunks_active_claim_version_id_fkey
    foreign key (active_claim_version_id)
    references public.chunk_claim_versions (id)
    on delete set null;

comment on column public.story_chunks.active_claim_version_id is
  'Active claims version for QA, merge, and admin UI; extraction_json mirrors this version.';

alter table public.story_extraction_qa_artifacts
  add column if not exists claim_version_id uuid,
  add column if not exists input_claim_version_id uuid,
  add column if not exists output_claim_version_id uuid,
  add column if not exists reverted_at timestamptz;

alter table public.story_extraction_qa_artifacts
  drop constraint if exists story_extraction_qa_artifacts_claim_version_id_fkey;

alter table public.story_extraction_qa_artifacts
  add constraint story_extraction_qa_artifacts_claim_version_id_fkey
    foreign key (claim_version_id)
    references public.chunk_claim_versions (id)
    on delete set null;

alter table public.story_extraction_qa_artifacts
  drop constraint if exists story_extraction_qa_artifacts_input_claim_version_id_fkey;

alter table public.story_extraction_qa_artifacts
  add constraint story_extraction_qa_artifacts_input_claim_version_id_fkey
    foreign key (input_claim_version_id)
    references public.chunk_claim_versions (id)
    on delete set null;

alter table public.story_extraction_qa_artifacts
  drop constraint if exists story_extraction_qa_artifacts_output_claim_version_id_fkey;

alter table public.story_extraction_qa_artifacts
  add constraint story_extraction_qa_artifacts_output_claim_version_id_fkey
    foreign key (output_claim_version_id)
    references public.chunk_claim_versions (id)
    on delete set null;

alter table public.chunk_claim_versions enable row level security;

create policy "Public read chunk_claim_versions"
  on public.chunk_claim_versions for select using (true);

-- Backfill v0 from extraction_json and optional refine chain from artifacts.
do $$
declare
  v_chunk record;
  v_v0_id uuid;
  v_parent_id uuid;
  v_version_num int;
  v_refine record;
  v_active_id uuid;
begin
  for v_chunk in
    select sc.story_id, sc.chunk_index, sc.extraction_json
    from public.story_chunks sc
    where sc.extraction_json is not null
      and not exists (
        select 1
        from public.chunk_claim_versions ccv
        where ccv.story_id = sc.story_id
          and ccv.chunk_index = sc.chunk_index
      )
  loop
    insert into public.chunk_claim_versions (
      story_id,
      chunk_index,
      version_number,
      source,
      claims_json
    )
    values (
      v_chunk.story_id,
      v_chunk.chunk_index,
      0,
      'extractor',
      v_chunk.extraction_json
    )
    returning id into v_v0_id;

    v_parent_id := v_v0_id;
    v_version_num := 0;

    for v_refine in
      select a.id, a.output_snapshot, a.run_id, a.created_at
      from public.story_extraction_qa_artifacts a
      where a.story_id = v_chunk.story_id
        and a.chunk_index = v_chunk.chunk_index
        and a.stage = 'chunk_refine_claims'
        and a.output_snapshot is not null
      order by a.created_at asc
    loop
      v_version_num := v_version_num + 1;

      insert into public.chunk_claim_versions (
        story_id,
        chunk_index,
        version_number,
        source,
        parent_version_id,
        claims_json,
        run_id
      )
      values (
        v_chunk.story_id,
        v_chunk.chunk_index,
        v_version_num,
        'refiner',
        v_parent_id,
        v_refine.output_snapshot,
        v_refine.run_id
      )
      returning id into v_parent_id;

      update public.story_extraction_qa_artifacts a
      set
        input_claim_version_id = (
          select ccv.id
          from public.chunk_claim_versions ccv
          where ccv.story_id = v_chunk.story_id
            and ccv.chunk_index = v_chunk.chunk_index
            and ccv.version_number = v_version_num - 1
        ),
        output_claim_version_id = v_parent_id
      where a.id = v_refine.id;
    end loop;

    select ccv.id
    into v_active_id
    from public.chunk_claim_versions ccv
    where ccv.story_id = v_chunk.story_id
      and ccv.chunk_index = v_chunk.chunk_index
    order by ccv.version_number desc
    limit 1;

    update public.story_chunks sc
    set active_claim_version_id = v_active_id
    where sc.story_id = v_chunk.story_id
      and sc.chunk_index = v_chunk.chunk_index;

    update public.story_extraction_qa_artifacts a
    set claim_version_id = v_v0_id
    where a.story_id = v_chunk.story_id
      and a.chunk_index = v_chunk.chunk_index
      and a.stage = 'chunk_extract_claims';

    update public.story_extraction_qa_artifacts a
    set claim_version_id = (
      select ccv.id
      from public.chunk_claim_versions ccv
      where ccv.story_id = v_chunk.story_id
        and ccv.chunk_index = v_chunk.chunk_index
        and ccv.version_number = 0
    )
    where a.story_id = v_chunk.story_id
      and a.chunk_index = v_chunk.chunk_index
      and a.stage = 'chunk_review_claims'
      and a.claim_version_id is null;
  end loop;
end;
$$;
