# Debate pipeline workflow

Cross-document debate assembly over Neo4j Propositions/Arguments. JWT-off internal chain via `debate_pipeline`.

Arenas (`Issue` label, `arena:` uids) are assembly scope. Controversies are contested questions. Entity is blocking/browse only.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| generate-proposition-pair-candidates | [01-generate-proposition-pair-candidates](01-generate-proposition-pair-candidates/) | `generate_proposition_pair_candidates` | Novel pairs; `shared_entity` blocking; no entity mega-bucket |
| classify-proposition-relationships | [02-classify-proposition-relationships](02-classify-proposition-relationships/) | `classify_proposition_relationships` | Decision-backed RELATES_TO; Arena assign + dirty |
| build-viewpoints | [03-build-viewpoints](03-build-viewpoints/) | `build_viewpoints` | Arena-scoped agree clusters; stable `vp_` uids |
| build-controversies | [04-build-controversies](04-build-controversies/) | `build_controversies` | Oppose → `ctr_` uids; mega-merge split; time chapters |
| name-controversies | [05-name-controversies](05-name-controversies/) | `name_controversies` | CQ title/summary Decision |
| detect-disputes | [06-detect-disputes](06-detect-disputes/) | `detect_disputes` | Definitional / talking-past; `SURFACES_IN` Controversy |
| project-debate-summaries | [07-project-debate-summaries](07-project-debate-summaries/) | `project_debate_summaries` | Projections + SUBJECT_OF |
| debate-pipeline | [08-debate-pipeline](08-debate-pipeline/) | `debate_pipeline` | Orchestrator |

Upstream: graph-worker Arguments written. Downstream: consumer Explore + Admin graph-controversies.

Cutover: `POST debate_pipeline` `{"force_full":true,"limit":50}` after deploy. See [arena-cq-validation.md](../../../docs/architecture/arena-cq-validation.md).
