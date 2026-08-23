# API and auth testing

## Prerequisites

1. `.env.local` in the repo root (`ENV_SETUP.md`). At minimum:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable>
   ```
   Admin write paths also need `SUPABASE_SERVICE_ROLE_KEY`.
2. Dev server: `npm run dev`
3. A signed-in browser session for App Router APIs (middleware returns **401** without one)

## What not to expect

`node test-api.js` calls `/api/topics` and `/api/viewpoints` **without cookies**. Those requests now 401. Use it only as a connectivity smoke test for the gate, or call the same URLs from a signed-in browser.

Do not seed with “migrations 010/011 + `seed_new_schema.sql`” as the primary path — current schema lives in `supabase/migrations/` (see `supabase/README.md`).

## Manual checks (signed in)

Open DevTools → Network after signing in at `/login`.

| Check | URL | Expect |
|-------|-----|--------|
| Explore home | `/api/explore/home` | `{ controversies, topics }` |
| Search | `/api/explore/search?q=tax` | `{ controversies, topics, people }` (arrays; may be empty) |
| Inventory | `/api/explore/inventory?format=json` | Counts + `hubs` + `guidance` |
| Theme | `/api/theme-preference` | `{ data: { preference }, error: null }` |
| Unauthenticated API | curl without cookies | `401` `{ data: null, error: { message: "Authentication required" } }` |

Controversy detail: copy a `uid` from home, then `/api/explore/controversies/<uid>`. Closed/developing rows 404 here; they still list in `/admin/graph-controversies`.

Empty hubs on inventory: run `project_debate_summaries` and/or `SELECT link_graph_controversies_to_topics();` — see [API_ENDPOINTS.md](./API_ENDPOINTS.md).

## Automated

```bash
npm run test:e2e              # Playwright: unauthenticated gate (e2e/auth-gate.spec.ts)
npx tsx scripts/test-safe-redirect.ts
```

`auth-gate.spec.ts` asserts:

- `/` is the marble landing (Sign up / Log in)
- `/welcome` → `/`
- `/home` and `/admin` redirect to `/?redirect=...`
- `/api/admin/observability/pipeline-counts` is 401 JSON
- Off-site and protocol-relative `?redirect=` values are dropped from login/sign-up hrefs

## Troubleshooting

### 401 on every `/api/*`

You are not signed in, or cookies are not sent (wrong origin, `SameSite`). Sign in at `/login` and retry from that origin.

### 403 on `/api/admin/*`

Session exists but JWT role is not `admin`. Non-admins hitting `/admin` are redirected to `/home`.

### Empty explore home

Projections may be empty. Check `/api/explore/inventory?format=json` and Admin → Observability / Debate. Pipeline: [doxa-agents/departments/06-debate-engine/debate-pipeline/README.md](doxa-agents/departments/06-debate-engine/debate-pipeline/README.md).

### Theme PUT 400

`preset_mode` and `preset_id` must be sent together, and the preset’s `mode` must match. `theme_mode` alone is valid (`light` | `dark` | `system`).

### Connection errors

Confirm `npm run dev` on port 3000 and that `.env.local` was present **before** the process started (restart after edits).
