# Admin: Story pipeline & Agent Flow

Operator path for one article: **qualify → scrape → clean → graph job → Neo**. Claims extract / chunk QA is **not** a live catalog path.

**See also:** [pipeline catalog](../doxa-agents/docs/generated/pipeline-catalog.md) · [Agent Flow ops roadmap](./admin-pipeline-ops-roadmap.md) · [Neo explorer](./admin-neo-explorer.md) · [Observability](./admin-observability.md) · [Hygiene & rebuild](./ops-neo-graph-hygiene-and-rebuild.md) · [Analysis (L4)](./admin-analysis-pipeline.md)

## Intent

Walk a single story from NewsAPI ingest through a cleaned body and a `graph_processing_jobs` row. The Python graph-worker (not an admin “extract claims” step) writes Document / Utterance / Proposition / Argument. Cross-document L3 debate and L4 analysis are **global** orchestrators — they appear on the canvas but ignore `story_id`.

## Operator path

1. **`/admin/stories`** — search/filter (`GET /api/admin/stories/list`).
2. **`/admin/stories/[id]`** — story hub: metadata, article text, leftover chunk counts, **Open in Neo**, **Agent Flow**.
3. **`/admin/stories/[id]/agent-flow`** — production canvas. Run ingestion + graph steps here.
4. **`/admin/stories/[id]/audit`** — `story_history` / step-run timeline.
5. **`/admin/neo/union?focus=document:{storyId}`** — inspect the worker graph once the job finishes.

Header search (`GET /api/admin/search`) lives in the admin chrome (`AdminPipelineSearch`), not on `/admin` (that page is **Settings** only).

## Runnable catalog (story-scoped)

Source of truth: `doxa-agents/ops/pipeline-admin-catalog.yaml` → `lib/admin/generated/pipeline-catalog.ts`.

### Ingestion (`scope: story`)

| Step | Deploy | Complete when |
|------|--------|---------------|
| Qualify story | `relevance_gate` | `relevance_status` set (Keep / Drop / Pending) |
| Resolve pending qualification | `review_pending_stories` | Optional — only when status is `PENDING`; then Keep or Drop |
| Scrape story content | `scrape_story_content` | `scraped_at` set or `scrape_skipped` (Keep only) |
| Clean scraped content | `clean_scraped_content` | `story_bodies.content_clean` present (Keep only) |

Qualify FIFO for **batch** runs uses RPC `claim_stories_for_relevance` (oldest unclassified first). Isolated `story_id` POSTs skip that claim.

**Clean often enqueues the graph job.** `clean_scraped_content` calls `enqueueGraphJob` after a successful clean (and retries orphans where `content_clean` exists but `stories.graph_status` is null). A separate **Enqueue graph job** click is only needed for reprocess.

### Knowledge graph (`scope: story`)

| Step | Deploy | Notes |
|------|--------|-------|
| Enqueue graph job | `enqueue_graph_job` | Insert/reset `graph_processing_jobs` |
| Trigger graph worker | `trigger_graph_worker` | Optional `POST {GRAPH_WORKER_URL}/run`. The worker also **polls every 5s**. |

Graph / debate / analysis / hygiene completion on the canvas is driven by `payload.step_runs` (`story_step_runs`), not domain columns. Ingestion completion still uses story fields (`relevance_status`, `scraped_at`, `has_content_clean`, …) in `lib/admin/pipeline-status/ingestion.ts`.

### Global stages (canvas only)

Debate, Analysis, and Graph hygiene are `scope: global`. The canvas can still **Run** a catalog step; `POST /api/admin/stories/[id]/run-step` always sends `{ story_id }`. Global handlers (`debate_pipeline`, `analysis_pipeline`, `graph_hygiene`, …) **do not read `story_id`** — a click starts a fleet-wide tick. Prefer a direct Edge invoke with `{ dry_run, limit }` for those.

`wipe_l3_analytical` and `prune_oldest_documents` are **not** in the admin catalog overlay. They are not canvas Run targets. See [ops-neo-graph-hygiene-and-rebuild.md](./ops-neo-graph-hygiene-and-rebuild.md).

## Agent Flow canvas

Production UI: `components/admin/workflow-canvas/` (not the Figma Vite bundle under `docs/agents-workflow-canvas/`).

Layout source: `lib/admin/workflow-canvas/vision-flow-layout.ts`.

| Node | Maturity | Catalog step |
|------|----------|--------------|
| Qualify / pending / scrape / clean | live | matching ingestion ids |
| Stop | placeholder | none — Drop terminal |
| Enqueue / Build knowledge graph | live | `enqueue-graph-job`, `trigger-graph-worker` |
| Proposition layer | live (in-worker) | none — Phase 1 runs inside the same graph job |
| Debate assembly | live | `debate-pipeline` (global) |
| Complete | live | terminal |

