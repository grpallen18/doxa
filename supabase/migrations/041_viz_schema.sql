-- Living Atlas visualization schema: viz_maps, viz_nodes, viz_edges.
-- Layout is deterministic (computed server-side); coordinates stored per map.

create type viz_scope_type as enum ('global', 'topic', 'thesis');
create type viz_entity_type as enum ('thesis', 'claim', 'story_claim');
create type viz_edge_type as enum ('explicit', 'similarity', 'opposition');

-- viz_maps: Atlas scope definition (e.g. "Topic: Immigration – 90 Days")
create table public.viz_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_type viz_scope_type not null,
  scope_id uuid,
  time_window_days int,
  created_at timestamptz not null default now()
);

comment on table public.viz_maps is 'Atlas map scope; one row per generated map.';
comment on column public.viz_maps.scope_id is 'topic_id or thesis_id depending on scope_type.';

create unique index idx_viz_maps_scope on public.viz_maps(scope_type, scope_id) where scope_id is not null;

-- viz_nodes: Deterministic layout per map
create table public.viz_nodes (
  map_id uuid not null references public.viz_maps(id) on delete cascade,
  entity_type viz_entity_type not null,
  entity_id uuid not null,
  x float not null,
  y float not null,
  layer int not null default 1,
  size float not null default 1.0,
  polarity_score float,
  source_count int,
  story_count int,
  velocity_7d float,
  drift_seed float not null default 0,
  primary key (map_id, entity_type, entity_id)
);

comment on table public.viz_nodes is 'Layout coordinates per map; layer controls zoom visibility.';
comment on column public.viz_nodes.drift_seed is 'Deterministic float for subtle animation.';

-- viz_edges: Edges between nodes in a map
create table public.viz_edges (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.viz_maps(id) on delete cascade,
  source_type viz_entity_type not null,
  source_id uuid not null,
  target_type viz_entity_type not null,
  target_id uuid not null,
  edge_type viz_edge_type not null,
  weight float not null default 1.0,
  similarity_score float
);

create index idx_viz_edges_map_id on public.viz_edges(map_id);
create index idx_viz_nodes_map_id on public.viz_nodes(map_id);

-- RLS
alter table public.viz_maps enable row level security;
alter table public.viz_nodes enable row level security;
alter table public.viz_edges enable row level security;

create policy "Public read viz_maps" on public.viz_maps for select using (true);
create policy "Public read viz_nodes" on public.viz_nodes for select using (true);
create policy "Public read viz_edges" on public.viz_edges for select using (true);
