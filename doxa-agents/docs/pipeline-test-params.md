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

**Deprecated claims path (not in admin catalog — Build 4 delete):** leftover handlers still accept these isolation params.

| Step | Deploy name | Isolation params | Notes |
|------|-------------|------------------|--------|
| chunk-story-bodies | `chunk_story_bodies` | `story_id` | Chunks one story if `content_clean` exists and no `story_chunks` yet. |
| extract-story-claims | `extract_story_claims` | `story_id`, optional `chunk_index` | Primary claims only; sets chunk QA `pending`. |
| extract-story-positions | `extract_story_positions` | `story_id`, optional `chunk_index` | Positions only; sets `positions_qa_status` `pending`. Runs parallel to claims. |
| validate-chunk-claims | `validate_chunk_claims` | `story_id`, optional `chunk_index` | Chunk QA loop — deterministic validate → chunk `passed`. |
| validate-chunk-positions | `validate_chunk_positions` | `story_id`, optional `chunk_index` | Positions chunk QA loop → `positions_qa_status` `passed`. |
| refine-chunk-positions | `refine_chunk_positions` | `story_id`, optional `chunk_index` | Positions refine when review requests it. |
| merge-story-claims | `merge_story_claims` | `story_id` | Merge after all chunks passed (same gate as cron). |
| merge-story-positions | `merge_story_positions` | `story_id` | Merge positions after all chunks `positions_qa_status = passed`. |
| review-merged-extraction | `review_merged_extraction` | `story_id` | Merge QA loop — reviewer. |
| refine-merged-extraction | `refine_merged_extraction` | `story_id` | Merge QA loop — when review requests refinement. |
| validate-merged-extraction | `validate_merged_extraction` | `story_id` | Merge QA loop — approve before canonical linkers. |

**Legacy (inactive):** `extract_story_entities`, `standardize_chunk_extraction`, `refine_chunk_extraction`, `validate_chunk_extraction`, `link_chunk_entities`, `merge_story_entities`.

### Example (service role)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/clean_scraped_content" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"story_id":"15208581-91ae-4454-92bf-d7a16d1a6313"}'
```

---

## Canonicalization (story- or row-scoped)

| Step | Deploy name | Isolation params | Notes |
|------|-------------|------------------|--------|
| link-canonical-claims | `link_canonical_claims` | `story_id` and/or `story_claim_id` | Unlinked `story_claims` for that scope. |
| link-canonical-events | `link_canonical_events` | `story_id` | Unlinked `story_events` for that story. |
| link-canonical-positions | `link_canonical_positions` | `story_id` and/or `story_position_id` | Unlinked `story_positions` for that scope. |
| update-stances | `update_stances` | `story_id` and/or `story_claim_id` | `story_claims` with null `stance` for that scope. |

Future (not implemented yet): `canonical_claim_id`, `canonical_position_id` for steps that operate on global entities only.

---

## Topology & ops

| Step | Deploy name | Isolation | Notes |
|------|-------------|-----------|--------|
| generate-position-pair-candidates | `generate_position_pair_candidates` | `canonical_position_id` | Deterministic pair queue |
| classify-position-relationships | `classify_position_relationships` | — | Dequeues pending candidates |
| build-agreement-clusters | `build_agreement_clusters` | — | Hard/soft agreement clusters |
| generate-agreement-cluster-candidates | `generate_agreement_cluster_candidates` | `agreement_cluster_id` | Cluster-pair queue |
| classify-agreement-cluster-relationships | `classify_agreement_cluster_relationships` | — | LLM cluster relationships |
| build-controversy-clusters | `build_controversy_clusters` | — | Multi-sided controversies |
| topology-pipeline | `topology_pipeline` | — | Orchestrator; deploy with `--no-verify-jwt` |
| refresh-topology-candidates | `refresh_topology_candidates` | — | Daily stale-candidate refresh |
| generate-agreement-summaries | `generate_agreement_summaries` | — | Batch |
| generate-viewpoints | `generate_viewpoints` | — | Batch; deploy with `--no-verify-jwt` |
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

### Deprecated claims walkthrough (handlers on disk only)

`chunk_story_bodies` → extract/validate claims+positions → merge QA → `link_canonical_*`. Do not use this as the product path.

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
| project-debate-summaries | `project_debate_summaries` | `controversy_uid`, `dry_run` | `graph_*` + `graph_questions` |
| debate-pipeline | `debate_pipeline` | `limit`, `proposition_uid`, `question_uid`, `controversy_uid`, `force`, `force_apply_all`, `dry_run` | Deterministic spine |

| run-controversy-assessments | `run_controversy_assessments` | `controversy_uid`, `question_uid`, `limit`, `dry_run` | L4 assessments on established Controversies |

Hygiene (inactive until scheduled): `graph_hygiene` orchestrates audit / prune / alias / reconcile.

