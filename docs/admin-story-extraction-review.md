# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline extraction output. Automated chunk/merge QA runs in the pipeline; admin UI supports human review, override, **clear**, and **step-by-step pipeline runs**.

## QA pipeline

After extract: `review_chunk_extraction` → `refine_chunk_extraction` (optional, max 1×) → `validate_chunk_extraction` (`atoms_passed`) → `link_chunk_entities` (`passed`).

Chunk `extraction_json` phase A: atoms with provenance only. Phase B: semantic `*_links` arrays added by the link step.

After merge: `review_merged_extraction` → `refine_merged_extraction` (optional, max 1×) → `validate_merged_extraction`.

Canonical linkers require `stories.extraction_qa_status = passed` (or admin **Approve QA** override).

## Pipeline tab

On `/admin/stories/[story_id]`, the **Pipeline** tab shows a checklist from chunking through canonicalization. Each step can be run individually via **Run** (one step at a time).

While a step runs, the row shows a spinner and the page polls `GET /api/admin/stories/[id]/extraction-review` every **5 seconds** until the step’s completion criteria are met (max ~3 minutes), then stops automatically.

Steps with batch limits (extract, chunk QA) may need multiple **Run** clicks if the story has more than 20 chunks.

When QA returns `needs_human_review`, the checklist shows a blocked state. Use **Approve QA** (sidebar or pipeline banner) to unblock canonical steps.

### Clear extraction

**Clear extraction** resets one story to “chunks only, awaiting extraction”:

- Deletes story-level extractions, QA artifacts, and feedback
- Resets chunk/story extraction and QA columns (chunk `content` is kept)
- Deletes **orphan-only** canonical rows (`claims`, `events`, `canonical_positions`) that were linked only to this story—shared canonical rows on other stories are preserved

Requires confirmation in the UI and `{ confirm: true }` on the API.

Implemented by RPC `reset_story_extraction` (migration `131_reset_story_extraction.sql`). Apply that migration in Supabase SQL Editor on deployed DBs.

## Routes

| Path | Purpose |
|------|---------|
| `/admin/stories` | Search and filter stories; open review |
| `/admin/stories/[story_id]` | Two-pane review: article (left), extraction tabs (right) |

## API (admin JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stories/list` | Paginated search. Query: `title`, `source`, `keyword`, `sort` (`recent` \| `relevant`), `limit`, `offset` |
| `GET` | `/api/admin/stories/[id]/extraction-review` | Full review payload: story, entities, links, feedback, chunks |
| `POST` | `/api/admin/stories/[id]/feedback` | Submit like/dislike on an entity |
| `POST` | `/api/admin/stories/[id]/qa-override` | Admin approve QA (`include_chunks` optional) |
| `POST` | `/api/admin/stories/[id]/clear-extraction` | Body: `{ confirm: true }`. Calls `reset_story_extraction` RPC |
| `POST` | `/api/admin/stories/[id]/run-step` | Body: `{ step: "<step_id or deploy_name>" }`. Invokes one edge function for this story |

**run-step** allowlist (deploy names): `chunk_story_bodies`, `extract_story_entities`, `review_chunk_extraction`, `refine_chunk_extraction`, `validate_chunk_extraction`, `link_chunk_entities`, `merge_story_entities`, `review_merged_extraction`, `refine_merged_extraction`, `validate_merged_extraction`, `link_canonical_claims`, `link_canonical_events`, `link_canonical_positions`, `update_stances`.

Batch steps pass `{ story_id, max_chunks: 20 }`; others pass `{ story_id }`.

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (service-role client for reads/writes and edge invokes).

Checklist logic: `lib/admin/story-pipeline-checklist.ts`.

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
| `merged` | `stories.merged_at` set (`merge_story_entities` ran) |
| `extracted` | `extraction_completed_at` set |
| `skipped_empty` | `extraction_skipped_empty` true |
| `pending_extraction` | Otherwise |

## Markdown export

On the review page **Export** tab (or programmatically via `buildExtractionReviewMarkdown` in `lib/admin/story-extraction-review.ts`):

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

1. Open a merged story on `/admin/stories/[id]`.
2. **Pipeline** tab → **Clear extraction** → confirm. Entities empty, chunks retain content, `extraction_json` null.
3. **Run** Chunk → Extract → watch checklist advance (spinner + ~5–15s polling).
4. Walk chunk QA → merge → merge QA → canonical steps. Re-run review/validate if >20 chunks.
5. Confirm blocked state when QA returns `needs_human_review`; **Approve QA** unblocks canonical steps.
6. Clear a story whose canonical claim is shared with another story; shared data for that claim must remain.
