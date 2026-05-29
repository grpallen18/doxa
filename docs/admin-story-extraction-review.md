# Admin: Story extraction review

Internal QA surface for comparing article text against pipeline extraction output. Automated chunk/merge QA runs in the pipeline; admin UI supports human review and override.

## QA pipeline

After extract: `review_chunk_extraction` → `refine_chunk_extraction` (optional, max 1×) → `validate_chunk_extraction`.

After merge: `review_merged_extraction` → `refine_merged_extraction` (optional, max 1×) → `validate_merged_extraction`.

Canonical linkers require `stories.extraction_qa_status = passed` (or admin **Approve QA** override).

## Routes

| Path | Purpose |
|------|---------|
| `/admin/stories` | Search and filter stories; open review |
| `/admin/stories/[story_id]` | Two-pane review: article (left), extraction tabs (right) |

## API (admin JWT required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stories/list` | Paginated search. Query: `title`, `source`, `keyword`, `sort` (`recent` \| `relevant`), `limit`, `offset` |
| `GET` | `/api/admin/stories/[id]/extraction-review` | Full review payload: story, entities, links, feedback |
| `POST` | `/api/admin/stories/[id]/feedback` | Submit like/dislike on an entity |

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (service-role client for reads/writes).

## Data exposed

Reads existing tables only:

- `stories`, `story_bodies`, `sources`
- `story_claims`, `story_evidence`, `story_positions`, `story_events`
- `story_claim_evidence_links`
- `story_position_claim_links`, `story_position_evidence_links`
- `story_event_claim_links`, `story_event_evidence_links`
- `story_position_event_context` (derived position↔event paths; not a stored extraction edge)
- `story_extraction_feedback` (human QA signals)

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

Migration `126_story_extraction_feedback.sql`. Passive dataset for future evals and prompt tuning—not wired into the pipeline.

## Setup

1. Apply migrations through `126_story_extraction_feedback.sql` (and `124`/`125` if not already applied for renamed link tables).
2. Ensure admin role on your user (see auth docs).
3. Run the app with service role key configured.
