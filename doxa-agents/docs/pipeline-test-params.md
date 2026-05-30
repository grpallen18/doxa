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
| relevance-gate | `relevance_gate` | `story_id` | Re-classify one story. |
| scrape-story-content | `scrape_story_content` | `story_id` | Dispatch scrape for one story. |
| receive-scraped-content | `receive_scraped_content` | `story_id` **(required)** | Worker callback; manual POST for debugging. Deploy with `--no-verify-jwt`. |
| clean-scraped-content | `clean_scraped_content` | `story_id` | Cleans `story_bodies.content_raw` → `content_clean` for that story. |
| review-pending-stories | `review_pending_stories` | `story_id` | Only runs if story is `PENDING` and has `content_clean`. |
| chunk-story-bodies | `chunk_story_bodies` | `story_id` | Chunks one story if `content_clean` exists and no `story_chunks` yet. |
| extract-story-entities | `extract_story_entities` | `story_id`, optional `chunk_index` | All unextracted chunks for story, or one chunk index. |
| standardize-chunk-extraction | `standardize_chunk_extraction` | `story_id`, optional `chunk_index` | Taxonomy/materiality standardizer (once per extract). |
| refine-chunk-extraction | `refine_chunk_extraction` | `story_id`, optional `chunk_index` | Apply validator patches (max three cycles). |
| validate-chunk-extraction | `validate_chunk_extraction` | `story_id`, optional `chunk_index` | Production judge; sets `atoms_passed` or refine loop. |
| link-chunk-entities | `link_chunk_entities` | `story_id`, optional `chunk_index` | Adds semantic link arrays; sets `passed`. Required before merge. |
| merge-story-entities | `merge_story_entities` | `story_id` | Merge extraction JSON → `story_*` tables for one story. |
| review-merged-extraction | `review_merged_extraction` | `story_id` | Story-level merge QA reviewer. |
| refine-merged-extraction | `refine_merged_extraction` | `story_id` | Patch merged entities (max one cycle). |
| validate-merged-extraction | `validate_merged_extraction` | `story_id` | Final judge; must pass before canonical linkers. |

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

## Suggested order for one-story QA

1. `relevance_gate` → `scrape_story_content` → confirm `story_bodies` / `stories.scraped_at`
2. `clean_scraped_content`
3. `chunk_story_bodies`
4. `extract_story_entities` (repeat until all chunks have `extraction_json`)
5. `standardize_chunk_extraction` → `validate_chunk_extraction` → `refine_chunk_extraction` (loop, max 3 validation attempts) → `link_chunk_entities` (all chunks `extraction_qa_status = passed`)
6. `merge_story_entities`
7. `review_merged_extraction` → `refine_merged_extraction` (if needed) → `validate_merged_extraction` (story `extraction_qa_status = passed`)
8. `link_canonical_claims` / `link_canonical_events` / `link_canonical_positions`
7. `update_stances` (per claim or whole story)

Inspect tables after each step: `stories`, `story_bodies`, `story_chunks`, `story_claims`, `story_events`, `story_positions`, then `claims`, `events`, `canonical_positions`.

---

## Reset scrape state (SQL)

If a story was `scrape_skipped` after failures, reset before re-invoking `scrape_story_content` — see team notes or run a targeted update on `scrape_skipped`, `scrape_fail_count`, `scrape_dispatched_at`, `scraped_at`, and delete `story_bodies` if you need a clean re-scrape.
