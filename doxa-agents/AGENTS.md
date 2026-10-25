# Doxa Agents

Pipeline agents for ingesting stories, building a Neo4j evidence graph, and assembling debate topology (L3) across stories.

## Pipeline layers

```text
01 Ingestion          → stories + clean bodies → enqueue graph job
04 Graph engine       → enqueue / trigger Python utterance graph-worker → AuraDB
06 Debate engine      → bind/enqueue → Grok L3 (MCP) → apply proposals → project graph_*
07 Analysis engine    → evidence checks, citations, person profiles
05 Ops                → health, maintenance, graph hygiene
```

Claims extract/merge, canonical linkers, and SQL topology (`02-chunking-engine`, `03-merging-engine`, `departments/legacy`) were **deleted** in Build 4 (migrations `197`/`198`). See [docs/architecture/neo4j-overhaul-next.md](docs/architecture/neo4j-overhaul-next.md).

**Steering document:** [docs/architecture/neo4j-graph-architecture.md](docs/architecture/neo4j-graph-architecture.md)  
**Next phases:** [docs/architecture/neo4j-overhaul-next.md](docs/architecture/neo4j-overhaul-next.md)  
**Phase 0 validation:** [docs/architecture/phase0-validation.md](docs/architecture/phase0-validation.md)  
**Phase 1 validation:** [docs/architecture/phase1-validation.md](docs/architecture/phase1-validation.md)

**Admin runnable catalog:** story-scoped **ingestion + graph enqueue/trigger**; global **debate**, **analysis**, and **hygiene** stages. Custom claims extract/review/merge was **deleted** — the Python graph-worker is the discourse path.

**Admin agent records:** `/admin/agents/[stepId]` — profile + runs. The prompt store UI is wired but overlay steps are `prompt_kind: none` and `loadActivePrompt` is unused. Graph-worker / Grok prompts are **not** in that store. Runbook: [docs/agent-prompt-store.md](../docs/agent-prompt-store.md).

**Important:** Controversy topology is the product surface; Neo4j is the discourse substrate. Phase 0–2a write Utterances → Propositions/Entities → Arguments in the graph-worker. Cross-document Viewpoint / Controversy / Dispute assembly is the Edge `debate_pipeline`.

**L3 direction (2026-08):** Three Grok teams (provenance, debate, ingestion). Product debate **paused** during rebuild. Read [docs/grok-bot-architecture.md](docs/grok-bot-architecture.md) before changing debate-pipeline handlers.

## What you edit manually

| Responsibility | Where |
|----------------|--------|
| Agent logic | `departments/**/handler.ts` |
| Cron schedules | `schedule.sql` / `schedules.sql` |
| Turn workflows on (catalog) | [activation.yaml](activation.yaml) |
| Secret **values** | Supabase / Cloudflare dashboards |
| Schema | `supabase/migrations/` |
| Deploy | `supabase functions deploy ...` |
| Schedule crons in DB | Run `schedule.sql` in Supabase SQL Editor |

**Do not edit [manifest.yaml](manifest.yaml)** — auto-generated (`npm run agents:sync`).

## Auto-generated docs

- [manifest.yaml](manifest.yaml)
- [docs/generated/cron-jobs.md](docs/generated/cron-jobs.md)
- [docs/generated/pipeline-graph.md](docs/generated/pipeline-graph.md)
- [docs/generated/deploy.md](docs/generated/deploy.md)
- [docs/generated/secrets.md](docs/generated/secrets.md)
- [docs/generated/purge-engine.md](docs/generated/purge-engine.md) — from [ops/purge-engine-tables.yaml](ops/purge-engine-tables.yaml)
- [docs/generated/pipeline-catalog.md](docs/generated/pipeline-catalog.md) — from [ops/pipeline-admin-catalog.yaml](ops/pipeline-admin-catalog.yaml) (admin UI stages)

```bash
npm run agents:refresh   # sync manifest + docs + purge_engine_data() + validate
```

**Engine reset:** `SELECT public.purge_engine_data();` — see purge-engine doc. Edit `ops/purge-engine-tables.yaml` when adding pipeline tables; refresh regenerates `supabase/routines/purge_engine_data.sql`.

**Single-record testing:** [docs/pipeline-test-params.md](docs/pipeline-test-params.md) — optional `story_id` (ingest/graph) or debate/analysis fields (`limit`, `question_uid`, `dry_run`, …). Fixture story documented there.

## Departments

| Department | Path | Purpose |
|------------|------|---------|
| 01 Ingestion | [departments/01-ingestion-engine](departments/01-ingestion-engine) | NewsAPI, relevance, scrape, clean → enqueue graph job |
| 04 Graph | [departments/04-graph-engine](departments/04-graph-engine) | Enqueue / trigger Neo4j graph worker |
| 06 Debate | [departments/06-debate-engine](departments/06-debate-engine) | Bind candidates, L3 proposals, qualify, project `graph_*` |
| 07 Analysis | [departments/07-analysis-engine](departments/07-analysis-engine) | Evidence checks, citations, person profiles |
| 05 Business operations | [departments/05-business-operations](departments/05-business-operations) | Health, maintenance, graph hygiene |

