# Doxa API Endpoints

Session-gated Next.js routes unless noted. Middleware (`lib/supabase/middleware.ts`) returns **401 JSON** for `/api/*` without a cookie session, except `/api/mcp/*` and `/api/slack/*` (those use Bearer tokens or Slack signatures).

**Debate rebuild:** when `DEBATE_REBUILD_MODE=true`, explore home/search/inventory return empty maintenance payloads; controversy detail returns **503**.

---

## Authentication

| Surface | Auth |
|---------|------|
| Explore, topics, viewpoints, theme | Signed-in session |
| `/api/admin/*` | Session **and** JWT role `admin` (else **403**) |
| `/api/mcp/*` | `Authorization: Bearer <DOXA_MCP_TOKEN>` on POST; GET is unauthenticated discovery |
| `/api/slack/events`, `/api/slack/interactions` | Slack signing secret (`x-slack-signature`) |
| `/api/slack/notify`, `/api/slack/run-summary`, `/api/slack/worker-run-summary` | Bearer `SLACK_NOTIFY_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` |

Error shape for session-gated routes:

```json
{ "data": null, "error": { "message": "Authentication required" } }
```

Explore routes often return `{ error: "…" }` without the `data` wrapper.

---

## Explore (product)

These back `/home`, `/search`, `/c/[uid]`, `/topics/[slug]`.

### `GET /api/explore/home`

Trending open controversies (`graph_controversies`) and featured topic hubs.

```json
{ "controversies": [/* list items */], "topics": [/* hubs */] }
```

Rebuild mode: `{ "maintenance": true, "message": "…", "controversies": [], "topics": [] }`.

### `GET /api/explore/search?q=`

ILIKE over open controversies, published/stable/under_review topics, and projected people.

```json
{ "controversies": [], "topics": [], "people": [] }
```

Empty `q` returns empty arrays. Rebuild mode: `{ "maintenance": true, "results": [], "controversies": [], "topics": [] }`.

### `GET /api/explore/controversies/[uid]`

Controversy detail. Optional `?evidence=1` inlines the evidence bundle. **404** if missing. Rebuild: **503**.

### `GET /api/explore/controversies/[uid]/evidence?proposition_uid=`

Evidence excerpts for one proposition on that controversy. **400** without `proposition_uid`.

### `GET /api/explore/topics/[slug]`

Topic hub (core facts + linked controversies). **404** if missing.

### `GET /api/explore/inventory`

Diagnostic: Neo projection counts and topic-hub density. HTML by default; `?format=json` or `Accept: application/json` for JSON.

### Writes (session user)

| Method | Path | Body / notes |
|--------|------|----------------|
| `POST` / `DELETE` | `/api/explore/saves` | `{ "controversy_uid": "…" }` → `user_saved_controversies` |
| `POST` | `/api/explore/critiques` | `{ "target_kind", "target_uid", "reason", "detail?" }` — kinds: `controversy` \| `viewpoint` \| `proposition`; reasons: `missing_fact` \| `bad_representation` \| `weak_support` \| `other` |
| `GET` | `/api/explore/polls?target_uid=` | Polls for a target |
| `POST` | `/api/explore/polls` | `{ "poll_id", "choice" }` — choice: `agree` \| `disagree` \| `unsure` |
| `GET` | `/api/explore/revision-candidates` | Critique aggregates with count ≥ 3 |

People pages (`/people`, `/people/[uid]`, `/people/[uid]/eidos`) are **SSR** from `graph_people` — no dedicated people API.

---

## Topics / viewpoints (legacy Postgres)

