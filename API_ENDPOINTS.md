# Doxa API Endpoints

Next.js App Router handlers under `app/api/`. Pipeline Edge Functions are catalogued separately: [doxa-agents/docs/generated/deploy.md](doxa-agents/docs/generated/deploy.md).

**Auth gate:** `lib/supabase/middleware.ts` requires a session for every `/api/*` route. Unauthenticated callers get **401 JSON**, not HTML:

```json
{ "data": null, "error": { "message": "Authentication required" } }
```

`/api/admin/*` additionally requires the JWT `role` claim `admin` (**403** otherwise).

## Response shapes

Two conventions coexist. Do not assume every route wraps `{ data, error }`.

| Family | Success | Error |
|--------|---------|--------|
| Topics, viewpoints, stories, theme, most admin | `{ data, error: null }` | `{ data: null, error: { message, code? } }` |
| Explore (`/api/explore/*`) | Bare payload (`{ controversies, topics }`, `{ ok: true }`, …) | `{ error: string }` |

## Explore (consumer product)

These back `/home`, `/search`, `/c/[uid]`, `/topics/[slug]`, and `/people`. Query helpers live in `lib/explore/queries.ts` and `lib/explore/person.ts`. They read **Postgres projections** (`graph_*`), not Neo4j, except person eidos which hydrates from `graph_people` (projected by `project_person_profiles`).

### GET `/api/explore/home`

Trending open controversies (ranked) plus featured topic hubs that meet the density bar (`TOPIC_HUB_DENSITY_BAR = 1` in `lib/explore-routes.ts`).

```json
{ "controversies": [ { "uid", "question", "summary", "sides_count", "source_count", "topic_slug", "topic_title", "updated_at" } ], "topics": [ { "slug", "title", "summary", "controversy_count" } ] }
```

### GET `/api/explore/search?q=`

Searches open controversies, published/stable/under_review topics, and people. Empty `q` returns empty arrays. Filter metacharacters (`%`, `_`, `,`, `.`, `(`, `)`, `'`) are stripped before `ilike`.

```json
{ "controversies": [], "topics": [], "people": [ { "uid", "name", "fire_rating", "debate_count" } ] }
```

### GET `/api/explore/controversies/[uid]`

Open controversy detail. Optional `?evidence=1` inlines the evidence bundle.

- **404** `{ "error": "Controversy not found" }` if missing or not `status = open`
- Includes viewpoints, assessments, related debates (same `topic_key`), `saved` when the caller has a row in `user_saved_controversies`

### GET `/api/explore/controversies/[uid]/evidence?proposition_uid=`

Evidence excerpts for one proposition on that controversy. **400** if `proposition_uid` is missing.

### GET `/api/explore/topics/[slug]`

Topic hub: core facts fields plus linked open controversies. **404** if the slug is unknown.

### GET `/api/explore/inventory`

Ops snapshot of projection readiness (hub density, controversy/viewpoint/excerpt counts). HTML by default; JSON with `?format=json` or `Accept: application/json`.

If hubs are empty, the payload’s `guidance` tells you to run `project_debate_summaries` (after migration 200) and/or `SELECT link_graph_controversies_to_topics();`.

### POST `/api/explore/critiques`

Signed-in structured feedback.

```json
{ "target_kind": "controversy" | "viewpoint" | "proposition", "target_uid": "<uid>", "reason": "missing_fact" | "bad_representation" | "weak_support" | "other", "detail": "optional" }
```

Writes `user_critiques`. **400** on invalid kind/reason.

### GET `/api/explore/polls?target_uid=` / POST `/api/explore/polls`

- GET lists `explore_polls` for a target.
- POST `{ "poll_id", "choice": "agree" | "disagree" | "unsure" }` upserts `explore_poll_votes` on `(poll_id, user_id)`.

### POST `/api/explore/saves` / DELETE `/api/explore/saves`

Body `{ "controversy_uid" }`. Upserts / deletes `user_saved_controversies`.

### GET `/api/explore/revision-candidates`

Advisory aggregation of the caller’s recent critiques. Targets with count ≥ 3 are returned. **Not** wired to `topic_version` publishing yet.

## Theme

Signed-in preference is stored on `users` (`theme_mode`, `theme_light_preset_id`, `theme_dark_preset_id`). SSR in `app/layout.tsx` via `lib/server-theme.ts`. Signed-out visitors keep light/dark in `localStorage` key `doxa-theme`. Marble/auth routes force light (`shouldForceLightTheme`).

### GET `/api/theme-preference`

Returns `{ preference: { theme_mode, theme_light_preset_id, theme_dark_preset_id } }`.

### PUT `/api/theme-preference`

Any non-empty subset:

