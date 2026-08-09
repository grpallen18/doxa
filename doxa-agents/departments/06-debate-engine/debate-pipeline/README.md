# Debate pipeline workflow

Cross-document debate assembly over Neo4j Propositions/Arguments. JWT-off internal chain via `debate_pipeline`.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| generate-proposition-pair-candidates | [01-generate-proposition-pair-candidates](01-generate-proposition-pair-candidates/) | `generate_proposition_pair_candidates` | Novel pairs + Issue / IN_ISSUE assignment |
| classify-proposition-relationships | [02-classify-proposition-relationships](02-classify-proposition-relationships/) | `classify_proposition_relationships` | Decision-backed RELATES_TO; marks Issue.dirty |
| build-viewpoints | [03-build-viewpoints](03-build-viewpoints/) | `build_viewpoints` | Issue-scoped agree clusters; stable `vp_` uids |
| build-controversies | [04-build-controversies](04-build-controversies/) | `build_controversies` | Issue-scoped oppose → stable `ctr_` uids |
| detect-disputes | [05-detect-disputes](05-detect-disputes/) | `detect_disputes` | Definitional / talking-past |
| project-debate-summaries | [06-project-debate-summaries](06-project-debate-summaries/) | `project_debate_summaries` | Supabase projections |
| debate-pipeline | [07-debate-pipeline](07-debate-pipeline/) | `debate_pipeline` | Orchestrator |

Upstream: graph-worker Arguments written. Downstream: Admin graph-controversies UI.
