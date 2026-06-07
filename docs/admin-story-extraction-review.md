# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline extraction output. The admin UI supports human review, QA override, **clear**, and **step-by-step pipeline runs** across ingestion, extraction, and canonicalization.

**See also:** [Admin pipeline ops roadmap](./admin-pipeline-ops-roadmap.md) (Phases 1–4) · [Pipeline catalog](../doxa-agents/docs/generated/pipeline-catalog.md) (generated step list)

## Pipeline stages (story-scoped)

Steps are grouped in the UI under three macro stages. Source of truth: `doxa-agents/ops/pipeline-admin-catalog.yaml` (merged with `manifest.yaml` at `npm run agents:pipeline-catalog`).

### Ingestion

Qualify assigns **Keep**, **Drop**, or **Pending**. **Pending** is a feedback loop within qualify — a story must be resolved to Keep or Drop before scrape runs. The optional **Resolve pending qualification** step covers that review; it is not a separate macro stage after clean.

| Step | Deploy | Complete when |
|------|--------|---------------|
| Qualify story | `relevance_gate` | `relevance_status` set (Keep, Drop, or Pending) |
| Resolve pending qualification | `review_pending_stories` | Not required unless `PENDING`; complete when status is Keep or Drop |
| Scrape story content | `scrape_story_content` | `scraped_at` set or `scrape_skipped` (Keep only) |
| Clean scraped content | `clean_scraped_content` | `story_bodies.content_clean` present (Keep only) |

### Extraction (claims-only path)

Extraction has two QA feedback loops before canonicalization:

1. **Chunk QA loop** — after extract, review/validate chunk claims until all chunks pass (chunk refine agents planned incrementally).
2. **Merge QA loop** — after merge, review → refine (when needed) → approve merged extraction.

Macro timeline: **Chunk → Extract → Merge**. Review and approve loops run within Extract and Merge; runnable steps stay in the checklist under grouped headings.

| Step | Deploy | Notes |
|------|--------|-------|
| Chunk story bodies | `chunk_story_bodies` | Creates `story_chunks` |
| Extract primary claims | `extract_story_claims` | 1 chunk per Run (`max_chunks: 1`) |
| Review chunk claims | `validate_chunk_claims` | Chunk QA loop — deterministic validate → chunk `passed` |
| Merge story claims | `merge_story_claims` | After all chunks passed → `story_claims` |
| Review merged extraction | `review_merged_extraction` | Merge QA loop — completeness reviewer |
| Refine merged extraction | `refine_merged_extraction` | Merge QA loop branch when review requests refinement |
| Approve merged extraction | `validate_merged_extraction` | Gates canonical linkers (`extraction_qa_status = passed`) |

Extraction macro stage is **complete** only when merge QA approves (`extraction_qa_status = passed`).

### Canonicalization

| Step | Deploy | Notes |
|------|--------|-------|
| Link canonical claims | `link_canonical_claims` | Required after merge QA passes |
| Link canonical events | `link_canonical_events` | Optional (claims-only pipeline) |
| Link canonical positions | `link_canonical_positions` | Optional (claims-only pipeline) |
| Update stances | `update_stances` | Optional stance backfill |

Canonical linkers require `stories.extraction_qa_status = passed` (or admin **Approve QA** override).

Steps marked **inactive** in the UI are not in `activation.yaml` — cron may not be scheduled even though Run works via service role.

## Story hub and stage pages

All story routes under `/admin/stories/[story_id]` share a layout that loads `GET /api/admin/stories/[id]/extraction-review` once (`StoryReviewProvider`) and shows a macro **Pipeline stepper** (Ingestion → Extraction → Canonical).

### Hub (`/admin/stories/[story_id]`)

Two-pane **article review** surface:

- **Left:** article text, metadata, **Approve QA** when merge QA is blocked
- **Right:** **Story hub summary** — entity counts, merged-claims preview, export controls, links to stage pages (no full pipeline checklist)

### Stage pages

Full-width checklist for one macro stage. Each step can be run individually via **Run** (one step at a time).

| Path | Checklist | Stage actions |
|------|-----------|---------------|
| `/admin/stories/[id]/ingestion` | Ingestion steps | — |
| `/admin/stories/[id]/extraction` | Extraction + merge QA | **Clear extraction** |
| `/admin/stories/[id]/canonical` | Canonical linkers + stances | **Clear canonical links** |

While a step runs, the row shows a spinner and the page polls extraction-review every **2 seconds** until output changes or completion criteria are met (max ~72 seconds), then stops automatically.

Steps with batch limits (`validate_chunk_claims`, `update_stances`) may need multiple **Run** clicks if the story has more than 20 chunks. **Extract** runs one chunk per click.

When QA returns `needs_human_review`, the checklist shows a blocked state. Use **Approve QA** (hub sidebar or stage banner) to unblock canonical steps.

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
| `/admin/stories/[story_id]/canonical` | Canonical checklist + clear canonical links |

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
3. **Extraction** (`/extraction`) — Chunk → Extract (includes review) → Merge (includes approve); confirm `extraction_qa_status = passed` before canonical.
4. **Canonical** (`/canonical`) — Walk link steps after merge QA passes. Re-run chunk validate if >20 chunks.
5. Confirm blocked state when QA returns `needs_human_review`; **Approve QA** on hub unblocks canonical steps.
6. **Clear canonical** on a story with shared claims; shared canonical rows on other stories must remain.
7. **Admin Center search** (`/admin?q=…`) returns matching stories, claims, and positions.