### 04 Graph (Phase 0+1+2a)

**Path:** `clean-scraped-content` enqueues `graph_processing_jobs` → Python [`services/graph-worker`](../services/graph-worker/) → Neo4j AuraDB (Document / Utterance / Proposition / Argument). Manual: `enqueue-graph-job` (optional `trigger-graph-worker` wake). Admin explorer: [docs/admin-neo-explorer.md](../docs/admin-neo-explorer.md).

### 06 Debate / 07 Analysis

**Path:** hourly `debate_pipeline` (`15 * * * *`, limit 500) binds candidates, applies approved proposals, qualifies controversies, and projects Postgres. **Grok** (xAI MCP) owns curator / editor / auditor judgment; Edge `run_l3_*` crons are **unscheduled** (manual invoke only). After bootstrap (≥30 `graph_questions`, or `L3_BOOTSTRAP=false`), the orchestrator **skips** `detect_contrast_seeds` so Grok mint is the only question source. Explore reads `graph_controversies.status = 'open'` only (structural + first-open audit) — [publish-gate runbook](../docs/admin-graph-controversies-and-publish-gate.md). Analysis (`analysis_pipeline`) writes L4 checks and `project_person_profiles` for `/people` — **manual invoke only** (no cron). See [debate-pipeline README](departments/06-debate-engine/debate-pipeline/README.md), [analysis-pipeline README](departments/07-analysis-engine/analysis-pipeline/README.md), and [grok-bot-architecture.md](docs/grok-bot-architecture.md).

### Deleted (Build 4)

Do not look for `departments/02-chunking-engine`, `03-merging-engine`, or `departments/legacy`. Those trees, their Edge stubs, and the old claims/topology tables are gone. Live topology is Neo L3 (`debate_pipeline`) — [docs/topology-pipeline.md](docs/topology-pipeline.md).

## Adding a new step

**Flat agent** (single step at department root):

1. Create `departments/<department>/<NN>-<step-id>/handler.ts` (+ optional `schedule.sql` + `README.md`).
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Update the department `README.md` agent list.
4. Run `npm run agents:refresh`.

**Nested workflow** (multiple related steps):

1. Create `departments/<department>/<workflow>/<NN>-<step-id>/handler.ts` (+ optional `schedule.sql`). Use a two-digit prefix (`01-`, `02-`, …) so steps sort in pipeline order; the catalog step id omits the prefix.
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Update the workflow `README.md` step table.
4. Run `npm run agents:refresh`.

Go live: add step id to [activation.yaml](activation.yaml), deploy, run SQL in Supabase.

See [docs/directory-layout.md](docs/directory-layout.md) for the full folder and README conventions.

## Incremental cron rollout

1. Add step IDs to `active:` in [activation.yaml](activation.yaml).
2. Run `schedule.sql` in Supabase (Vault: `project_url`, `service_role_key`).
3. Run `npm run agents:refresh` and commit.

Order: ingestion → graph enqueue → debate → analysis → ops.

## Librarian

Catalog sync agent at [librarian/](librarian/). Cursor skill: [.cursor/skills/librarian/SKILL.md](../.cursor/skills/librarian/SKILL.md).

After pipeline or catalog edits, Cursor hooks run `npm run agents:refresh` on agent turn end. Commit generated files when they change.

**CI:** [`.github/workflows/agents-docs.yml`](../.github/workflows/agents-docs.yml) runs `npm run build` (TypeScript) then `agents:sync:check` / `agents:docs:check` / `agents:validate` on PRs and `main` pushes that touch `doxa-agents/**`, `supabase/functions/**`, `scripts/agents-*.ts`, or `app/api/**`. The workflow file itself is **not** in those path filters — a YAML-only change will not run the job. See [librarian/README.md](librarian/README.md).

## Layout

Full conventions: **[docs/directory-layout.md](docs/directory-layout.md)** (department / workflow / step folders, README requirements, naming).

| Layer | Path pattern | README |
|-------|--------------|--------|
| Department | `departments/<NN-department>/` | Required |
| Flat agent | `departments/<department>/<NN-step-id>/` | Required |
| Workflow | `departments/<department>/<workflow>/` | Required (multi-step groups) |
| Step (nested) | `…/<NN-step-id>/handler.ts` | Documented in workflow README |

- **Source:** `doxa-agents/departments/**/handler.ts`
- **Deploy stub:** `supabase/functions/<deploy_name>/index.ts`
- **Shared:** `doxa-agents/shared/utilities/`, `doxa-agents/lib/`
- **Schema:** `supabase/migrations/`

`npm run agents:validate` fails if a department, flat agent, or workflow in the catalog is missing `README.md`.
