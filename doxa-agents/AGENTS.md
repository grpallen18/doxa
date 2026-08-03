# Doxa Agents

Pipeline agents for ingesting stories, building a Neo4j evidence graph, and (upcoming) debate topology across stories.

## Pipeline layers

```text
01 Ingestion          → stories + clean bodies → enqueue graph job
04 Graph engine       → enqueue / trigger Python utterance graph-worker → AuraDB
02–03 Claims path     → DEPRECATED (pending cleanup after Phase 2; handlers still on disk)
legacy/               → archived merge / canonical / topology (pending deletion)
05 Ops                → health, maintenance
```

**Steering document:** [docs/architecture/neo4j-graph-architecture.md](docs/architecture/neo4j-graph-architecture.md)  
**Next phases:** [docs/architecture/neo4j-overhaul-next.md](docs/architecture/neo4j-overhaul-next.md)  
**Phase 0 validation:** [docs/architecture/phase0-validation.md](docs/architecture/phase0-validation.md)  
**Phase 1 validation:** [docs/architecture/phase1-validation.md](docs/architecture/phase1-validation.md)

**Admin runnable catalog:** ingestion + graph enqueue/trigger. Custom claims extract/review/merge is **replaced** by the Neo4j utterance path (Python worker). Old handlers remain under `02-chunking-engine` / `03-merging-engine` / `legacy/` until post–Phase 2 cleanup.

**Important:** Controversy topology is the product surface; Neo4j is the discourse substrate. Phase 0–2a write Utterances → Propositions/Entities → Arguments in the graph-worker. Cross-document Viewpoint / Controversy / Dispute assembly is the Edge `debate_pipeline`.

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

**Single-record testing:** [docs/pipeline-test-params.md](docs/pipeline-test-params.md) — optional `story_id` / `story_claim_id` / `story_position_id` POST body fields per step (fixture story documented there).

## Departments

| Department | Path | Purpose |
|------------|------|---------|
| 01 Ingestion | [departments/01-ingestion-engine](departments/01-ingestion-engine) | NewsAPI, relevance, scrape, clean → enqueue graph job |
| 04 Graph | [departments/04-graph-engine](departments/04-graph-engine) | Enqueue / trigger Neo4j graph worker |
| 02 Chunking | [departments/02-chunking-engine](departments/02-chunking-engine) | **Deprecated** claims extract/QA (Build 4 delete) |
| 03 Merging | [departments/03-merging-engine](departments/03-merging-engine) | **Deprecated** claims merge (Build 4 delete) |
| 05 Business operations | [departments/05-business-operations](departments/05-business-operations) | Health, maintenance |
| Legacy | [departments/legacy](departments/legacy) | Archived multi-atom / canonical / topology (Build 4 delete) |

### 04 Graph (Phase 0)

**Path:** `clean-scraped-content` enqueues `graph_processing_jobs` → Python [`services/graph-worker`](../services/graph-worker/) → Neo4j AuraDB (Document / Segment / Utterance). Manual: `enqueue-graph-job`, `trigger-graph-worker`.

### 02 Chunking / 03 Merging (deprecated)

Claims extract → validate → refine → approve → merge remain on disk for reference until Build 4 deletion. They are **not** in the admin runnable catalog.

### Legacy (archived detail)

**Claims refine loop (inactive):** `refine-chunk-claims` → re-review via `validate-chunk-claims`.

**Positions track (inactive):** `extract-story-positions` → `validate-chunk-positions` → `refine-chunk-positions` → `merge-story-positions`.

**Legacy multi-atom path (inactive):**

| Agent | Deploy | Notes |
|-------|--------|--------|
| [legacy/extract-story-entities](departments/legacy/extract-story-entities/) | `extract_story_entities` | Full atom extract |
| [legacy/02-chunking-engine/03-standardize-chunk-extraction](departments/legacy/02-chunking-engine/03-standardize-chunk-extraction/) | `standardize_chunk_extraction` | Skips claims-first chunks |
| [legacy/02-chunking-engine/04-refine-chunk-extraction](departments/legacy/02-chunking-engine/04-refine-chunk-extraction/) | `refine_chunk_extraction` | Legacy refine loop |
| [legacy/02-chunking-engine/05-validate-chunk-extraction](departments/legacy/02-chunking-engine/05-validate-chunk-extraction/) | `validate_chunk_extraction` | Production judge → `atoms_passed` |
| [legacy/02-chunking-engine/06-link-chunk-entities](departments/legacy/02-chunking-engine/06-link-chunk-entities/) | `link_chunk_entities` | Semantic links after validation |

### Legacy merging (inactive)

| Agent | Deploy | Notes |
|-------|--------|--------|
| [legacy/03-merging-engine/01-merge-story-entities](departments/legacy/03-merging-engine/01-merge-story-entities/) | `merge_story_entities` | Merges chunk extractions to `story_*` |
| [legacy/03-merging-engine/02-review-merged-extraction](departments/legacy/03-merging-engine/02-review-merged-extraction/) | `review_merged_extraction` | Merge QA reviewer |
| [legacy/03-merging-engine/03-refine-merged-extraction](departments/legacy/03-merging-engine/03-refine-merged-extraction/) | `refine_merged_extraction` | Merge QA patch (max 1 cycle) |
| [legacy/03-merging-engine/04-validate-merged-extraction](departments/legacy/03-merging-engine/04-validate-merged-extraction/) | `validate_merged_extraction` | Merge QA judge; gates canonical linkers |

Step ids and deploy names align: `extract-story-entities` → `extract_story_entities`, `merge-story-entities` → `merge_story_entities`.

## Canonicalization (archived)

Runs after merge under [legacy/04-semantic-intelligence-engine](departments/legacy/04-semantic-intelligence-engine/):

| Step | Input | Output |
|------|--------|--------|
| `link-canonical-claims` | `story_claims` | `claims` |
| `link-canonical-events` | `story_events` | `events` |
| `link-canonical-positions` | `story_positions` | `positions` |
| `update-stances` | `story_claims` (stance backfill) | — |

Canonical linkers run on cron after merge QA passes (`stories.extraction_qa_status = passed`).

Positions follow the same pattern as claims: **extract at story level → canonicalize by embedding similarity**—not deferred to position-intelligence.

## Debate topology (archived — not extraction)

Layered pipeline under [legacy/04-semantic-intelligence-engine/02-debate-topology](departments/legacy/04-semantic-intelligence-engine/02-debate-topology/):

1. **Candidates** — `generate-position-pair-candidates`, `generate-agreement-cluster-candidates`
2. **Classification** — `classify-position-relationships`, `classify-agreement-cluster-relationships`
3. **Topology** — `build-agreement-clusters`, `build-controversy-clusters` (via `topology_pipeline`)
4. **Narratives** — `generate-agreement-summaries`, `generate-viewpoints`

See [docs/topology-pipeline.md](docs/topology-pipeline.md). Operates on **canonical** positions only; story evidence stays local.

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

Order: ingestion → chunking → merging → canonicalization → debate topology → ops.

## Librarian

Catalog sync agent at [librarian/](librarian/). Cursor skill: [.cursor/skills/librarian/SKILL.md](../.cursor/skills/librarian/SKILL.md).

After pipeline or catalog edits, Cursor hooks run `npm run agents:refresh` on agent turn end. Commit generated files when they change.

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