```json
{ "theme_mode": "light" | "dark" | "system", "preset_mode": "light" | "dark", "preset_id": "<uuid>" }
```

`preset_mode` and `preset_id` must be sent together; the preset must exist in `theme_presets` with that mode. **400** if nothing to update.

### GET `/api/theme-presets?mode=light|dark`

Lists selectable presets (RLS SELECT). Used by `ThemePickerMenu`. Admin CRUD is `/api/admin/theme-presets`.

## Stories (KEEP feed)

### GET `/api/stories?limit=6`

Recent stories with `relevance_status = KEEP` (`limit` clamped 1–50). Shape: `{ story_id, title, url, created_at, source_name }`.

## Topics and viewpoints (SQL catalog)

Still used for topic hubs and related-topic links. **Not** the controversy product surface.

### GET `/api/topics`

Query: `?status=`, `?limit=100`, `?offset=0`. Columns include `topic_id`, `slug`, `title`, `summary`, `status`, `metadata`, `topic_description`, timestamps.

There is **no** POST create-topic handler on this route.

### GET `/api/topics/[id]`

Topic plus:

- `controversies` — `graph_controversies` rows whose `topic_key` ilike-matches slug/title (up to 50)
- `related_topics` — from `topic_relationships`

**404** `{ code: "NOT_FOUND" }` if the id is unknown.

### GET `/api/topics/search?q=&limit=20`

`searchTopics` (`limit` max 50).

### POST `/api/topics/[id]/suggest-link` (admin)

Body `{ "span_text", "target_topic_id" }`. Calls Edge Function `review_link_suggestion` with the service role, then writes markdown into `topics.summary`. Needs `SUPABASE_SERVICE_ROLE_KEY`. **503** if the server is not configured.

### GET `/api/viewpoints?topic_id=`

Rows from `viewpoints` (topic-scoped SQL table — not `graph_viewpoints`).

## Admin

All routes: session + admin role. Most use `requireAdmin()` and the service-role client (`createAdminClient`).

Operator runbook: [docs/admin-observability.md](docs/admin-observability.md). Story QA: [docs/admin-story-extraction-review.md](docs/admin-story-extraction-review.md).

| Route | Purpose |
|-------|---------|
| `GET /api/admin/dashboard-metrics?range=7d\|30d\|3m\|6m\|1y` | Admin Center sparklines (ingest, gating KEEP/DROP/pending, scrape, QA backlog) |
| `GET /api/admin/observability/pipeline-counts` | Funnel snapshot (ingest → graph jobs → Neo → `graph_*` projections) |
| `GET /api/admin/observability/scrape-stats?range=1h\|24h\|7d\|30d\|90d` | Success/failure buckets |
| `GET /api/admin/observability/scrape-stats-by-source` | Per-domain scrape stats |
| `GET /api/admin/observability/scrape-drilldown?bucket=&granularity=&outcome=` | Rows for one chart bucket |
| `GET /api/admin/graph-controversies?status=all\|open\|developing\|closed` | Projected controversies |
| `GET /api/admin/graph-controversies/[uid]` | Detail + viewpoints + evidence + assessments |
| `GET /api/admin/graph-quarantine` | Neo `Decision` rows with `status = quarantined` and type `question_match` / `question_answer` |
| `GET /api/admin/neo/entities?q=&limit=` | Entity typeahead (min 2 chars; **503** if Neo4j is not configured) |
| `GET/POST /api/admin/stories/...` | List, run-step, revert, extraction review, audit |
| `GET/PUT /api/admin/agents/[stepId]/prompt` | Prompt store |
| `GET /api/admin/theme-presets` | Admin theme catalog |

Deprecated aliases still re-export the observability scrape handlers:

- `/api/admin/health/scrape-stats`
- `/api/admin/health/scrape-stats-by-source`
- `/api/admin/health/scrape-drilldown`

Prefer the `/api/admin/observability/*` paths.

## Status codes (typical)

- **200** success
- **400** bad query/body
- **401** no session
- **403** signed in but not admin (`/api/admin/*`)
- **404** missing resource
- **500** handler/DB error
- **503** missing service role or Neo4j config

## Pitfalls

- Hitting `/api/topics` in a browser **without a session** is 401. Sign in first, or use Playwright/storageState.
- Explore controversy APIs only return **`status = open`**. Developing/closed rows still appear in admin.
- `/api/viewpoints` is the old SQL `viewpoints` table. Consumer debate columns come from `graph_viewpoints` via `/api/explore/controversies/[uid]`.
- `/api/graph` does not exist. Related topics are embedded on `GET /api/topics/[id]` and topic hubs.
- Post-login `?redirect=` is sanitized in `lib/safe-redirect.ts` (same-origin paths only). Off-site and protocol-relative values fall back to `/home`.
