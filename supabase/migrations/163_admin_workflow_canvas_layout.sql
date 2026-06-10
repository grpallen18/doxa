-- Global Agent Flow canvas node positions (shared across all stories and admins).

create table public.admin_workflow_canvas_layout (
  id text primary key default 'global' check (id = 'global'),
  positions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.admin_workflow_canvas_layout is
  'Singleton row storing global React Flow node positions for /admin/stories/[id]/agent-flow.';

comment on column public.admin_workflow_canvas_layout.positions is
  'Map of node id -> { x, y } coordinates.';

insert into public.admin_workflow_canvas_layout (id, positions)
values ('global', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.admin_workflow_canvas_layout enable row level security;
