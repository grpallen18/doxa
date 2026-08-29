# Debate pipeline workflow

Registry-first L3 assembly. Deterministic candidate binding + proposal applier; Grok/LLM curator-editor-auditor run out of band.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| bind-candidates | [09-bind-candidates](09-bind-candidates/) | `bind_candidates` | Entity + answer-form kNN → `CANDIDATE_FOR` (no ANSWERS) |
| detect-contrast-seeds | [12-detect-contrast-seeds](12-detect-contrast-seeds/) | `detect_contrast_seeds` | Intra-doc objection/rebuttal pairs → mint queue |
| enqueue-l3-reviews | [13-enqueue-l3-reviews](13-enqueue-l3-reviews/) | `enqueue_l3_reviews` | Dirty questions + unbound clusters → `l3_review_queue` |
| apply-l3-proposals | [10-apply-l3-proposals](10-apply-l3-proposals/) | `apply_l3_proposals` | Validate + apply proposals (grounding, blast-radius, revert) |
| qualify-controversies | [11-qualify-controversies](11-qualify-controversies/) | `qualify_controversies` | Structural overlay from ANSWERS |
| apply-viewpoint-proposals | [03-apply-viewpoint-proposals](03-apply-viewpoint-proposals/) | `apply_viewpoint_proposals` | Apply editor viewpoint proposals |
| detect-disputes | [06-detect-disputes](06-detect-disputes/) | `detect_disputes` | Definitional disputes |
| project-debate-summaries | [07-project-debate-summaries](07-project-debate-summaries/) | `project_debate_summaries` | `graph_*` + `graph_questions`; open gated on audit pass |
| run-l3-curator | [14-run-l3-curator](14-run-l3-curator/) | `run_l3_curator` | Set-level membership LLM |
| run-l3-editor | [15-run-l3-editor](15-run-l3-editor/) | `run_l3_editor` | Set-level viewpoints |
| run-l3-auditor | [16-run-l3-auditor](16-run-l3-auditor/) | `run_l3_auditor` | Adversarial publish gate |
| sweep-counter-side | [17-sweep-counter-side](17-sweep-counter-side/) | `sweep_counter_side` | Counter-thesis candidate recall |
| debate-pipeline | [08-debate-pipeline](08-debate-pipeline/) | `debate_pipeline` | Orchestrator |

Grain contract: [docs/gold/question-grain.md](../../../../docs/gold/question-grain.md). Bot acquisition: [docs/l3-bot-acquisition.md](../../../docs/l3-bot-acquisition.md).
