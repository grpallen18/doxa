# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline output, running **story-scoped** catalog steps, and (legacy) inspecting claims tables if they still exist on a story.

**Runnable catalog today:** ingestion → knowledge graph (enqueue/trigger). Claims extract/merge is **not** in `pipeline-admin-catalog.yaml` — Neo4j graph-worker replaced it. Debate / analysis / hygiene steps are **global** (no `story_id`) and live under Admin Center / L3 / Observability, not on the story extraction checklist.

**See also:** [Admin pipeline ops roadmap](./admin-pipeline-ops-roadmap.md) · [Observability](./admin-observability.md) · [Pipeline catalog](../doxa-agents/docs/generated/pipeline-catalog.md)

## Pipeline stages (story-scoped)

Source of truth: `doxa-agents/ops/pipeline-admin-catalog.yaml` (merged with `manifest.yaml` at `npm run agents:pipeline-catalog`).

### Ingestion

Qualify assigns **Keep**, **Drop**, or **Pending**. **Pending** must resolve to Keep or Drop before scrape. Batch qualify claims the **oldest** unclassified stories first via RPC `claim_stories_for_relevance` (FIFO).

| Step | Deploy | Complete when |
|------|--------|---------------|
| Qualify story | `relevance_gate` | `relevance_status` set (Keep, Drop, or Pending) |
| Resolve pending qualification | `review_pending_stories` | Not required unless `PENDING` |
| Scrape story content | `scrape_story_content` | `scraped_at` set or `scrape_skipped` (Keep only) |
| Clean scraped content | `clean_scraped_content` | `story_bodies.content_clean` present (Keep only) |

### Knowledge graph

| Step | Deploy | Notes |
|------|--------|-------|
| Enqueue graph job | `enqueue_graph_job` | Writes `graph_processing_jobs` (also happens at end of clean) |
| Trigger graph worker | `trigger_graph_worker` | Optional poke of the Azure/Python worker |

The Python worker writes Document / Segment / Utterance in Neo4j. L3 debate assembly is **not** a story checklist step — use `debate_pipeline` / Grok MCP.

### Archived (canvas / old stories)

Claims chunk → extract → chunk QA, merge, canonical linkers, and legacy topology remain on disk under `doxa-agents/departments/02-*`, `03-*`, and `legacy/`. They are **not** in the runnable catalog. The `/extraction` and `/canonical` story pages may still show leftover claims UI for historical rows.

The **agent-flow canvas** still draws the full target architecture. Downstream nodes without catalog entries show a roadmap warning (no Run/Revert).

## Story hub and stage pages

All story routes under `/admin/stories/[story_id]` share a layout that loads `GET /api/admin/stories/[id]/extraction-review` once (`StoryReviewProvider`) and shows a macro **Pipeline stepper** from `PIPELINE_STAGES` (Ingestion, Knowledge graph, Debate, Analysis, Graph hygiene). Only ingestion + graph are story-scoped Run targets.

### Hub (`/admin/stories/[story_id]`)

Two-pane **article review** surface:

- **Left:** article text, metadata, **Approve QA** when chunk QA is blocked
- **Right:** **Story hub summary** — entity counts, export controls, links to stage pages (no full pipeline checklist)

### Stage pages

Full-width checklist for one macro stage. Each step can be run individually via **Run** (one step at a time).

| Path | Checklist | Stage actions |
|------|-----------|---------------|
| `/admin/stories/[id]/ingestion` | Ingestion steps | — |
| `/admin/stories/[id]/extraction` | Leftover claims tables (not in runnable catalog) | **Clear extraction** if those rows exist |
| `/admin/stories/[id]/agent-flow` | Full vision graph (runnable + roadmap) | Run/Revert on catalog steps only |
| `/admin/stories/[id]/canonical` | Redirects to agent-flow | — |

While a step runs, the row shows a spinner and the page polls extraction-review every **2 seconds** until output changes or completion criteria are met (max ~72 seconds), then stops automatically.

Shared UI lives in `components/admin/pipeline/` (`PipelineChecklist`, `PipelineStepper`, `usePipelineStepPoll`).

### Clear extraction

**Clear extraction** (extraction stage page only) resets one story to “chunks only, awaiting extraction”:

- Deletes story-level extractions, QA artifacts, and feedback
- Resets chunk/story extraction and QA columns (chunk `content` is kept)
- Deletes **orphan-only** canonical rows (`claims`, `events`, `canonical_positions`) that were linked only to this story—shared canonical rows on other stories are preserved

Requires confirmation in the UI and `{ confirm: true }` on the API.

Implemented by RPC `reset_story_extraction` (migration `131_reset_story_extraction.sql`).

### Clear canonical links

**Clear canonical links** (canonical stage page only) unlinks canonical IDs for one story **without** wiping extraction or merge output:

- Sets `story_claims.claim_id` / `stance`, `story_events.event_id`, `story_positions.canonical_position_id` to null for the story
- Deletes **orphan-only** rows from `claims`, `events`, `canonical_positions` (shared canonical rows on other stories are preserved)
- Does **not** touch chunks, `story_*` entity rows, QA artifacts, or `stories.merged_at`

