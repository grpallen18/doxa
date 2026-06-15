# Doxa Agents

Pipeline agents for ingesting stories, extracting structured knowledge from text, canonicalizing entities, and building debate intelligence across stories.

## Pipeline layers

```text
01 Ingestion          → stories + clean bodies
02 Chunking (active)  → chunk, extract claims, chunk QA review
03–04 (archived)      → merge, canonicalization, topology — under departments/legacy/
05 Ops                → health, maintenance
```

**Admin runnable catalog** ends at `validate-chunk-claims`. Downstream steps remain on the **agent-flow canvas** as roadmap placeholders (not runnable). Handlers live under [departments/legacy](departments/legacy/) until re-enabled.

**Important:** Positions are **extracted from article text** in legacy `extract-story-entities`, then **canonicalized** in legacy `link-canonical-positions`. Topology agents operate on **canonical** positions—not raw article text.

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
| 01 Ingestion | [departments/01-ingestion-engine](departments/01-ingestion-engine) | NewsAPI, relevance, scrape, clean |
| 02 Chunking | [departments/02-chunking-engine](departments/02-chunking-engine) | **Active:** chunk, extract claims, chunk QA review |
| 05 Business operations | [departments/05-business-operations](departments/05-business-operations) | Health, atlas, maintenance |
| Legacy | [departments/legacy](departments/legacy) | Archived merge, canonicalization, topology, multi-atom chunk steps |

### 02 Chunking (active)

**Runnable path:** `chunk-story-bodies` → `extract-story-claims` → `validate-chunk-claims` (human review loop).

Refine/merge/canonical steps are archived under [departments/legacy/02-chunking-engine](departments/legacy/02-chunking-engine/), [legacy/03-merging-engine](departments/legacy/03-merging-engine/), and [legacy/04-semantic-intelligence-engine](departments/legacy/04-semantic-intelligence-engine/).

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
