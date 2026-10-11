# Admin Neo explorer

3D union graph at **`/admin/neo/union`**. Story index and reprocess at **`/admin/neo`**. Admin JWT required.

Nav: Admin Center → Neo. Debate catalog → **Open in Neo** deep-links here.

Steering: [doxa-agents/docs/architecture/neo4j-graph-architecture.md](../doxa-agents/docs/architecture/neo4j-graph-architecture.md)  
Env: [ENV_SETUP.md](../ENV_SETUP.md) (Next.js `NEO4J_*`)

## Intent

Inspect Aura after the Python graph-worker and `debate_pipeline` have written L0–L3. The explorer is a **read path** (plus enqueue-only reprocess). It does not run extractors.

Canonical view is the **3D union nebula** (`components/admin/neo/neo-union-workspace.tsx` → `union-nebula-3d.tsx`). Per-story and hub Sigma pages redirect here.

## Routes

| Path | Role |
|------|------|
| `/admin/neo` | Stories with `graph_status` + Reprocess |
| `/admin/neo/union` | Union explorer (3D) |
| `/admin/neo/union?focus=document:{storyId}` | Focus a Document |
| `/admin/neo/union?focus=controversy:{uid}` | Focus a Controversy |
| `/admin/neo/union?focus=question:{uid}` | Focus a Question |
| `/admin/neo/union?focus=proposition:{uid}` | Focus a Proposition |
| `/admin/neo/union?focus=entity:{uid}` | Focus an Entity |
| `/admin/graph-controversies` | Postgres debate catalog; links into union `?focus=` |
| `/admin` | Kind colors (`/api/admin/neo/kind-colors`) |

Retired URLs redirect to union focus:

- `/admin/neo/{storyId}` → `?focus=document:{storyId}`
- `/admin/neo/hub/{kind}/{uid}` → `?focus={kind}:{uid}`
- `/admin/neo/union-2`, `/admin/neo/union-3` → `/admin/neo/union`

`?focus=` accepts a raw projected node id or `kind:uid` (`lib/admin/neo-graph/union-v2-focus.ts`).

## APIs (`requireAdmin`)

All Neo4j routes return **503** if `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` are missing (`lib/neo4j/server.ts`).

| Method | Path | Purpose |
|--------|------|---------|
| GET / POST | `/api/admin/neo/union` | Ontology projection across succeeded stories |
| GET | `/api/admin/neo/stories` | Paginated stories with graph jobs |
| GET | `/api/admin/neo/entities?q=` | Entity typeahead (min **2** chars, max **20** hits) |
| GET | `/api/admin/neo/node?id=` | Node detail drawer |
| GET / PUT | `/api/admin/neo/kind-colors` | Supabase `neo_kind_colors` row `default` |
| GET | `/api/admin/neo/documents/[storyId]/status` | Latest job fields |
| POST | `/api/admin/neo/documents/[storyId]/reprocess` | Enqueue with `force_stale` after **1** minute |

### Union query params

| Param | Effect |
|-------|--------|
| `limit` / `cap` | Story cap, clamped to **1–250** (`UNION_MAX_STORIES`) |
| `all=1` | Latest succeeded stories up to `limit` |
| `ids=` | Explicit story ids |
| `entity=` / `entityUid=` | Stories that mention that Entity |
| `fresh=1` | Bypass document-graph cache + skip ETag 304 |

UI defaults: **250** stories on desktop, **50** on coarse pointers. API default when no param: **20**.

Response includes `projection`, `documents`, `missingIds`, `caps`, `mode`, `storyCount`. Weak ETag is story-set + latest succeeded job times. `If-None-Match` → **304** unless `fresh`.

POST aliases GET (JSON body: `limit`, `fresh`, `all`, `ids` / `storyIds`, `entity` / `entityUid`).

## Workflows

```text
clean_scraped_content → graph_processing_jobs
  → graph-worker (Phase 0+1+2a in one job)
  → Neo4j Document / Utterance / Proposition / Argument
  → debate_pipeline (L3 overlay)
  → /admin/neo/union reads Aura via /api/admin/neo/union
```

**Reprocess** (story list): requires `story_bodies.content_clean`. Calls `enqueue_graph_processing_job` with `force_stale` and `ADMIN_STALE_RUNNING_MINUTES = 1`. Does **not** call `trigger_graph_worker` — the Azure poll loop (5s) picks the job up. Clears that story’s document-graph cache only.

**Local smoke (no Aura):** `npm run test:neo-graph` → `scripts/test-neo-graphology-adapter.ts`.

## Limits

| Constant | Value | Where |
|----------|-------|--------|
| Max stories in one union | 250 | `lib/admin/neo-graph/union-limits.ts` |
| Graphology / 3D node cap | 25 000 | `graphology-adapter.ts`, `union-3d-scene.ts` |
| Document-graph cache | 200 entries, 5 min hit / 30 s miss | `lib/neo4j/document-graph-cache.ts` |
| Cache in `development` | Always bypassed | same |
| Stories list page | default 25, max 100 | `/api/admin/neo/stories` |
| Cypher text preview | 80 chars | `lib/neo4j/queries/phase0.ts` |

## Constraints

- Admin role on `/admin` and `/api/admin` (`lib/supabase/middleware.ts` + `requireAdmin()`).
- Aura credentials stay server-side. Browser only calls same-origin `/api/admin/neo/*`.
- Union only loads stories with `graph_status = succeeded` that still have a Document in Aura.
- 2D Sigma (`projection-explorer.tsx`, `sigma-canvas.tsx`) is **unmounted** — no `app/` import. Passage/utterance highlight lives only in that unused stack.

## Pitfalls

- **503 “Neo4j is not configured”** — missing `.env.local` `NEO4J_*`. Restart `npm run dev`. Aura often needs `NEO4J_DATABASE` = instance id, not `neo4j`.
- **“No stories in Neo yet”** — no succeeded jobs, or worker never wrote Documents. Check `/admin/neo` job status and Observability funnel.
- **`missingIds`** — Postgres job `succeeded` but Aura has no graph (wrong database, wipe, or failed write after status stamp). Union still returns the rest.
- **Stale 304** — client keeps the last projection. Change depth/entity or pass `fresh=1`.
- **Reprocess no-ops** — no `content_clean`, or a `running` job younger than 1 minute. Manual Edge `enqueue_graph_job` uses a **360**-minute stale window instead.
- **“Focus in 2.0” copy** on the story list still points at `/admin/neo/union` (naming leftover).
- **Architecture/validation docs** that mention `/admin/neo/[storyId]`, hub Sigma, or a 400-node cap are historical — see banners on those files.
