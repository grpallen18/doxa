# Debate pipeline workflow

Cross-document debate assembly over Neo4j. JWT-off internal chain via `debate_pipeline`.

**L3 overhaul Session 5 (complete):** Question-first path through Viewpoints, Disputes, and Postgres projection. Default `debate_pipeline` runs six steps (see table). Arena / pair-first legacy removed. Hourly cron enabled via [08-debate-pipeline/schedule.sql](08-debate-pipeline/schedule.sql) — run in Supabase SQL Editor after deploy.

Arenas (`Issue` label, `arena:` uids) are retired. Controversies are overlays on `:Question`. Identity is `:Question`, not Arena.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| retrieve-or-mint-questions | [09-retrieve-or-mint-questions](09-retrieve-or-mint-questions/) | `retrieve_or_mint_questions` | Thesis → CQ → retrieve/adjudicate → attach / quarantine / mint |
| assign-question-answers | [10-assign-question-answers](10-assign-question-answers/) | `assign_question_answers` | Polarity on `ANSWERS` toward frozen CQ (theses) |
| qualify-controversies | [11-qualify-controversies](11-qualify-controversies/) | `qualify_controversies` | FAVOR/AGAINST (etc.) incompatibility → Controversy overlay |
| build-viewpoints | [03-build-viewpoints](03-build-viewpoints/) | `build_viewpoints` | `(Question, polarity)` key-point clustering → Viewpoint |
| detect-disputes | [06-detect-disputes](06-detect-disputes/) | `detect_disputes` | Definitional + intra-Question pairs → Dispute on Question |
| project-debate-summaries | [07-project-debate-summaries](07-project-debate-summaries/) | `project_debate_summaries` | Question-first projection → `graph_*` tables |
| debate-pipeline | [08-debate-pipeline](08-debate-pipeline/) | `debate_pipeline` | Orchestrator (six steps above) |

Upstream: graph-worker Arguments + gold-seeded `:Question` registry (`npx tsx scripts/seed-question-registry.ts`). Downstream: Explore/Admin via `graph_*` projections.

Smoke: `npx tsx scripts/seed-controversy-fixtures.ts`, `npx tsx scripts/seed-dispute-fixtures.ts`, then `POST debate_pipeline` with `{ "dry_run": true, "limit": 5 }` or `{ "limit": 10, "skip_llm": true }`. Eval: `npx tsx scripts/test-detect-dispute.ts`, `npx tsx scripts/eval-viewpoint-gold.ts`.

Historical cron job `classify-proposition-relationships-every-10min` is dead — unschedule only if still present in pg_cron.
