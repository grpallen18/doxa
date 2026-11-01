# Explore user feedback (saves, critiques, polls)

Signed-in writes on **`/c/[uid]`**. Schema: migration `200_consumer_explore_projections.sql`. HTTP: [API_ENDPOINTS.md](../API_ENDPOINTS.md).

The root README **Topic Lifecycle** (steps 7–8) still describes clustered critiques triggering a new `topic_version`. **That publish path is not wired.** Rows persist; they do not revise debates, reopen the publish gate, or change Neo.

## Intent

Collect structured dissent and bookmarks while the analytical spine is rebuilt. Treat every write as **telemetry**, not an editorial action.

| Live | Not live |
|------|----------|
| Save / unsave an **open** controversy | A saved-debates list (profile copy mentions the loop; `/profile` has no list) |
| Critique a controversy or a proposition | Critique a **viewpoint** (API accepts `target_kind=viewpoint`; no UI posts it) |
| Vote on a seeded poll | Create / edit polls (no insert API or admin UI) |
| `GET /api/explore/revision-candidates` count ≥ 3 | A `topic_version` publish, L3 proposal, or debate rebuild from those counts |

## Surfaces

| UI | Writes |
|----|--------|
| `/c/[uid]` header **Save** | `POST` / `DELETE` `/api/explore/saves` — `ControversyQuestionHeader` |
| Bottom **Feedback on this debate** | `POST` `/api/explore/critiques` with `target_kind: "controversy"` |
| Evidence sheet on a sample proposition | Same critiques route with `target_kind: "proposition"` |
| **Polls** section | Shown only when `GET /api/explore/polls?target_uid=` returns rows; vote `POST` `{ poll_id, choice }` |

All of these sit behind the session middleware (`lib/supabase/middleware.ts`). Unsigned-in visitors see “Sign in to …” copy; the APIs return **401**.

`DEBATE_REBUILD_MODE=true` **503s** controversy **reads** (`GET /api/explore/controversies/[uid]`). Saves / critiques / polls do **not** check that flag — they still write if the page is open from before rebuild, or if you POST directly.

The header label **Revised {date}** is `graph_controversies.updated_at` (last projection), not a feedback-triggered revision.

## Tables and RLS

| Table | Who can read | Who can write |
|-------|--------------|---------------|
| `user_saved_controversies` | Own rows | Own insert / delete. PK `(user_id, controversy_uid)`. FK → `graph_controversies.uid` |
| `user_critiques` | **Own rows only** | Own insert. No unique key — repeats are allowed. No FK to the target |
| `explore_polls` | `anon` + `authenticated` SELECT | No app INSERT policy — seed with the service role or SQL |
| `explore_poll_votes` | Authenticated SELECT (all votes) | Own upsert (`agree` \| `disagree` \| `unsure`) |

Critiques and saves use the **user** Supabase client (`createClient()`), so RLS applies. There is no admin inbox or Observability tile for these tables.

## Saves

```http
POST /api/explore/saves
DELETE /api/explore/saves
{ "controversy_uid": "…" }
```

Upsert / delete on `(user_id, controversy_uid)`. The detail query sets `saved` from that row (`lib/explore/queries.ts`). Detail itself is **open-only** (`.eq('status', 'open')`), so the Save button only appears on published debates.

A developing/closed uid can still be saved if you POST it (FK only checks the row exists). Nothing in `/home` or `/profile` lists saves.

## Critiques

```http
POST /api/explore/critiques
{
  "target_kind": "controversy" | "viewpoint" | "proposition",
  "target_uid": "…",
  "reason": "missing_fact" | "bad_representation" | "weak_support" | "other",
  "detail": "optional"
}
```

Invalid kind/reason/uid → **400** `"Invalid critique payload"`. Success `{ ok: true }` and a toast. No rate limit, no dedupe, no admin review queue.

UI defaults: debate form starts at `bad_representation`; evidence sheet starts at `weak_support`.

## Polls

```http
GET  /api/explore/polls?target_uid=
POST /api/explore/polls
{ "poll_id": "…", "choice": "agree" | "disagree" | "unsure" }
```

`ExplorePollPanel` returns **null** when the list is empty — that is the usual production state (no seed in migrations). GET still needs a session (middleware), even though table RLS allows anon SELECT.

There is no “you already voted” UI. Repeat POSTs upsert the same `(poll_id, user_id)`.

Seed example (service role / SQL editor):

```sql
INSERT INTO public.explore_polls (target_kind, target_uid, question)
VALUES ('controversy', '<open-uid>', 'Is this framing fair?');
```

## Revision candidates (advisory)

```http
GET /api/explore/revision-candidates
```

In-process count of the **caller’s** critiques (`limit` 500, newest first). Targets with count ≥ **3** are returned with:

```json
{
  "threshold": 3,
  "candidates": [{ "target_kind": "controversy", "target_uid": "…", "count": 3 }],
  "note": "Revision gate is advisory until topic_version publishing is wired."
}
```

Because `user_critiques_select_own` hides other users’ rows, **three of your own critiques on one target** trip the threshold — not three distinct readers. No page calls this route. It does not write `topic_version`, enqueue L3, or flip `graph_controversies.status`.

## Pitfalls

- **README / profile imply a live revision loop.** Writes land in Postgres only. Publish / L3 / Neo stay on the debate pipeline — [admin-graph-controversies-and-publish-gate.md](./admin-graph-controversies-and-publish-gate.md).
- **Empty Polls section** is expected until someone inserts `explore_polls`. Do not treat that as a projection miss.
- **`GET /api/explore/revision-candidates` looks global** and is not. Service-role SQL is required for a real aggregate.
- **No viewpoint critique control** — do not document `/c` as covering all three `target_kind` values.
- **Orphan critiques** — `target_uid` is unconstrained text; deleting a controversy does not cascade critiques.
- **Rebuild mode** — home/search empty, controversy GET 503, but feedback POSTs still succeed.
