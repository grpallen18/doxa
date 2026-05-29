# Doxa Agents

Pipeline agents for ingesting stories, extracting structured knowledge from text, canonicalizing entities, and building debate intelligence across stories.

## Pipeline layers

```text
01 Ingestion          → stories + clean bodies
02 Processing         → extract & merge claims, evidence, positions, events (from text)
03 Canonicalization   → link story_* rows to global claims, events, positions
03 Position intel.    → relate canonical positions (pairs, topology, viewpoints)
06 Ops                → health, maintenance
```

**Important:** Positions are **extracted from article text** in `02-story-extraction`, then **canonicalized** like claims in `01-canonical-knowledge`. `02-position-intelligence` does not create positions from scratch—it classifies relationships between positions that already exist.

## What you edit manually

| Responsibility | Where |
|----------------|--------|
| Agent logic | `divisions/**/handler.ts` |
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

```bash
npm run agents:refresh   # sync manifest + docs + purge_engine_data() + validate
```

**Engine reset:** `SELECT public.purge_engine_data();` — see purge-engine doc. Edit `ops/purge-engine-tables.yaml` when adding pipeline tables; refresh regenerates `supabase/routines/purge_engine_data.sql`.

## Divisions

| Division | Path | Purpose |
|----------|------|---------|
| 01 Ingestion | [divisions/01-ingestion-engine](divisions/01-ingestion-engine) | NewsAPI, relevance, scrape, clean |
| 02 Processing | [divisions/02-processing-engine](divisions/02-processing-engine) | Chunk → extract (4 entity types) → merge to `story_*` |
| 03 Semantic intelligence | [divisions/03-semantic-intelligence-engine](divisions/03-semantic-intelligence-engine) | Canonicalization + position relationships |
| 06 Business operations | [divisions/06-business-operations](divisions/06-business-operations) | Health, atlas, maintenance |
| Legacy | [divisions/legacy](divisions/legacy) | Deprecated claim-cluster engine |

### 02 Processing (detail)

| Workflow | Steps |
|----------|--------|
| [01-document-processing](divisions/02-processing-engine/01-document-processing/) | `chunk-story-bodies` |
| [02-story-extraction](divisions/02-processing-engine/02-story-extraction/) | `extract-story-entities` — claims, evidence, **positions**, events |
| [03-story-synthesis](divisions/02-processing-engine/03-story-synthesis/) | `merge-story-claims` — story-level tables + trigger canonical linkers |

Deploy name for extract step remains `extract_chunk_claims` (historical); step id is `extract-story-entities`.

## Canonicalization

Runs after merge, under `03-semantic-intelligence-engine/01-canonical-knowledge/`:

| Step | Input | Output |
|------|--------|--------|
| `link-canonical-claims` | `story_claims` | `claims` |
| `link-canonical-events` | `story_events` | `events` |
| `link-canonical-positions` | `story_positions` | `positions` |
| `update-stances` | `story_claims` (stance backfill) | — |

`merge-story-claims` invokes `link_canonical_positions` and `link_canonical_events` when it inserts new story rows. `link-canonical-claims` runs on its own cron.

Positions follow the same pattern as claims: **extract at story level → canonicalize by embedding similarity**—not deferred to position-intelligence.

## Position intelligence (not extraction)

`03-semantic-intelligence-engine/02-position-intelligence/` — `classify-position-pairs`, `clustering_pipeline`, `build-debate_topology`, summaries, viewpoints. Operates on **canonical** positions and their relationships.

## Adding a new step

1. Create `divisions/<division>/<workflow>/<NN>-<step-id>/handler.ts` (+ optional `schedule.sql`). Use a two-digit prefix (`01-`, `02-`, …) so steps sort in pipeline order; the catalog step id omits the prefix (e.g. folder `01-scrape-story-content` → id `scrape-story-content`).
2. Add stub `supabase/functions/<deploy_name>/index.ts`.
3. Run `npm run agents:refresh`.
4. Go live: add step id to [activation.yaml](activation.yaml), deploy, run SQL in Supabase.

## Incremental cron rollout

1. Add step IDs to `active:` in [activation.yaml](activation.yaml).
2. Run `schedule.sql` in Supabase (Vault: `project_url`, `service_role_key`).
3. Run `npm run agents:refresh` and commit.

Order: ingestion → processing → canonicalization → position intelligence → ops.

## Librarian

After pipeline edits, Cursor runs `npm run agents:refresh`. See [.cursor/skills/librarian/SKILL.md](../.cursor/skills/librarian/SKILL.md).

## Layout

- **Source:** `doxa-agents/divisions/**/handler.ts`
- **Deploy stub:** `supabase/functions/<deploy_name>/index.ts`
- **Shared:** `doxa-agents/shared/utilities/`
- **Schema:** `supabase/migrations/`
