# Agent directory layout

Human-edited convention for `doxa-agents/departments/`. The catalog (`manifest.yaml`) is generated from handlers and SQL; this doc is the source of truth for **folder structure and READMEs**.

## Hierarchy

```text
doxa-agents/
├── AGENTS.md                 # Pipeline overview + links here
├── activation.yaml           # Which steps are "active" in the catalog
├── manifest.yaml             # AUTO-GENERATED — do not edit
├── librarian/                # Catalog sync (not a pipeline agent)
├── departments/
│   └── <NN-department>/
│       ├── README.md         # Required — department summary + how agents work together
│       ├── <NN-step-id>/     # Flat agent (single step at department root)
│       │   ├── README.md     # Required — agent purpose + deploy notes
│       │   ├── handler.ts
│       │   └── schedule.sql  # optional
│       ├── schedules.sql     # optional — shared crons at department root
│       └── <workflow>/       # Multi-step workflow (when grouping adds value)
│           ├── README.md     # Required — workflow purpose + step table
│           └── <NN-step-id>/
│               ├── handler.ts
│               └── schedule.sql
├── lib/
└── docs/
    └── generated/            # AUTO-GENERATED
```

Use **flat agents** when a workflow folder would only wrap a single step (e.g. `02-chunking-engine/01-chunk-story-bodies`). Use a **workflow folder** when several related steps share a pipeline stage and benefit from a shared README (e.g. `05-business-operations/maintenance/` with purge/cleanup scripts).

## Naming rules

| Level | Folder pattern | Catalog id | Example |
|-------|----------------|------------|---------|
| Department | `NN-name` | — | `02-chunking-engine` |
| Flat agent | `NN-step-id` | `step-id` (prefix stripped) | `01-chunk-story-bodies` → `chunk-story-bodies` |
| Workflow | `NN-name` or short name | — | `maintenance` |
| Step (nested) | `NN-step-id` | `step-id` (prefix stripped) | `01-purge-drop-stories` → `purge-drop-stories` |
| Deploy | — | `deploy_name` in manifest | `extract_story_entities` |

- **Step prefix** (`01-`, `02-`, …) = run order **within the department** (flat agents) or **within the workflow** (nested steps).
- **Deploy name** = Supabase Edge Function folder under `supabase/functions/` (snake_case).

## Required READMEs

Every **department** must contain `README.md`. Every **flat agent** and **workflow** folder must contain `README.md`. Nested step folders do not need their own README; document those steps in the workflow README.

Flat agent READMEs should include:

1. One-line purpose
2. Deploy name, schedule, and output tables when relevant
3. Upstream/downstream links to related agents

Workflow READMEs should include:

1. One-line purpose
2. Table: step id, link to step folder, deploy name, brief notes
3. Upstream/downstream links when helpful

Department READMEs should include:

1. One-line purpose
2. Links to flat agents and workflow READMEs
3. The generated `<!-- AGENTS:BEGIN -->` step table (maintained by `npm run agents:docs`)

## Adding a new flat agent

1. Create `departments/<department>/<NN-step-id>/handler.ts` (+ optional `schedule.sql` + `README.md`).
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Update the **department** `README.md` agent list.
4. Run `npm run agents:refresh`.
5. When going live: `activation.yaml`, deploy, run SQL in Supabase.

## Adding a new step (nested workflow)

1. Create `departments/<department>/<workflow>/<NN-step-id>/handler.ts` (+ optional `schedule.sql`).
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Update the **workflow** `README.md` step table.
4. Run `npm run agents:refresh`.
5. When going live: `activation.yaml`, deploy, run SQL in Supabase.

## Adding a new workflow

1. Create `departments/<department>/<workflow>/README.md` before or with the first step.
2. Follow the nested step/stub/refresh flow as above.

Validation: `npm run agents:validate` fails if any department, flat agent, or workflow referenced in `manifest.yaml` is missing a README.
