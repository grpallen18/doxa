# Phase 3 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  
Handoff: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

**Status:** Live smoke green (2026-08-06) — Aura constraints still user-owned.

## Preconditions

1. Re-run [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura (Assessment / EvidenceCheck / Citation / MethodRun).
2. Apply migration `196_graph_assessments.sql`.
3. Deploy JWT-off analysis functions (`analysis_pipeline` and steps) with `NEO4J_*` + `OPENAI_API_KEY`.
4. Phase 2 controversies exist (at least one multi-sided Controversy).

## Checklist

- [x] MethodRun nodes created for evidence-check and assessment batches
- [x] EvidenceCheck nodes with Decision provenance; low-confidence quarantined
- [x] Citation nodes/edges distinct from EvidenceCheck (no verdict on Citation)
- [x] Assessment nodes ABOUT Controversy with PRODUCED_BY MethodRun
- [x] Admin controversy detail shows **Analyzed** section (not presented as facts)
- [x] `graph_assessments` projection populated
- [x] HELD_BY temporal edges for Agent→Proposition with open/close intervals
- [x] Clip MediaAssets link via DERIVED_FROM to parent article asset
- [x] Neo explorer can show assessment / evidence_check kinds (filters default off for document mode)

## Sign-off

| Check | Result |
|-------|--------|
| Aura Phase 3 constraints | User-owned apply |
| Analysis Edge Functions | Deploy with `--no-verify-jwt` |
| Projection migration | `196_graph_assessments` |
| UI labeling | Analyzed ≠ extracted |

**Next after green:** optional analysis cron (separate from debate hourly); Cleanup phase for legacy claims path.
