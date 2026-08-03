# Environment Variables Setup

## .env.local File Format

Your `.env.local` file should be in the **root directory** of the project and have this exact format:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
# Required for admin write ops (run-step, clear extraction, QA override):
SUPABASE_SERVICE_ROLE_KEY=your_secret_or_service_role_key
```

**Preview branch:** copy `.env.local.branch.example` → `.env.local.branch`, fill keys from the [preview dashboard](https://supabase.com/dashboard/project/iyuwxdjauhlaeejstlde/settings/api-keys), then `npm run env:branch`. URL and keys must be from the **same** project.

## Important Notes

1. **No spaces around the `=` sign**
   - ✅ Correct: `NEXT_PUBLIC_SUPABASE_URL=https://...`
   - ❌ Wrong: `NEXT_PUBLIC_SUPABASE_URL = https://...`

2. **No quotes needed** (unless the value has spaces)
   - ✅ Correct: `NEXT_PUBLIC_SUPABASE_URL=https://...`
   - ❌ Wrong: `NEXT_PUBLIC_SUPABASE_URL="https://..."`

3. **No trailing spaces** at the end of lines

4. **File must be named exactly**: `.env.local` (starts with a dot)

5. **Must be in project root** (same directory as `package.json`)

## Verification

After creating/editing `.env.local`:

1. **Restart the dev server** (this is critical!)
   - Stop: `Ctrl+C` in the terminal running `npm run dev`
   - Start: `npm run dev`

2. **Check the terminal output** - you should see:
   ```
   ✓ Ready in X seconds
   ```

3. **Test an endpoint**:
   ```
   http://localhost:3000/api/viewpoints
   ```

## Troubleshooting

### Admin stories search shows "Invalid API Key"?

Story **search and review reads** use your logged-in session (publishable/anon key). **Run**, **Clear extraction**, and **QA override** need `SUPABASE_SERVICE_ROLE_KEY`.

1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is the **secret** key (`sb_secret_...`) or legacy **service_role** JWT — not `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Confirm it matches `NEXT_PUBLIC_SUPABASE_URL` (same project ref in the URL and dashboard).
3. Restart `npm run dev` after editing `.env.local`.
4. For preview branch work: `npm run env:branch` and use keys from project `iyuwxdjauhlaeejstlde`.

### Still getting "Missing environment variables" error?

1. **Verify file location**: `.env.local` should be next to `package.json`
2. **Check file name**: Must be exactly `.env.local` (not `env.local` or `.env`)
3. **Restart server**: Environment variables are only loaded when the server starts
4. **Check for typos**: Variable names must be exactly:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **No BOM/encoding issues**: Save as UTF-8 without BOM

### Edge Functions (Supabase secrets)

Edge Functions use secrets set in **Supabase** (not in `.env.local`): Dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=value`.

**Which keys each step needs:** [doxa-agents/docs/generated/secrets.md](doxa-agents/docs/generated/secrets.md) (auto-generated from handler code).

**Cron Vault secrets:** `project_url`, `service_role_key` (Database → Vault).

**Pipeline docs:** [doxa-agents/AGENTS.md](doxa-agents/AGENTS.md) · **Deploy:** [doxa-agents/docs/generated/deploy.md](doxa-agents/docs/generated/deploy.md) · **Crons:** [doxa-agents/docs/generated/cron-jobs.md](doxa-agents/docs/generated/cron-jobs.md)

After changing handlers or cron SQL, run `npm run agents:refresh`.

### Scrape workflow (Cloudflare Worker secrets)

The Worker used for article scraping expects these **secrets**. For Git-connected deploys, add them in **Build → Variables and secrets** and use `bash deploy-with-secrets.sh` as the deploy command. For manual deploys, use **Workers & Pages → your worker → Settings → Variables and Secrets**:

- **`SCRAPE_SECRET`** — Same value as Supabase; protects `/scrape` and authenticates callbacks to receive_scraped_content.
- **`SUPABASE_RECEIVE_URL`** — Full URL of the receive_scraped_content Edge Function (e.g. `https://<project_ref>.supabase.co/functions/v1/receive_scraped_content`).
- **`CLOUDFLARE_ACCOUNT_ID`** — For Browser Rendering fallback (optional).
- **`CLOUDFLARE_API_TOKEN`** — For Browser Rendering fallback; token must have "Browser Rendering - Edit" permission.

See [workers/README.md](workers/README.md) for details.

### Neo4j graph worker (Python)

The hybrid graph path uses AuraDB + [`services/graph-worker`](services/graph-worker/). Steering: [doxa-agents/docs/architecture/neo4j-graph-architecture.md](doxa-agents/docs/architecture/neo4j-graph-architecture.md).

**Supabase Edge secrets** (in addition to existing OpenAI keys):

| Secret | Used by |
|--------|---------|
| `GRAPH_WORKER_URL` | `trigger_graph_worker` — base URL of the Azure/Docker worker (no trailing slash) |
| `GRAPH_WORKER_SECRET` | `trigger_graph_worker` — optional Bearer shared with the worker |

**Next.js admin Neo page** (server-only; same Aura credentials as the worker — add to root `.env.local` and Vercel):

| Variable | Required |
|----------|----------|
| `NEO4J_URI` | yes (`neo4j+s://…`) |
| `NEO4J_USERNAME` | yes (Aura instance id / username) |
| `NEO4J_PASSWORD` | yes |
| `NEO4J_DATABASE` | yes on Aura (often the instance id, **not** `neo4j`) |

Restart `npm run dev` after changing these. Credentials never ship to the browser; only `/api/admin/neo/*` (admin JWT) queries Neo4j.

**Graph worker env** (Azure Container Apps / Docker — see `services/graph-worker/.env.example` and `services/graph-worker/azure/`):

| Variable | Required |
|----------|----------|
| `SUPABASE_URL` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | yes |
| `NEO4J_URI` | yes (`neo4j+s://…`) |
| `NEO4J_USERNAME` | yes |
| `NEO4J_PASSWORD` | yes |
| `NEO4J_DATABASE` | yes on Aura (instance id; default `neo4j` only for local) |
| `OPENAI_API_KEY` | yes |
| `OPENAI_MODEL` | no |
| `GRAPH_WORKER_ID` | no |
| `GRAPH_WORKER_POLL_INTERVAL_SEC` | no |
| `GRAPH_WORKER_SECRET` | no (must match Edge if set) |
| `PORT` | no (host sets `PORT`) |

**One-time setup**

1. Create a Neo4j AuraDB instance; run [`services/graph-worker/neo4j/init_constraints.cypher`](services/graph-worker/neo4j/init_constraints.cypher).
2. Apply migration `192_graph_processing_jobs.sql` in the Supabase SQL Editor.
3. Deploy the graph-worker on **Azure Container Apps**: see [`services/graph-worker/azure/README.md`](services/graph-worker/azure/README.md) (`.\azure\deploy.ps1`). No local Docker required.
4. Set Supabase Edge secrets `GRAPH_WORKER_URL` + `GRAPH_WORKER_SECRET` from the deploy script output.
5. Deploy Edge functions: `clean_scraped_content`, `enqueue_graph_job`, `trigger_graph_worker` (use `--no-verify-jwt` where listed in [deploy.md](doxa-agents/docs/generated/deploy.md)).
6. Keep ingestion crons active so at least one cleaned story is enqueued per day; the Azure worker polls continuously (`min-replicas=1`).
### Check if variables are loaded:

Add this temporarily to any API route to debug:
```typescript
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing')
```
