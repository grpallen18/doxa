# Graph worker (Neo4j Phase 0+1+2a)

Python service that claims `graph_processing_jobs` from Supabase and writes one **Document subgraph** per story: utterances (L0–L1), propositions/entities (L1–L2), then Arguments (L2a). Job status and token usage go back to Supabase.

Cross-document Viewpoint / Controversy / Dispute assembly is **not** this worker — that is Edge `debate_pipeline`.

Steering: [doxa-agents/docs/architecture/neo4j-graph-architecture.md](../../doxa-agents/docs/architecture/neo4j-graph-architecture.md)  
Admin UI: [docs/admin-neo-explorer.md](../../docs/admin-neo-explorer.md)  
Historical Phase 0 sign-off: [phase0-validation.md](../../doxa-agents/docs/architecture/phase0-validation.md)

## Pipeline (one job)

`process_story` in `app/pipeline.py`:

1. Delete prior Document subgraph for the story (L0–L2a + legacy Story/Chunk/Assertion). **Keeps L3** debate nodes.
2. Upsert Document, Publication, MediaAsset
3. Deterministic paragraph segmentation (absolute char offsets)
4. OpenAI JSON utterance extract + span / vocabulary validation
5. Write Utterance + `GROUNDED_IN` + `ASSERTED_BY` + ExtractionRun + Decision; provenance audit
6. **Phase 1:** extract propositions → embed (`OPENAI_EMBEDDING_MODEL`) → cosine link / `VARIANT_OF` → write
7. **Phase 1:** entity ER from speaker mentions (same embed + thresholds)
8. **Phase 2a:** extract Arguments, write, provenance audit

Auto-link thresholds (`app/config.py`): proposition/entity cosine ≥ **0.92** may reuse; proposition **0.75–0.92** may create `VARIANT_OF`.

Versions (code constants, not env — keep in sync with `doxa-agents/lib/graph-jobs.ts`):

- `GRAPH_SCHEMA_VERSION` = `2.2.1`
- `EXTRACTOR_VERSION` = `2.2.1-debate-eligible`

Edge enqueue stamps those strings; the **running Azure image overwrites them on claim/finish** and is the source of truth for behavior.

`stories.neo4j_element_id` stores **`elementId(Document)`**, not a Story node.

## Requirements

- Neo4j AuraDB (run [neo4j/init_constraints.cypher](neo4j/init_constraints.cypher) once after schema upgrades)
- Supabase migration `192_graph_processing_jobs.sql` applied
- OpenAI API key (chat + embeddings)

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role |
| `NEO4J_URI` | yes | Aura `neo4j+s://…` |
| `NEO4J_USERNAME` | yes | Usually `neo4j` |
| `NEO4J_PASSWORD` | yes | Aura password |
| `NEO4J_DATABASE` | no | Default `neo4j`. On some Aura instances this is the **instance id** (e.g. `44fa7bf7`), not `neo4j`. |
| `OPENAI_API_KEY` | yes | Utterance / proposition / argument extract |
| `OPENAI_MODEL` | no | Default `gpt-5.6-luna` |
| `OPENAI_EMBEDDING_MODEL` | no | Default `text-embedding-3-small` (proposition + entity link) |
| `GRAPH_WORKER_ID` | no | Default `graph-worker-1` |
| `GRAPH_WORKER_POLL_INTERVAL_SEC` | no | Default `5` |
| `GRAPH_WORKER_SECRET` | for `/run` | If **unset**, `POST /run` is always **401** (fail closed). Poll loop still runs. |
| `LOG_LEVEL` | no | Default `INFO` |
| `PORT` | no | Default `8080` (Azure/Railway set `PORT`) |

## Job claim

`claim_graph_processing_jobs(p_worker_id, p_limit)` — `pending` rows, `FOR UPDATE SKIP LOCKED`, oldest first, **skips any story that already has a `running` job**. Worker claims **one** job per poll (`limit=1`).

Outcomes (`app/main.py`):

| Result | `graph_status` | When |
|--------|----------------|------|
| Success | `succeeded` | Audits passed |
| `QuarantineError` | `quarantined` | Validation / provenance / no segments |
| Other exception | `failed` | Unexpected error (worker stays up) |

If enqueue supersedes the row mid-flight, finish is marked failed with “superseded”.

## HTTP

- `GET /health` and `GET /healthz` — liveness
- `POST /run` — wake the poll loop (`Authorization: Bearer $GRAPH_WORKER_SECRET`). **401** if secret missing or mismatch.

Normal path: `clean-scraped-content` enqueues → worker polls. `trigger_graph_worker` is an optional wake, not on the critical path. Admin Reprocess also only enqueues.

## Azure (recommended host)

Keep one always-on Container App that polls jobs. **No local Docker** — ACR builds the image in Azure. Image tag name may still say `phase0`; the image runs Phase 0+1+2a.

See **[azure/README.md](azure/README.md)** and run:

```powershell
cd services\graph-worker
copy azure\.env.azure.example azure\.env.azure
# fill azure\.env.azure
.\azure\deploy.ps1
```

Then set Supabase Edge secrets `GRAPH_WORKER_URL` + `GRAPH_WORKER_SECRET` from the script output (the script always generates a secret if empty).

## Local run

```bash
cd services/graph-worker
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill values
python -m app.main
```

Unit tests (no Aura):

```bash
python -m unittest discover -s tests -v
```

## Docker / Railway (alternative)

```bash
docker build -t doxa-graph-worker .
docker run --env-file .env -p 8080:8080 doxa-graph-worker
```

Railway: set root directory to `services/graph-worker`, use Dockerfile, set the env vars above.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Jobs stay `pending` | Worker not running / wrong `SUPABASE_*`; `running` sibling on same story blocks claim |
| Stuck `running` | Wait, or admin Reprocess (1 min stale), or `enqueue_graph_job` with `force_stale: true` (360 min) |
| `POST /run` 401 | Worker secret unset or Edge `GRAPH_WORKER_SECRET` mismatch |
| Empty Admin Neo | Wrong `NEO4J_DATABASE`, or job `quarantined`/`failed` |
| Aura Free cap | Pause clean+enqueue (`clean-scraped-content/unschedule.sql`); `prune_oldest_documents` (default `dry_run: true`) |
