# Debate engine

Cross-document Neo4j debate assembly (L3 Question-first): retrieve/mint Questions, assign answers, qualify Controversies, build Viewpoints, detect Disputes, project to Supabase.

Document-local **Argument** extraction runs in the Python graph-worker (same job as Phase 0/1). This department owns the **cross-document** debate layer only.

See [neo4j-graph-architecture.md](../../docs/architecture/neo4j-graph-architecture.md).

<!-- AGENTS:BEGIN -->

### 06-debate-engine (generated)

| Step | Deploy | Status |
|------|--------|--------|
| build-viewpoints | build_viewpoints | active |
| detect-disputes | detect_disputes | active |
| project-debate-summaries | project_debate_summaries | active |
| debate-pipeline | debate_pipeline | active |
| retrieve-or-mint-questions | retrieve_or_mint_questions | active |
| assign-question-answers | assign_question_answers | active |
| qualify-controversies | qualify_controversies | active |

<!-- AGENTS:END -->
