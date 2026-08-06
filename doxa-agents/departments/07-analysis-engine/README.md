# Analysis engine

Phase 3 L4 Analytical layer over Neo4j Controversies / Propositions: EvidenceCheck vs Citation dual tracks, Assessment/MethodRun, HELD_BY temporal holds, and MediaAsset DERIVED_FROM clips.

Never rewrites L0–L1 discourse. UI must label analyzed output separately from extracted utterances.

See [neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md) and [phase3-validation.md](../../docs/architecture/phase3-validation.md).

<!-- AGENTS:BEGIN -->

### 07-analysis-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| generate-evidence-check-candidates | generate_evidence_check_candidates | active |
| run-evidence-checks | run_evidence_checks | active |
| extract-citations | extract_citations | active |
| run-controversy-assessments | run_controversy_assessments | active |
| update-held-by-tracks | update_held_by_tracks | active |
| link-derived-media-clips | link_derived_media_clips | active |
| project-analysis-summaries | project_analysis_summaries | active |
| analysis-pipeline | analysis_pipeline | active |

<!-- AGENTS:END -->
