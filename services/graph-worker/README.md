# Graph worker (Neo4j Phase 0)

Python service that claims `graph_processing_jobs` from Supabase, builds an **utterance-grounded** Neo4j discourse graph (Document / Segment / Utterance / Agent), and writes job status / usage metadata back to Supabase.

Steering doc: [doxa-agents/docs/architecture/neo4j-graph-architecture.md](../../doxa-agents/docs/architecture/neo4j-graph-architecture.md)  
Validation: [doxa-agents/docs/architecture/phase0-validation.md](../../doxa-agents/docs/architecture/phase0-validation.md)

Pipeline (Phase 0):

1. Delete prior `Document` subgraph for the story (plus legacy Story/Assertion cleanup)
2. Upsert Document, Publication, MediaAsset
3. Deterministic paragraph segmentation with absolute char offsets
4. OpenAI JSON utterance extraction
5. Span / vocabulary validation (quarantine on failure)
6. Write Utterance + `GROUNDED_IN` + `ASSERTED_BY` + ExtractionRun + Decision
7. Provenance audit

## Requirements

- Neo4j AuraDB (run [neo4j/init_constraints.cypher](neo4j/init_constraints.cypher) once after schema upgrades)
- Supabase migration `192_graph_processing_jobs.sql` applied
- OpenAI API key

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role |
| `NEO4J_URI` | yes | Aura neo4j+s://… |
| `NEO4J_USERNAME` | yes | Usually `neo4j` |
| `NEO4J_PASSWORD` | yes | Aura password |
| `NEO4J_DATABASE` | no | Default `neo4j`. On some Aura instances this is the **instance id** (e.g. `44fa7bf7`), not `neo4j` — check Aura console or `SHOW DATABASES`. |
| `OPENAI_API_KEY` | yes | Utterance extraction |
| `OPENAI_MODEL` | no | Default `gpt-4o-mini` |
| `GRAPH_WORKER_ID` | no | Default `graph-worker-1` |
| `GRAPH_WORKER_POLL_INTERVAL_SEC` | no | Default `5` |
| `GRAPH_WORKER_SECRET` | no | Bearer secret for `POST /run` |
| `PORT` | no | Default `8080` (Azure/Railway set `PORT`) |

`GRAPH_SCHEMA_VERSION` / `EXTRACTOR_VERSION` are code constants (`2.0.0` / `2.0.0-utterance`), not env vars.

## Azure (recommended host)

Keep one always-on Container App that polls jobs (suitable for daily story volume). **No local Docker** — ACR builds the image in Azure.

See **[azure/README.md](azure/README.md)** and run:

```powershell
cd services\graph-worker
copy azure\.env.azure.example azure\.env.azure
# fill azure\.env.azure
.\azure\deploy.ps1
```

Then set Supabase Edge secrets `GRAPH_WORKER_URL` + `GRAPH_WORKER_SECRET` from the script output.

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

## HTTP

- `GET /health` — liveness
- `POST /run` — wake the poll loop early (`Authorization: Bearer $GRAPH_WORKER_SECRET` if set)

Jobs are normally created by `clean-scraped-content` or `enqueue_graph_job`.
