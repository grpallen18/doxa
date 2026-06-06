# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline extraction output. The admin UI supports human review, QA override, **clear**, and **step-by-step pipeline runs** across ingestion, extraction, and canonicalization.

**See also:** [Admin pipeline ops roadmap](./admin-pipeline-ops-roadmap.md) (Phases 1–4) · [Pipeline catalog](../doxa-agents/docs/generated/pipeline-catalog.md) (generated step list)

## Pipeline stages (story-scoped)

Steps are grouped in the UI under three macro stages. Source of truth: `doxa-agents/ops/pipeline-admin-catalog.yaml` (merged with `manifest.yaml` at `npm run agents:pipeline-catalog`).

### Ingestion

| Step | Deploy | Complete when |
|------|--------|---------------|
| Relevance gate | `relevance_gate` | `relevance_status` set |
| Scrape story content | `scrape_story_content` | `scraped_at` set or `scrape_skipped` |
| Clean scraped content | `clean_scraped_content` | `story_bodies.content_clean` present |
| Review pending stories | `review_pending_stories` | `relevance_status` is not `PENDING` |

### Extraction (claims-only path)

| Step | Deploy | Notes |
|------|--------|-------|
| Chunk story bodies | `chunk_story_bodies` | Creates `story_chunks` |
| Extract primary claims | `extract_story_claims` | 1 chunk per Run (`max_chunks: 1`) |
| Validate chunk claims | `validate_chunk_claims` | Deterministic QA → chunk `passed` |
| Merge story claims | `merge_story_claims` | → `story_claims` |
| Review merged extraction | `review_merged_extraction` | Merge QA reviewer |
| Refine merged extraction | `refine_merged_extraction` | Optional (max 1 cycle) |
| Validate merged extraction | `validate_merged_extraction` | Gates canonical linkers |

### Canonicalization

| Step | Deploy | Notes |
|------|--------|-------|
| Link canonical claims | `link_canonical_claims` | Required after merge QA passes |
| Link canonical events | `link_canonical_events` | Optional (claims-only pipeline) |
| Link canonical positions | `link_canonical_positions` | Optional (claims-only pipeline) |
| Update stances | `update_stances` | Optional stance backfill |

Canonical linkers require `stories.extraction_qa_status = passed` (or admin **Approve QA** override).

Steps marked **inactive** in the UI are not in `activation.yaml` — cron may not be scheduled even though Run works via service role.

## Pipeline panel

On `/admin/stories/[story_id]`, the right pane shows a stage-grouped checklist. Each step can be run individually via **Run** (one step at a time).

While a step runs, the row shows a spinner and the page polls `GET /api/admin/stories/[id]/extraction-review` every **2 seconds** until output changes or completion criteria are met (max ~72 seconds), then stops automatically.

Steps with batch limits (`validate_chunk_claims`, `update_stances`) may need multiple **Run** clicks if the story has more than 20 chunks. **Extract** runs one chunk per click.

When QA returns `needs_human_review`, the checklist shows a blocked state. Use **Approve QA** (sidebar or pipeline banner) to unblock canonical steps.

### Clear extraction

**Clear extraction** resets one story to “chunks only, awaiting extraction”:

- Deletes story-level extractions, QA artifacts, and feedback
- Resets chunk/story extraction and QA columns (chunk `content` is kept)
- Deletes **orphan-only** canonical rows (`claims`, `events`, `canonical_positions`) that were linked only to this story—shared canonical rows on other stories are preserved

Requires confirmation in the UI and `{ confirm: true }` on the API.

Implemented by RPC `reset_story_extraction` (migration `131_reset_story_extraction.sql`).

## Routes

| Path | Purpose |
|------|---------|
| `/admin/stories` | Search and filter stories; open review |
| `/admin/stories/[story_id]` | Two-pane review: article (left), pipeline panel (right) |

## API (admin JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stories/list` | Paginated search. Query: `title`, `source`, `keyword`, `sort` (`recent` \| `relevant`), `limit`, `offset` |
| `GET` | `/api/admin/stories/[id]/extraction-review` | Full review payload: story, entities, links, feedback, chunks, ingestion fields |
| `POST` | `/api/admin/stories/[id]/feedback` | Submit like/dislike on an entity |
| `POST` | `/api/admin/stories/[id]/qa-override` | Admin approve QA (`include_chunks` optional) |
| `POST` | `/api/admin/stories/[id]/clear-extraction` | Body: `{ confirm: true }`. Calls `reset_story_extraction` RPC |
| `POST` | `/api/admin/stories/[id]/run-step` | Body: `{ step: "<step_id or deploy_name>" }`. Invokes one edge function for this story |

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

1. Apply migrations through `131_reset_story_extraction.sql` (and `130_extraction_qa.sql`, `126`, `124`/`125` if not already applied).
2. Ensure admin role on your user (see auth docs).
3. Run the app with service role key configured.

## Manual test: clear + pipeline walkthrough

1. Open a story on `/admin/stories/[id]`.
2. **Ingestion** — Run relevance → scrape → clean as needed; confirm ingestion fields in step detail.
3. **Extraction** — **Clear extraction** if testing from scratch → Run Chunk → Extract (repeat per chunk) → Validate → Merge → merge QA.
4. Walk merge QA → canonical steps. Re-run validate if >20 chunks.
5. Confirm blocked state when QA returns `needs_human_review`; **Approve QA** unblocks canonical steps.
6. Clear a story whose canonical claim is shared with another story; shared data for that claim must remain.