Still used for topic hubs and some admin. **Not** the product controversy surface.

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/topics` | `?status=` `?limit=` `?offset=` — `topic_id`, slug, title, summary, status, metadata, timestamps, `topic_description` |
| `GET` | `/api/topics/[id]` | Topic + viewpoints |
| `GET` | `/api/topics/search` | Topic search helper |
| `GET` | `/api/viewpoints` | Optional `?topic_id=` |

There is **no** `POST /api/topics` on this route. Admin topic create, if present, is a separate admin path.

---

## Theme (signed-in)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/theme-presets` | Optional `?mode=light\|dark` |
| `GET` / `PUT` | `/api/theme-preference` | PUT: `theme_mode` (`light` \| `dark` \| `system`) and/or `preset_mode` + `preset_id` (UUID) together |

Persisted on `users.theme_mode`, `theme_light_preset_id`, `theme_dark_preset_id`.

---

## MCP (Grok bots)

`POST /api/mcp/l3` — JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`). Transport segment is `[transport]`; production wiring uses `l3`.

`GET /api/mcp/l3` — unauthenticated `{ name, transport, tools }` (tool **names** only). POSTs without a valid Bearer return JSON-RPC **401**.

Setup: [integrations/grok-bots/README.md](integrations/grok-bots/README.md). Allowlist: `lib/l3/mcp-allowlist.ts`.

---

## Slack (L3 approvals + run summaries)

HTTP lives in the Next.js app, not a Bolt process. Manifest: [integrations/slack-l3-approvals/README.md](integrations/slack-l3-approvals/README.md).

| Method | Path | Who calls it |
|--------|------|----------------|
| `POST` | `/api/slack/events` | Slack Events (url_verification + thread `approve` / `reject: reason`) |
| `POST` | `/api/slack/interactions` | Block actions; **Reject** opens a modal (reason ≥ 8 chars) |
| `POST` | `/api/slack/notify` | Edge `notifyPendingProposal` — body `{ "proposal_uid" }` |
| `POST` | `/api/slack/run-summary` | Curator lease rollup — `{ "lease_id", "bot_id?" }` |
| `POST` | `/api/slack/worker-run-summary` | Editor/auditor — `{ "worker": "editor"\|"auditor", "run_id", "items", … }` |

---

## Admin (role `admin`)

High-traffic operator routes:

| Path | Purpose |
|------|---------|
| `GET /api/admin/search` | Unified search (`q`, `limit`) |
| `GET /api/admin/dashboard-metrics` | Admin Center cards |
| `GET /api/admin/health-metrics` | Observability KPI sections |
| `GET /api/admin/metrics-range` / `metrics-snapshot` | Time-window vs point-in-time |
| `GET /api/admin/observability/pipeline-counts` | Funnel: ingest → scrape → graph jobs → Neo → L3 |
| `GET /api/admin/observability/scrape-stats` | `?range=1h\|24h\|7d` |
| `GET /api/admin/observability/scrape-stats-by-source` | Per-publisher scrape |
| `GET /api/admin/observability/scrape-drilldown` | Failure detail |
| `GET /api/admin/l3-proposals?status=` | Default `pending_approval`; `all` skips filter; limit 80 |
| `POST /api/admin/l3-proposals` | `{ action, proposal_uid, … }` — `reject`, `validate`, `accept_op`, `apply`, `revert` |
| `GET /api/admin/l3-metrics` | Queue / proposal / density signals |
| `GET/POST /api/admin/stories/…` | Story list, extraction review, run-step, revert |
| `/api/admin/neo/*` | AuraDB inspection (server-side Neo4j creds) |
| `/api/admin/agents/[stepId]/*` | Prompt store + run history |

`apply` / `revert` on L3 proposals invoke Edge `apply_l3_proposals` with the service role. **503** if `SUPABASE_SERVICE_ROLE_KEY` is missing.

---

## Status codes

- `200` — Success (Slack notify may also return `{ ok: false, skipped: true }` on 200)
- `400` — Bad request
- `401` — No session / bad Slack signature / bad MCP Bearer
- `403` — Signed in but not admin
- `404` — Missing controversy/topic/preset
- `429` — MCP rate limit
- `500` / `502` / `503` — Server, Edge invoke failure, or debate rebuild / missing config
