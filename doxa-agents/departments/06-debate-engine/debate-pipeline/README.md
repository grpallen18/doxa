# Debate pipeline workflow

Registry-first L3 assembly. Deterministic candidate binding + proposal applier; Grok/LLM curator-editor-auditor run out of band.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| bind-candidates | [09-bind-candidates](09-bind-candidates/) | `bind_candidates` | Entity + answer-form kNN → `CANDIDATE_FOR` (default 500 props/tick, rotated scan) |
| detect-contrast-seeds | [12-detect-contrast-seeds](12-detect-contrast-seeds/) | `detect_contrast_seeds` | Intra-doc objection/rebuttal pairs → mint queue (priority 80). **Bootstrap only** |
| enqueue-l3-reviews | [13-enqueue-l3-reviews](13-enqueue-l3-reviews/) | `enqueue_l3_reviews` | Dirty questions + unbound clusters → `l3_review_queue` (runs **after** apply; scans up to 600 unbound props/tick, rotated) |
| attach-approved-lead | [18-attach-approved-lead](18-attach-approved-lead/) | `attach_approved_lead` | Targeted `CANDIDATE_FOR` for `metadata.approved_lead` stories |
| apply-l3-proposals | [10-apply-l3-proposals](10-apply-l3-proposals/) | `apply_l3_proposals` | Validate + apply proposals (grounding, blast-radius, revert) |
| qualify-controversies | [11-qualify-controversies](11-qualify-controversies/) | `qualify_controversies` | Structural overlay from ANSWERS |
| apply-viewpoint-proposals | [03-apply-viewpoint-proposals](03-apply-viewpoint-proposals/) | `apply_viewpoint_proposals` | Apply editor viewpoint proposals (batch 20) |
| detect-disputes | [06-detect-disputes](06-detect-disputes/) | `detect_disputes` | Definitional disputes |
| project-debate-summaries | [07-project-debate-summaries](07-project-debate-summaries/) | `project_debate_summaries` | `graph_*` + `graph_questions`; open gated on audit pass |
| run-l3-curator | [14-run-l3-curator](14-run-l3-curator/) | `run_l3_curator` | Set-level membership LLM. **Cron off** — Grok MCP; Edge is manual invoke |
| run-l3-editor | [15-run-l3-editor](15-run-l3-editor/) | `run_l3_editor` | Viewpoints for **established** controversies missing a `(question, polarity)` side (≥1 thesis @ 0.7+). **Cron off** |
| run-l3-auditor | [16-run-l3-auditor](16-run-l3-auditor/) | `run_l3_auditor` | Publish gate; runs only when controversy has ≥2 viewpoints. **Cron off** |
| sweep-counter-side | [17-sweep-counter-side](17-sweep-counter-side/) | `sweep_counter_side` | Counter-thesis candidate recall. Cron every 2h; **skips in bootstrap** (under 30 projected questions unless `L3_BOOTSTRAP=false`) |
| debate-pipeline | [08-debate-pipeline](08-debate-pipeline/) | `debate_pipeline` | Orchestrator (`15 * * * *`, `skip_llm: true`, limit 500) |

## Orchestrator behavior

Hourly cron POSTs `{ "limit": 500, "skip_llm": true }`. Order: bind → contrast seeds → apply membership → attach leads → enqueue → qualify → apply viewpoints → disputes → project.

**Contrast seeds.** Default: run while bootstrap is true; **skip** once `graph_questions` ≥ 30 (or Edge secret `L3_BOOTSTRAP=false|0|off`). Skip reason in `l3_runs`: `post_bootstrap_grok_mint`. Overrides on the POST body:

```json
{ "skip_contrast_seeds": true }
{ "run_contrast_seeds": true }
```

**Viewpoint apply.** `apply_viewpoint_proposals` takes the oldest 20 `kind=viewpoint` rows in `submitted` or `validated`, invokes `apply_l3_proposals` per uid, then returns:

| Field | Meaning |
|-------|---------|
| `applied` / `rejected` / `unchanged` | Status after the apply invoke |
| `repaired_includes` | Cypher `MERGE (c)-[:INCLUDES]->(v)` for viewpoints that share a question with a controversy but were missing the edge |
| `errors` | Per-uid `status` + `validator_errors` / HTTP detail |

`dry_run: true` returns `{ pending }` only.

**Idle Slack.** Empty editor/auditor scans still notify `#grok-ops` (`idle_note` on `/api/slack/worker-run-summary`). Grok must call `report_editor_idle` / `report_auditor_idle` once per scheduled run when it submits nothing.

## Review lifecycle

A question is enqueued when it has **never been reviewed** or has picked up a candidate created since `q.lastReviewedAt`. Applying any membership op stamps `lastReviewedAt`, so a reviewed question only returns when new evidence arrives.

A proposal with **zero ops** is a verdict, not a failure: `apply_l3_proposals` marks it `no_op`, stamps the review, and closes the queue item as `done`. Without that, "nothing to change" failed validation and recycled the item to `pending` forever. A declined **mint** cluster has no Question to stamp, so its propositions get `l3ReviewedAt` instead and the cluster stays quiet until a new unbound proposition joins it.

Proposals carry `payload.item_id` because one lease covers a whole claimed batch — the applier closes that single row rather than the batch.

Grain contract: [docs/gold/question-grain.md](../../../../docs/gold/question-grain.md). Grok bots: [docs/grok-bot-architecture.md](../../../docs/grok-bot-architecture.md). Human approve/reject: [docs/admin-l3-proposals-and-approval.md](../../../../docs/admin-l3-proposals-and-approval.md).
