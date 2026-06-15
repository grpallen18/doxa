# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline extraction output. The admin UI supports human review, QA override, **clear**, and **step-by-step pipeline runs** across ingestion and claims extraction (through chunk QA review).

**See also:** [Admin pipeline ops roadmap](./admin-pipeline-ops-roadmap.md) (Phases 1–4) · [Pipeline catalog](../doxa-agents/docs/generated/pipeline-catalog.md) (generated step list)

## Pipeline stages (story-scoped)

Steps are grouped in the UI under two **runnable** macro stages. Source of truth: `doxa-agents/ops/pipeline-admin-catalog.yaml` (merged with `manifest.yaml` at `npm run agents:pipeline-catalog`).

The **agent-flow canvas** still shows the full target architecture (merge, canonicalization, topology). Downstream nodes are roadmap placeholders—amber warning, no Run/Revert—until those steps are moved back from `departments/legacy/`.

### Ingestion

Qualify assigns **Keep**, **Drop**, or **Pending**. **Pending** is a feedback loop within qualify — a story must be resolved to Keep or Drop before scrape runs. The optional **Resolve pending qualification** step covers that review; it is not a separate macro stage after clean.

| Step | Deploy | Complete when |
|------|--------|---------------|
| Qualify story | `relevance_gate` | `relevance_status` set (Keep, Drop, or Pending) |
| Resolve pending qualification | `review_pending_stories` | Not required unless `PENDING`; complete when status is Keep or Drop |
| Scrape story content | `scrape_story_content` | `scraped_at` set or `scrape_skipped` (Keep only) |
| Clean scraped content | `clean_scraped_content` | `story_bodies.content_clean` present (Keep only) |

### Extraction (claims-only — active catalog)

Runnable extraction ends at **Review chunk claims** (`validate_chunk_claims`). Merge, refine, canonical, and topology steps are archived (handlers under `doxa-agents/departments/legacy/`).

| Step | Deploy | Notes |
|------|--------|-------|
| Chunk story bodies | `chunk_story_bodies` | Creates `story_chunks` |
| Extract primary claims | `extract_story_claims` | 1 chunk per Run (`max_chunks: 1`) |
| Review chunk claims | `validate_chunk_claims` | Chunk QA — deterministic validate → chunk `passed` |

Extraction macro stage is **complete** when all chunks have passed chunk QA (`chunk_extraction_qa_status = passed` for the claims lane).

### Archived (canvas roadmap only)

These steps appear on the agent-flow graph but are **not** in the runnable catalog: `refine-chunk-claims`, merge QA, canonical linkers, debate topology, positions lane, multi-atom chunk steps. Re-enable by restoring handlers to active departments and updating `pipeline-admin-catalog.yaml`.

## Story hub and stage pages

All story routes under `/admin/stories/[story_id]` share a layout that loads `GET /api/admin/stories/[id]/extraction-review` once (`StoryReviewProvider`) and shows a macro **Pipeline stepper** (Ingestion → Extraction).

### Hub (`/admin/stories/[story_id]`)

Two-pane **article review** surface:

- **Left:** article text, metadata, **Approve QA** when chunk QA is blocked
- **Right:** **Story hub summary** — entity counts, export controls, links to stage pages (no full pipeline checklist)

### Stage pages

Full-width checklist for one macro stage. Each step can be run individually via **Run** (one step at a time).

| Path | Checklist | Stage actions |
|------|-----------|---------------|
| `/admin/stories/[id]/ingestion` | Ingestion steps | — |
| `/admin/stories/[id]/extraction` | Chunk → extract → review | **Clear extraction** |
| `/admin/stories/[id]/agent-flow` | Full vision graph (runnable + roadmap) | Run/Revert on catalog steps only |
| `/admin/stories/[id]/canonical` | Redirects to agent-flow | — |

While a step runs, the row shows a spinner and the page polls extraction-review every **2 seconds** until output changes or completion criteria are met (max ~72 seconds), then stops automatically.

Steps with batch limits (`validate_chunk_claims`) may need multiple **Run** clicks if the story has more than 20 chunks. **Extract** runs one chunk per click.

When QA returns `needs_human_review`, the checklist shows a blocked state. Use **Approve QA** (hub sidebar or stage banner) to unblock further chunk review.

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
2. **Ingestion** (`/ingestion`) — Run qualify → resolve Pending if needed → scrape → clean; confirm ingestion fields in step detail.
3. **Extraction** (`/extraction`) — Chunk → Extract → Review until all chunks pass chunk QA.
4. **Agent flow** (`/agent-flow`) — Confirm downstream nodes show roadmap warning (no Run/Revert); catalog steps remain runnable.
5. Confirm blocked state when QA returns `needs_human_review`; **Approve QA** on hub unblocks chunk review.
6. **Admin Center search** (`/admin?q=…`) returns matching stories, claims, and positions.
