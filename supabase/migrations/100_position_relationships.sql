-- Position relationships: LLM-classified relation and alignment between canonical positions.
-- Used by build_debate_topology for union-find (agreements) and conflict discovery (controversies).

set search_path = public, extensions;

-- Enum types for relation and alignment
do $$
begin
  if not exists (select 1 from pg_type where typname = 'position_relation') then
    create type public.position_relation as enum ('direct', 'indirect', 'orthogonal', 'none');
  end if;
  if not exists (select 1 from pg_type where typname = 'position_alignment') then
    create type public.position_alignment as enum ('agree', 'conflict', 'independent', 'unclear');
  end if;
end $$;

create table if not exists public.position_relationships (
  position_a_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  position_b_id uuid not null references public.canonical_positions(canonical_position_id) on delete cascade,
  relation public.position_relation not null,
  alignment public.position_alignment not null,
  classified_at timestamptz not null default now(),
  confidence numeric,
  run_id uuid references public.pipeline_runs(run_id) on delete set null,
  model text,
  rationale text,
  primary key (position_a_id, position_b_id),
  check (position_a_id < position_b_id)
);

comment on table public.position_relationships is 'LLM-classified relation/alignment between canonical positions. direct/indirect + agree = coalition; direct/indirect + conflict = controversy edge.';
comment on column public.position_relationships.relation is 'direct: same decision; indirect: bears on; orthogonal: same topic diff prop; none: unrelated.';
comment on column public.position_relationships.alignment is 'agree/conflict only when relation in (direct, indirect).';

create index if not exists idx_position_relationships_a on public.position_relationships(position_a_id);
create index if not exists idx_position_relationships_b on public.position_relationships(position_b_id);

alter table public.position_relationships enable row level security;
create policy "Public read position_relationships" on public.position_relationships for select using (true);
