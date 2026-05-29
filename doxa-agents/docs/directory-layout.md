# Agent directory layout

Human-edited convention for `doxa-agents/divisions/`. The catalog (`manifest.yaml`) is generated from handlers and SQL; this doc is the source of truth for **folder structure and READMEs**.

## Hierarchy

```text
doxa-agents/
├── AGENTS.md                 # Pipeline overview + links here
├── activation.yaml           # Which steps are "active" in the catalog
├── manifest.yaml             # AUTO-GENERATED — do not edit
├── divisions/
│   └── <NN-division>/
│       ├── README.md         # Required — division summary + generated step table
│       └── <NN-workflow>/    # or named workflow (e.g. atlas, maintenance)
│           ├── README.md     # Required — workflow purpose + step table
│           └── <NN-step-id>/
│               ├── handler.ts
│               └── schedule.sql   # optional; schedules.sql at workflow level for shared crons
├── lib/
└── docs/
    └── generated/            # AUTO-GENERATED
```

## Naming rules

| Level | Folder pattern | Catalog id | Example |
|-------|----------------|------------|---------|
| Division | `NN-name` | — | `02-processing-engine` |
| Workflow | `NN-name` or short name | — | `02-story-extraction`, `maintenance` |
| Step | `NN-step-id` | `step-id` (prefix stripped) | `01-extract-story-entities` → `extract-story-entities` |
| Deploy | — | `deploy_name` in manifest | `extract_story_entities` |

- **Step prefix** (`01-`, `02-`, …) = run order **within the workflow**.
- **Workflow prefix** = run order **within the division** (when numbered).
- **Deploy name** = Supabase Edge Function folder under `supabase/functions/` (snake_case).

## Required READMEs

Every **division** and **workflow** folder must contain `README.md`. Step folders do not need their own README; document steps in the workflow README.

Workflow READMEs should include:

1. One-line purpose
2. Table: step id, link to step folder, deploy name, brief notes
3. Upstream/downstream links to related workflows when helpful

Division READMEs should include:

1. One-line purpose
2. Links to workflow READMEs
3. The generated `<!-- AGENTS:BEGIN -->` step table (maintained by `npm run agents:docs`)

## Why workflow READMEs matter

VS Code/Cursor **compact folders** when a directory has only one child. A workflow README (sibling to step folders) keeps the explorer tree expanded so humans see `workflow → step` nesting.

## Adding a new step

1. Create `divisions/<division>/<workflow>/<NN-step-id>/handler.ts` (+ optional `schedule.sql`).
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Update the **workflow** `README.md` step table.
4. Run `npm run agents:refresh`.
5. When going live: `activation.yaml`, deploy, run SQL in Supabase.

## Adding a new workflow

1. Create `divisions/<division>/<workflow>/README.md` before or with the first step.
2. Follow the same step/stub/refresh flow as above.

Validation: `npm run agents:validate` fails if any division or workflow referenced in `manifest.yaml` is missing a README.
