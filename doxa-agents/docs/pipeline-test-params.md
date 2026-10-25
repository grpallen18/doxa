# Pipeline test parameters

Use these optional POST body fields to run **one record** through a step while tracing a story through the pipeline.

## Fixture story (manual walkthrough)

```text
story_id: 15208581-91ae-4454-92bf-d7a16d1a6313
```

Replace with your own UUID when testing another article. All `story_id` fields accept `storyId` (camelCase) as well.

Common flags: `dry_run: true` (preview without writes, where supported).

---

## Ingestion → processing (story-scoped)

| Step | Deploy name | Isolation params | Notes |
|------|-------------|------------------|--------|
| ingest-newsapi | `ingest-newsapi` | — | Batch only (NewsAPI window). |
| relevance-gate | `relevance_gate` | `story_id` | Classify one story (Keep / Drop / Pending). |
| review-pending-stories | `review_pending_stories` | `story_id` | Optional feedback loop when status is `PENDING`; resolves to Keep or Drop before scrape. |
| scrape-story-content | `scrape_story_content` | `story_id` | Dispatch scrape for one Keep story. |
| receive-scraped-content | `receive_scraped_content` | `story_id` **(required)** | Worker callback; manual POST for debugging. Deploy with `--no-verify-jwt`. |
| clean-scraped-content | `clean_scraped_content` | `story_id` | Cleans `story_bodies.content_raw` → `content_clean` for that story. Also `enqueueGraphJob` (and retries orphans with clean body + null `graph_status`). |
| enqueue-graph-job | `enqueue_graph_job` | `story_id` | Insert/reset `graph_processing_jobs`. Usually already done by clean. |
| trigger-graph-worker | `trigger_graph_worker` | `story_id` | Optional `POST /run`. Worker also polls every 5s. JWT-off; `GRAPH_WORKER_SECRET` fail-closed. |

**Deleted (Build 4):** do **not** POST `chunk_story_bodies`, `extract_story_claims`, `validate_chunk_claims`, `merge_story_*`, `link_canonical_*`, or `topology_pipeline`. Those Edge functions and department folders are gone. Admin `GET /api/admin/agents/extract-story-claims` is **404**. Prompt slots leftover in Postgres are not reachable from the catalog UI — [docs/agent-prompt-store.md](../../docs/agent-prompt-store.md).

### Example (service role)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/clean_scraped_content" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"story_id":"15208581-91ae-4454-92bf-d7a16d1a6313"}'
```

---

## Ops (not story-isolated)

| Step | Deploy name | Isolation | Notes |
|------|-------------|-----------|--------|
| discord-daily-health | `discord_daily_health` | — | Report only |

---

## Suggested order for one-story QA (live Neo path)

1. `relevance_gate` → `scrape_story_content` → confirm `story_bodies` / `stories.scraped_at`
2. `clean_scraped_content` → confirm `content_clean` **and** a `graph_processing_jobs` row
3. Wait for the Python worker (or `trigger_graph_worker`) → Document / Utterance / Proposition / Argument in Aura (`2.2.1` / `2.2.1-debate-eligible`)
4. Optional: `enqueue_graph_job` only to reprocess
5. Cross-document (not story-isolated): `debate_pipeline` then, when needed, `analysis_pipeline`

Inspect: `stories`, `story_bodies`, `graph_processing_jobs`, Neo `document:{storyId}`, then Postgres `graph_controversies` / `graph_people` after the global projectors.

Admin UI walkthrough: [docs/admin-story-extraction-review.md](../../docs/admin-story-extraction-review.md).

---

## Reset scrape state (SQL)

If a story was `scrape_skipped` after failures, reset before re-invoking `scrape_story_content` — see team notes or run a targeted update on `scrape_skipped`, `scrape_fail_count`, `scrape_dispatched_at`, `scraped_at`, and delete `story_bodies` if you need a clean re-scrape.

---

## Neo debate (Question-first)

| Step | Deploy name | Isolation | Notes |
|------|-------------|-----------|--------|
| bind-candidates | `bind_candidates` | `proposition_uid`, `question_uid`, `limit`, `dry_run` | `CANDIDATE_FOR` only |
| detect-contrast-seeds | `detect_contrast_seeds` | `limit`, `dry_run` | Contrast pairs → mint queue |
| enqueue-l3-reviews | `enqueue_l3_reviews` | `limit`, `dry_run` | Dirty questions + unbound clusters |
| run-l3-curator | `run_l3_curator` | `kind`, `limit`, `dry_run` | Set-level membership proposals |
| apply-l3-proposals | `apply_l3_proposals` | `proposal_uid`, `revert_proposal_uid`, `auto_apply`, `force_apply_all`, `limit`, `dry_run` | Validate + apply |
| qualify-controversies | `qualify_controversies` | `question_uid`, `limit`, `force`, `dry_run` | Structural overlay |
| run-l3-editor | `run_l3_editor` | `limit`, `dry_run` | Viewpoint proposals |
| apply-viewpoint-proposals | `apply_viewpoint_proposals` | `dry_run` | Apply editor output |
| run-l3-auditor | `run_l3_auditor` | `limit`, `dry_run` | Publish gate |
| sweep-counter-side | `sweep_counter_side` | `limit`, `dry_run` | Counter-thesis candidates |
| detect-disputes | `detect_disputes` | `question_uid`, `limit`, `force`, `skip_llm`, `dry_run` | Definitional disputes |
| project-debate-summaries | `project_debate_summaries` | `controversy_uid`, `dry_run` | `graph_*` + `graph_questions`. Open requires structural publishability **and** (on first promotion) `auditVerdict=pass`. [Publish-gate runbook](../../docs/admin-graph-controversies-and-publish-gate.md) |
| debate-pipeline | `debate_pipeline` | `limit`, `proposition_uid`, `question_uid`, `controversy_uid`, `force`, `force_apply_all`, `dry_run` | Deterministic spine |

L4 (`analysis_pipeline`) isolation: `run_controversy_assessments` accepts `controversy_uid`, `question_uid`, `limit`, `dry_run`. See [admin-analysis-pipeline.md](../../docs/admin-analysis-pipeline.md).

Hygiene: `graph_hygiene` orchestrates audit / prune / alias / reconcile. Wipe L3 and prune-oldest are **not** catalog Run buttons — [ops-neo-graph-hygiene-and-rebuild.md](../../docs/ops-neo-graph-hygiene-and-rebuild.md).

