# Topology / debate pipeline (Neo4j)

**Status:** Primary path is Neo4j discourse graph + Edge orchestrators. The legacy SQL `topology_pipeline` (agreement/controversy clusters on `story_positions`) was removed in Cleanup.

## Current path

```text
Ingest → Scrape → Clean → enqueue_graph_job → graph-worker (L0–L2a)
  → debate_pipeline (pairs → classify → viewpoints → controversies → name → disputes → project)
  → analysis_pipeline (EvidenceCheck / Citation / Assessment / HELD_BY / clips → project)
```

| Orchestrator | Deploy | Role |
|--------------|--------|------|
| `debate_pipeline` | JWT-off | L3 argumentation assembly |
| `analysis_pipeline` | JWT-off | L4 analytical overlays |

Projections: `graph_controversies`, `graph_viewpoints`, `graph_controversy_evidence`, `graph_assessments`.

Admin: `/admin/graph-controversies`, `/admin/neo`, Stories agent-flow (ingestion → graph).

## Cron

- `debate-pipeline-hourly` — see `doxa-agents/departments/06-debate-engine/debate-pipeline/08-debate-pipeline/schedule.sql` (Vault secrets, `{"limit":50}`).

## Docs

- Architecture: [docs/architecture/neo4j-graph-architecture.md](architecture/neo4j-graph-architecture.md)
- Handoff / Cleanup: [docs/architecture/neo4j-overhaul-next.md](architecture/neo4j-overhaul-next.md)
- Phase 2 / 3 validation checklists in `docs/architecture/`

Do not resurrect SQL `agreement_clusters` / `controversy_clusters` writers.
