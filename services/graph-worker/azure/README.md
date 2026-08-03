# Deploy graph-worker on Azure Container Apps

Goal: keep one always-on replica that polls Supabase `graph_processing_jobs` and processes stories into Neo4j (Phase 0). For “at least one story per day,” also keep ingestion crons active so jobs are enqueued.

**No local Docker required** — images build in Azure Container Registry via `az acr build`.

## Prerequisites

1. **Azure CLI** for Windows: https://learn.microsoft.com/cli/azure/install-azure-cli-windows  
   Install, then open a **new** PowerShell window.
2. `az login` (and `az account set --subscription "..."` if you have more than one).
3. Neo4j Aura constraints already applied (`neo4j/init_constraints.cypher`).
4. Supabase migration `192_graph_processing_jobs.sql` applied.
5. Secrets ready: Supabase URL + service role key, Aura URI/password, OpenAI API key.

## First deploy

```powershell
cd services\graph-worker\azure
copy .env.azure.example .env.azure
# Edit .env.azure with real values (notepad .env.azure)

cd ..
.\azure\deploy.ps1
```

Optional overrides:

```powershell
.\azure\deploy.ps1 -ResourceGroup doxa-rg -Location eastus -AcrName myuniqueacrname
```

The script will print:

- Health URL: `https://…/health`
- `GRAPH_WORKER_URL` and `GRAPH_WORKER_SECRET` for Supabase

## Wire Supabase

In **Supabase → Project Settings → Edge Functions → Secrets** (or CLI secrets):

| Name | Value |
|------|--------|
| `GRAPH_WORKER_URL` | `https://<fqdn>` (no trailing slash) |
| `GRAPH_WORKER_SECRET` | same secret the script printed |

Deploy/ensure these Edge functions exist:

- `enqueue_graph_job`
- `trigger_graph_worker`
- `clean_scraped_content` (already enqueues graph jobs after clean)

## Verify

```powershell
curl https://<fqdn>/health
```

Then enqueue one story (admin or `enqueue_graph_job`). Within ~minutes `stories.graph_status` should move to `succeeded` (or `quarantined`/`failed` with an error). Confirm `Document` / `Utterance` nodes in Neo4j Browser.

## Redeploy after code changes

```powershell
cd services\graph-worker
.\azure\deploy.ps1
```

Reuses the resource group / ACR / app and pushes a new image revision.

Skip rebuild (only refresh env/secrets):

```powershell
.\azure\deploy.ps1 -SkipBuild
```

## Cost / scale notes

- Default: **1 always-on replica** (`min-replicas=1`) so the poll loop runs 24/7 — enough for daily volume.
- ~0.5 vCPU / 1 GiB — suitable for light daily load.
- To pause: set min replicas to 0 in Portal, or `az containerapp update -n doxa-graph-worker -g doxa-rg --min-replicas 0`.

## Daily story pipeline (full path)

```text
NewsAPI ingest (cron) → scrape → clean → graph_processing_jobs
  → Azure graph-worker (this app) → Neo4j Aura
```

If no jobs appear, the worker is healthy but idle — fix ingestion/`activation.yaml` / pg_cron, not the Container App.