Focus a node with `?node=relevance-gate` (ingestion redirect uses this). Layout persist: `GET`/`PUT /api/admin/workflow-canvas/layout`.

**Approve QA** in the canvas banner is a leftover. `isPipelineBlocked` is now **story Dropped** only (`relevance_status === 'DROP'`). The button’s handler is a no-op (`workflow-canvas-page.tsx`).

## Routes

| Path | Behavior |
|------|----------|
| `/admin` | Settings (OpenAI model, layout, Neo colors) — **not** a search hub |
| `/admin/stories` | Story list |
| `/admin/stories/[id]` | Story hub |
| `/admin/stories/[id]/agent-flow` | Production canvas |
| `/admin/stories/[id]/audit` | Full audit timeline |
| `/admin/stories/[id]/ingestion` | **Redirect** → `…/agent-flow?node=relevance-gate` |
| `/admin/stories/[id]/extraction` | **Redirect** → `/admin/neo/union?focus=document:{id}` |
| `/admin/stories/[id]/canonical` | **Redirect** → `…/agent-flow` |

## APIs (admin JWT)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stories/list` | Paginated search: `title`, `source`, `keyword`, `sort` (`recent` \| `relevant`), `limit`, `offset` |
| `GET` | `/api/admin/stories/[id]/extraction-review` | Hub + canvas payload (story, chunks, `step_runs`) |
| `POST` | `/api/admin/stories/[id]/run-step` | `{ step }` (catalog id or deploy name). Always `{ story_id }`. Needs `SUPABASE_SERVICE_ROLE_KEY` or **503** |
| `POST` | `/api/admin/stories/[id]/revert-step` | Ingestion-only revert (see below) |
| `GET` | `/api/admin/stories/[id]/audit` | History events |
| `POST` | `/api/admin/stories/[id]/feedback` | Entity like/dislike — **no story UI** calls this on main |
| `GET` | `/api/admin/search` | Header search |

Allowlist: generated `PIPELINE_STEPS`. Timeouts from the catalog overlay (`invoke_options.timeout_ms`).

## Revert

`REVERT_SCOPE_STEP_IDS` is **ingestion only**: qualify, pending review, scrape, clean (`lib/admin/pipeline-status/revert.ts`). Graph jobs, Neo subgraphs, and L3 overlays have no story-level Revert. Only the latest completed ingestion tip is revertible.

| Step | Effect |
|------|--------|
| `relevance-gate` | Clears Keep/Drop/Pending |
| `review-pending-stories` | Returns the story to Pending |
| `scrape-story-content` | Clears scrape state and scraped body |
| `clean-scraped-content` | Clears cleaned body; raw scrape kept |

## Removed / do not use

These are documented in older drafts and **do not exist** under `app/api/admin/stories/`:

| Former surface | Reality |
|----------------|---------|
| `POST …/clear-extraction` + `reset_story_extraction` UI | Gone |
| `GET/POST …/clear-canonical` | Gone |
| `POST …/qa-override` / **Approve QA** | API gone; canvas button is a no-op |
| Stage pages `/ingestion`, `/extraction`, `/canonical` | Redirects (above) |
| Chunk → extract → chunk QA Run loop | Not in `pipeline-admin-catalog.yaml` |
| Admin Center as pipeline search hub | Search is in the header; `/admin` is Settings |

Handlers for claims extract/merge remain on disk under `doxa-agents/departments/02-*`, `03-*`, and `legacy/` until Build 4 delete. They are not canvas Run targets.

## Pitfalls

- **Clean succeeded, no Neo document:** job is queued; trigger is optional. Check `graph_processing_jobs` and Observability funnel. Worker `POST /run` is **fail-closed** without `GRAPH_WORKER_SECRET`.
- **Ran Debate / Analysis from a story canvas:** that is a **global** tick. It will not isolate the open story.
- **Dropped story:** scrape/clean are blocked. Canvas shows the Drop reason; there is no QA override.
- **`/extraction` bookmark:** you land in Neo focused on `document:{id}`, not a claims checklist.
- **Empty `/people` after a story graph job:** person dossiers are L4 (`project_person_profiles`), not this path.

## Manual walkthrough

1. Open `/admin/stories/[id]`. Confirm article text and **Agent Flow**.
2. On the canvas, Run qualify → resolve Pending if needed → scrape → clean. Confirm `has_content_clean`.
3. Confirm a `graph_processing_jobs` row (clean usually created it). Trigger only if the worker is idle and the job is stuck.
4. Open in Neo (`focus=document:{id}`). Expect utterances / propositions after the worker finishes (schema `2.2.1` / extractor `2.2.1-debate-eligible`).
5. Open `/audit` if a Run failed — failures append to `story_step_runs`.
6. Do **not** expect chunk QA, Clear extraction, or Approve QA.
