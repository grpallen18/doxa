# API Endpoint Testing Guide

## Prerequisites

1. **`.env.local`** in the repo root with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Admin/Edge invokes also need `SUPABASE_SERVICE_ROLE_KEY`.
2. **Dev server:** `npm run dev` (Next.js 15 App Router).
3. **A signed-in cookie** for anything except `/api/mcp/*` and `/api/slack/*`. Unauthenticated `/api/*` returns **401 JSON**, not HTML.

Do not expect migrations `010`/`011` or `seed_new_schema.sql` to populate the product. Explore data comes from `graph_*` projections after graph-worker + `project_debate_summaries`.

## Manual checks (no session)

These should succeed or fail in a predictable way without logging in:

```bash
# 401 — session required
curl -s -o /tmp/doxa-topics.json -w "%{http_code}\n" http://localhost:3000/api/topics
# expect 401 and {"data":null,"error":{"message":"Authentication required"}}

# 200 — MCP discovery (tool names only; no token)
curl -s http://localhost:3000/api/mcp/l3
# expect {"name":"doxa-l3","transport":"streamable-http","tools":[...]}
```

`node test-api.js` runs the same two checks (plus a short wait for `npm run dev`).

## Manual checks (signed-in)

Use the browser while logged in, or copy the `sb-*-auth-token` cookie into `curl -H 'Cookie: …'`.

| URL | Expect |
|-----|--------|
| `/api/explore/home` | `{ controversies, topics }` or rebuild `{ maintenance: true, … }` |
| `/api/explore/search?q=tax` | `{ controversies, topics, people }` |
| `/api/explore/inventory?format=json` | Projection counts + hubs |
| `/api/theme-preference` | `{ data: { preference }, error: null }` |

Admin (role `admin` only):

| URL | Expect |
|-----|--------|
| `/api/admin/observability/pipeline-counts` | Funnel snapshot |
| `/api/admin/l3-proposals?status=pending_approval` | `{ data: { items } }` |
| `/api/admin/l3-metrics` | Queue + density |

**403** from `/api/admin/*` means the session is valid but the JWT role is not `admin`.

## Debate rebuild

If home shows “Public debate surfaces are paused…”:

- `DEBATE_REBUILD_MODE` is the string `true` in `.env.local` / Vercel.
- Controversy API returns **503**; home/search return empty lists with `maintenance: true`.

## MCP (token)

Token from `npx tsx scripts/generate-l3-mcp-tokens.ts` (gitignored `integrations/grok-bots/mcp-tokens.local.env`):

```bash
curl -s -X POST http://localhost:3000/api/mcp/l3 \
  -H "Authorization: Bearer $DOXA_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Unauthorized POST → JSON-RPC error `unauthorized` with HTTP **401**.

Full Grok wiring: [integrations/grok-bots/README.md](integrations/grok-bots/README.md).

## Troubleshooting

### 401 on every `/api/*`

Expected without a session. Sign in at `/login`, or use MCP/Slack paths that have their own auth.

### Empty explore results

Run graph-worker jobs, then Edge `project_debate_summaries`. Inventory guidance on `/api/explore/inventory` lists next steps. Person list stays empty until `project_person_profiles`.

### Admin stories / run-step “Invalid API Key” or 503

`SUPABASE_SERVICE_ROLE_KEY` must match the same project as `NEXT_PUBLIC_SUPABASE_URL`. Restart `npm run dev` after editing `.env.local`. See [ENV_SETUP.md](ENV_SETUP.md).

### Slack notify 401

Caller must send Bearer `SLACK_NOTIFY_SECRET` or the service role key. Events/interactions need a valid Slack signature, not a session cookie.

## Automated

```bash
npm run test:e2e    # Playwright (needs a running app + test user as configured)
node test-api.js    # 401 + MCP GET smoke (dev server must be up)
```
