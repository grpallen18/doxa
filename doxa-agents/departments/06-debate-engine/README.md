# Debate engine

Cross-document Neo4j debate assembly (Phase 2): proposition pair candidates, relationship classify, Viewpoint / Controversy / Dispute assembly, and Supabase projections.

Document-local **Argument** extraction runs in the Python graph-worker (same job as Phase 0/1). This department owns the **cross-document** debate layer only.

See [neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md).

<!-- AGENTS:BEGIN -->

### 06-debate-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| generate-proposition-pair-candidates | generate_proposition_pair_candidates | inactive |
| classify-proposition-relationships | classify_proposition_relationships | inactive |
| build-viewpoints | build_viewpoints | inactive |
| build-controversies | build_controversies | inactive |
| detect-disputes | detect_disputes | inactive |
| project-debate-summaries | project_debate_summaries | inactive |
| debate-pipeline | debate_pipeline | inactive |

<!-- AGENTS:END -->
