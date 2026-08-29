# Debate engine

Registry-first L3: deterministic candidate binding, curator/editor/auditor proposals, structural qualify, project to Postgres.

Document-local **Argument** extraction runs in the Python graph-worker. This department owns the **cross-document** debate layer only.

See [neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md) and [question-grain.md](../../../docs/gold/question-grain.md).

<!-- AGENTS:BEGIN -->

### 06-debate-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| apply-viewpoint-proposals | apply_viewpoint_proposals | active |
| detect-disputes | detect_disputes | active |
| project-debate-summaries | project_debate_summaries | active |
| debate-pipeline | debate_pipeline | active |
| bind-candidates | bind_candidates | active |
| apply-l3-proposals | apply_l3_proposals | active |
| qualify-controversies | qualify_controversies | active |
| detect-contrast-seeds | detect_contrast_seeds | active |
| enqueue-l3-reviews | enqueue_l3_reviews | active |
| run-l3-curator | run_l3_curator | active |
| run-l3-editor | run_l3_editor | active |
| run-l3-auditor | run_l3_auditor | active |
| sweep-counter-side | sweep_counter_side | active |
| attach-approved-lead | attach_approved_lead | active |

<!-- AGENTS:END -->