Preview: `GET /api/admin/stories/[id]/clear-canonical/preview`. Mutate: `POST /api/admin/stories/[id]/clear-canonical` with `{ confirm: true }`.

Implemented by RPC `reset_story_canonical_links` (migration `135_reset_story_canonical_links.sql`).

## Routes

| Path | Purpose |
|------|---------|
| `/admin` | Admin Center hub — pipeline search, status overview, quick access |
| `/admin/stories` | Search and filter stories |
| `/admin/stories/[story_id]` | Hub: article (left) + entity summary (right) |
| `/admin/stories/[story_id]/ingestion` | Ingestion checklist |
| `/admin/stories/[story_id]/extraction` | Extraction checklist + clear extraction |
| `/admin/stories/[story_id]/agent-flow` | Vision workflow canvas |

## API (admin JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stories/list` | Paginated search. Query: `title`, `source`, `keyword`, `sort` (`recent` \| `relevant`), `limit`, `offset` |
| `GET` | `/api/admin/stories/[id]/extraction-review` | Full review payload: story, entities, links, feedback, chunks, ingestion fields |
| `POST` | `/api/admin/stories/[id]/feedback` | Submit like/dislike on an entity |
| `POST` | `/api/admin/stories/[id]/qa-override` | Admin approve QA (`include_chunks` optional) |
| `POST` | `/api/admin/stories/[id]/clear-extraction` | Body: `{ confirm: true }`. Calls `reset_story_extraction` RPC |
| `GET` | `/api/admin/stories/[id]/clear-canonical/preview` | Impact preview for canonical-only reset |
| `POST` | `/api/admin/stories/[id]/clear-canonical` | Body: `{ confirm: true }`. Calls `reset_story_canonical_links` RPC |
| `POST` | `/api/admin/stories/[id]/run-step` | Body: `{ step: "<step_id or deploy_name>" }`. Invokes one edge function for this story |
| `GET` | `/api/admin/search` | Query: `q`, `limit`. Stories, claims, positions |

**run-step** allowlist is generated from the pipeline catalog (`lib/admin/generated/pipeline-catalog.ts`). Invoke options (e.g. `max_chunks`, timeouts) come from `doxa-agents/ops/pipeline-admin-catalog.yaml`.

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (service-role client for reads/writes and edge invokes).

Checklist logic: `lib/admin/pipeline-status/` (orchestrated via `lib/admin/story-pipeline-checklist.ts` re-exports).

## Data exposed

Reads existing tables only:

- `stories`, `story_bodies`, `story_chunks`, `sources`
- `story_claims`, `story_evidence`, `story_positions`, `story_events`
- `story_claim_evidence_links`
- `story_position_claim_links`, `story_position_evidence_links`
- `story_event_claim_links`, `story_event_evidence_links`
- `story_position_event_context` (derived position↔event paths; not a stored extraction edge)
- `story_extraction_feedback` (human QA signals)
- `story_extraction_qa_artifacts`

Article text priority: `story_bodies.content_clean` → `stories.content_full` → `stories.content_snippet`.

## Extraction status (derived)

| Status | Meaning |
|--------|---------|
| `merged` | `stories.merged_at` set (`merge_story_claims` ran) |
| `extracted` | `extraction_completed_at` set |
| `skipped_empty` | `extraction_skipped_empty` true |
| `pending_extraction` | Otherwise |

## Markdown export

On the review page **Export** controls (or programmatically via `buildExtractionReviewMarkdown` in `lib/admin/story-extraction-review.ts`):

- **Copy Markdown** — clipboard
- **Download .md** — file download

Includes metadata, full article text, entities, link summary, and a review prompt for LLM-assisted QA.

## Feedback table

Migration `126_story_extraction_feedback.sql`. Passive dataset for future evals and prompt tuning—not wired into the pipeline. Cleared when using **Clear extraction**.

## Setup

1. Apply migrations through `135_reset_story_canonical_links.sql` (and `134_validate_chunk_claims_qa.sql`, `131`, `130_extraction_qa.sql`, `126`, `124`/`125` if not already applied).
2. Ensure admin role on your user (see auth docs).
3. Run the app with service role key configured.

## Manual test: clear + pipeline walkthrough

1. Open a story hub on `/admin/stories/[id]`; confirm stepper links and entity summary (no full checklist on hub).
2. **Ingestion** (`/ingestion`) — Run qualify → resolve Pending if needed → scrape → clean.
3. **Graph** — Enqueue graph job (or rely on clean’s enqueue), then confirm a `graph_processing_jobs` row; optional Trigger graph worker.
4. **Agent flow** (`/agent-flow`) — Catalog steps (ingestion + graph + global debate if shown) remain runnable; archived claims/canonical nodes should not Run.
5. **Admin Center search** (`/admin?q=…`) returns matching stories (and leftover claims/positions if those tables still have rows).
6. Funnel health: `/admin/observability`. L3 overrides: `/admin/l3-proposals`.
