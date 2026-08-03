-- Graph processing jobs for Neo4j hybrid pipeline (Build 1).
-- Job table is source of truth; stories.graph_status is denormalized for admin lists.

alter table public.stories
  add column if not exists graph_status text,
  add column if not exists neo4j_element_id text;

alter table public.stories
  drop constraint if exists stories_graph_status_check;

alter table public.stories
  add constraint stories_graph_status_check
  check (
    graph_status is null
    or graph_status in (
      'pending',
      'running',
      'succeeded',
      'failed',
      'quarantined',
      'cancelled'
    )
  );

comment on column public.stories.graph_status is
  'Denormalized Neo4j graph job status; authoritative rows live in graph_processing_jobs.';
comment on column public.stories.neo4j_element_id is
  'Neo4j element id for the Story node when known.';

create table if not exists public.graph_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (story_id) on delete cascade,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'running',
        'succeeded',
        'failed',
        'quarantined',
        'cancelled'
      )
    ),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  error text,
  neo4j_story_element_id text,
  schema_version text,
  extractor_version text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists graph_processing_jobs_status_created_idx
  on public.graph_processing_jobs (status, created_at);

create index if not exists graph_processing_jobs_story_id_created_idx
  on public.graph_processing_jobs (story_id, created_at desc);

create table if not exists public.graph_processing_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.graph_processing_jobs (id) on delete cascade,
  attempt_number integer not null,
  worker_id text,
  status text not null
    check (
      status in ('running', 'succeeded', 'failed', 'quarantined')
    ),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  duration_ms integer,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists graph_processing_attempts_job_id_idx
  on public.graph_processing_attempts (job_id, attempt_number);

comment on table public.graph_processing_jobs is
  'Queue/state for Neo4j graph-worker jobs. Do not mirror the Neo4j graph here.';
comment on table public.graph_processing_attempts is
  'Per-attempt log for graph_processing_jobs (model, tokens, errors).';

alter table public.graph_processing_jobs enable row level security;
alter table public.graph_processing_attempts enable row level security;

create policy "Service role full access graph_processing_jobs"
  on public.graph_processing_jobs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role full access graph_processing_attempts"
  on public.graph_processing_attempts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Atomic claim: mark up to p_limit pending jobs as running for this worker.
create or replace function public.claim_graph_processing_jobs(
  p_worker_id text,
  p_limit integer default 1
)
returns setof public.graph_processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  return query
  with picked as (
    select j.id
    from public.graph_processing_jobs j
    where j.status = 'pending'
    and not exists (
      select 1
      from public.graph_processing_jobs r
      where r.story_id = j.story_id
        and r.status = 'running'
    )
    order by j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 20))
  ),
  updated as (
    update public.graph_processing_jobs j
    set
      status = 'running',
      locked_at = now(),
      locked_by = p_worker_id,
      started_at = now(),
      attempt_count = j.attempt_count + 1,
      updated_at = now(),
      error = null
    from picked
    where j.id = picked.id
    returning j.*
  )
  select * from updated;
end;
$$;

comment on function public.claim_graph_processing_jobs(text, integer) is
  'Atomically claims pending graph_processing_jobs for a worker (FOR UPDATE SKIP LOCKED).';

revoke all on function public.claim_graph_processing_jobs(text, integer) from public;
grant execute on function public.claim_graph_processing_jobs(text, integer) to service_role;

-- Atomic enqueue (insert pending, cancel siblings, optional stale-lock clear).
create or replace function public.enqueue_graph_processing_job(
  p_story_id uuid,
  p_schema_version text,
  p_extractor_version text,
  p_force_stale boolean default false,
  p_stale_after_minutes integer default 360
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_running record;
  v_new_id uuid;
begin
  if p_story_id is null then
    raise exception 'p_story_id is required';
  end if;

  -- Serialize enqueue vs claim for this story within the transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_story_id::text, 0));

  -- Lock existing queue rows so claim cannot promote them mid-enqueue.
  perform 1
  from public.graph_processing_jobs
  where story_id = p_story_id
    and status in ('pending', 'running')
  for update;

  for v_running in
    select id, locked_at
    from public.graph_processing_jobs
    where story_id = p_story_id
      and status = 'running'
  loop
    if p_force_stale
       and v_running.locked_at is not null
       and v_running.locked_at < (now() - make_interval(mins => greatest(p_stale_after_minutes, 1)))
    then
      update public.graph_processing_jobs
      set
        status = 'failed',
        error = 'Stale running lock cleared on force re-enqueue',
        locked_at = null,
        locked_by = null,
        finished_at = now(),
        updated_at = now()
      where id = v_running.id
        and status = 'running';
    else
      return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'running');
    end if;
  end loop;

  insert into public.graph_processing_jobs (
    story_id,
    status,
    schema_version,
    extractor_version
  )
  values (
    p_story_id,
    'pending',
    p_schema_version,
    p_extractor_version
  )
  returning id into v_new_id;

  update public.graph_processing_jobs
  set
    status = 'cancelled',
    updated_at = now()
  where story_id = p_story_id
    and status = 'pending'
    and id <> v_new_id;

  update public.stories
  set graph_status = 'pending'
  where story_id = p_story_id;

  return jsonb_build_object('ok', true, 'skipped', false, 'job_id', v_new_id);
end;
$$;

comment on function public.enqueue_graph_processing_job(uuid, text, text, boolean, integer) is
  'Atomically enqueue a graph_processing_jobs row for a story (service_role only).';

revoke all on function public.enqueue_graph_processing_job(uuid, text, text, boolean, integer) from public;
grant execute on function public.enqueue_graph_processing_job(uuid, text, text, boolean, integer) to service_role;
