# Doxa Backend (Supabase)

This document describes the Doxa database schema, data dictionary, table purposes, and how tables relate. It is the source of truth for backend/data intentions. For step-by-step setup, run migrations in order and seed (see Quick setup below).

## Quick setup

1. Run migrations in order (SQL Editor): `001_initial_schema.sql` through the latest migration.
2. Seed the database: run [seed_new_schema.sql](seed_new_schema.sql) in the Supabase SQL Editor (paste the file contents and run). See **Seeding** below for details.

**Note:** The data dictionary below describes the **target schema** for the pipeline/ingestion model. Migrations 010 and 011 refactor topics and add the new tables; seed_new_schema.sql populates them.

---

## Data dictionary

### sources

**Purpose:** Publisher/outlet metadata (NYT, WSJ, etc.).

| Column | Type | Purpose |
|--------|------|---------|
| `source_id` | uuid (PK) | Unique source. |
| `name` | text (unique) | Display name. |
| `domain` | text | Publisher domain. |
| `bias_tags` | text[] | Optional internal labels (not user ideology). |
| `metadata` | jsonb | Misc (logo url, region, etc.). |
| `created_at` | timestamptz | When the source was created. |

---

### stories

**Purpose:** One row per ingested article/story. Rolls up to sources. Relevance fields are filled by cron #2 (classify ingested stories into KEEP/DROP). Full article text is stored in **story_bodies**; stories holds scrape status flags (`being_processed`, `scrape_skipped`, `scrape_fail_count`).

| Column | Type | Purpose |
|--------|------|---------|
| `story_id` | uuid (PK) | Unique story. |
| `source_id` | uuid (FK → sources.source_id) | Which source. |
| `url` | text (unique) | Canonical URL. |
| `title` | text | Story title. |
| `author` | text (nullable) | Author. |
| `published_at` | timestamptz (nullable) | Publication time. |
| `fetched_at` | timestamptz | When the story was fetched. |
| `content_snippet` | text (nullable) | Short snippet. |
| `content_full` | text (nullable) | Truncated excerpt from NewsAPI (not full article). Used for relevance_gate pre-scrape classification; full content lives in story_bodies. |
| `language` | text (nullable) | Language. |
| `metadata` | jsonb | NewsAPI payload, tags, etc. |
| `created_at` | timestamptz | When the row was created. |
| `relevance_status` | text (nullable) | KEEP \| DROP \| PENDING (from cron #2). |
| `relevance_score` | int (nullable) | 0–100; NULL when PENDING. |
| `relevance_confidence` | int (nullable) | 0–100. |
| `relevance_reason` | text (nullable) | Free-text reason for classification. |
| `relevance_tags` | text[] (nullable) | Tags for relevance/filtering. |
| `relevance_model` | text (nullable) | Model used for classification. |
| `relevance_ran_at` | timestamptz (nullable) | When relevance was last evaluated. |
| `being_processed` | boolean | Lock while scrape or extraction runs. |
| `scrape_skipped` | boolean | True when scrape failed or no URL. |
| `scrape_fail_count` | int | Consecutive scrape failures (Worker 5xx, timeout, CPU exceeded). After 3, scrape_skipped is set and retries stop. Reset to 0 on success. |
| `extraction_completed_at` | timestamptz (nullable) | When extraction wrote at least one claim/evidence. |
| `extraction_skipped_empty` | boolean | True when extraction ran but found nothing. |

---

### story_bodies

**Purpose:** Full article text scraped from story URLs. One row per story. Written by **receive_scraped_content** (called by the Cloudflare Worker after scraping). **clean_scraped_content** cleans `content_raw` with an LLM and writes `content_clean`. Chunking and re-review use `content_clean`. This table segments large article text for storage/query efficiency — full content could conceptually live on stories but is separated here for large-text handling.

| Column | Type | Purpose |
|--------|------|---------|
| `story_id` | uuid (PK, FK → stories.story_id) | Which story. |
| `content_raw` | text | Raw Readability textContent from Worker. |
| `content_length_raw` | int (generated) | Character length of content_raw. |
| `content_clean` | text (nullable) | LLM-cleaned article text; null until clean_scraped_content runs. |
| `content_length_clean` | int (generated, nullable) | Character length of content_clean. |
| `cleaned_at` | timestamptz (nullable) | When content was cleaned. |
| `cleaner_model` | text (nullable) | AI model used to clean content. |
| `scraped_at` | timestamptz | When the body was scraped. |
| `scrape_method` | text (nullable) | fetch_readability or browser_render. |

---

### story_chunks

**Purpose:** Text chunks from story_bodies for downstream processing (e.g. extraction, embeddings). 3500 chars per chunk, 500 overlap. Written by **chunk_story_bodies**. **extract_chunk_claims** fills `extraction_json` with chunk-level claims/evidence/links.

| Column | Type | Purpose |
|--------|------|---------|
| `story_id` | uuid (FK → stories.story_id) | Which story. |
| `chunk_index` | smallint | 0-based order of chunk within the story. |
| `content` | text | Chunk text. |
| `extraction_json` | jsonb (nullable) | `{ claims, evidence, links }` from chunk extraction. |
| `created_at` | timestamptz | When the chunk was created. |

**Keys:** PK `(story_id, chunk_index)`.

---

### domain_throttle

**Purpose:** Per-domain cooldown for scrape dispatching. Prevents hammering the same outlet.

| Column | Type | Purpose |
|--------|------|---------|
| `domain` | text (PK) | Hostname (e.g. nytimes.com). |
| `last_dispatched_at` | timestamptz | Last time a scrape was dispatched for this domain. |

---

### topics

**Purpose:** Stores data for each wiki page that users can search for.

| Column | Type | Purpose |
|--------|------|---------|
| `topic_id` | uuid (PK) | Unique topic. |
| `slug` | text (unique) | URL-safe slug. |
| `title` | text | Topic title. |
| `summary` | text (nullable) | Canonical topic blurb (1,000–1,500 words, LLM-synthesized). |
| `topic_description` | text (nullable) | LLM-generated description for initial embedding; used before summary exists. |
| `topic_embedding` | vector(1536) (nullable) | Embedding of description (initial) or title+summary (after synthesis); used for thesis and topic similarity. |
| `status` | text | e.g. draft \| published \| archived. |
| `metadata` | jsonb | Tags, time window defaults, etc. |
| `created_at` | timestamptz | When the topic was created. |
| `updated_at` | timestamptz | Last update. |

---

### topic_theses

**Purpose:** Many-to-many link between topics and theses. Links theses to topics via embedding similarity (process_topic).

| Column | Type | Purpose |
|--------|------|---------|
| `topic_id` | uuid (FK → topics.topic_id) | Which topic. |
| `thesis_id` | uuid (FK → theses.thesis_id) | Which thesis. |
| `similarity_score` | numeric | Cosine similarity at link time. |
| `rank` | int | Order for display. |
| `linked_at` | timestamptz | When the link was created. |

**Keys:** PK `(topic_id, thesis_id)`.

---

### topic_relationships

**Purpose:** Topic-to-topic links for navigation (e.g. "Related topics"). Built by process_topic from embedding similarity.

| Column | Type | Purpose |
|--------|------|---------|
| `source_topic_id` | uuid (FK → topics.topic_id) | Source topic. |
| `target_topic_id` | uuid (FK → topics.topic_id) | Target (related) topic. |
| `similarity_score` | numeric | Cosine similarity. |

**Keys:** PK `(source_topic_id, target_topic_id)`. CHECK: source != target.

---

### topic_stories

**Purpose:** Declares which stories are in-scope for a topic (scope/control surface).

| Column | Type | Purpose |
|--------|------|---------|
| `topic_id` | uuid (FK → topics.topic_id) | Which topic. |
| `story_id` | uuid (FK → stories.story_id) | Which story. |
| `assignment_method` | text | ai \| manual \| rule. |
| `assignment_confidence` | numeric (nullable) | Confidence of assignment. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the assignment was created. |

**Keys:** PK/unique `(topic_id, story_id)`.

---

### story_claims

**Purpose:** Atomic claim statements as extracted from a specific story (raw phrasing).

| Column | Type | Purpose |
|--------|------|---------|
| `story_claim_id` | uuid (PK) | Unique story-level claim. |
| `story_id` | uuid (FK → stories.story_id) | Which story. |
| `raw_text` | text | As extracted. |
| `polarity` | text | asserts \| denies \| uncertain. |
| `stance` | text (nullable) | support \| oppose \| neutral. How the article frames the proposition. Null until explicitly set at extraction; existing rows stay null until backfilled by separate edge function. |
| `extraction_confidence` | numeric | Confidence of extraction. |
| `span_start` | int (nullable) | Optional offsets. |
| `span_end` | int (nullable) | Optional offsets. |
| `claim_id` | uuid (FK → claims.claim_id, nullable) | Filled during canonicalization. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

---

### claims

**Purpose:** Canonical (normalized + de-duplicated) claims used for clustering and aggregation.

| Column | Type | Purpose |
|--------|------|---------|
| `claim_id` | uuid (PK) | Unique canonical claim. |
| `canonical_text` | text | Normalized text. |
| `canonical_hash` | text (unique) | Stable dedupe key (hash of normalized form). |
| `subject` | text (nullable) | Subject. |
| `predicate` | text (nullable) | Predicate. |
| `object` | text (nullable) | Object. |
| `timeframe` | text (nullable) | Or json. |
| `location` | text (nullable) | Location. |
| `embedding` | vector/array (nullable) | If using pgvector. |
| `metadata` | jsonb | Entities, normalization notes, etc. |
| `cluster_computed_at` | timestamptz (nullable) | Set when processed by clustering pipeline; null = not yet clustered. |
| `created_at` | timestamptz | When the claim was created. |
| `updated_at` | timestamptz | Last update. |

---

### story_evidence

**Purpose:** Evidence artifacts extracted from a story (quotes/stats/citations), not assertions.

| Column | Type | Purpose |
|--------|------|---------|
| `evidence_id` | uuid (PK) | Unique evidence row. |
| `story_id` | uuid (FK → stories.story_id) | Which story. |
| `evidence_type` | text | quote \| statistic \| document_ref \| dataset_ref \| other. |
| `excerpt` | text | The citable snippet. |
| `attribution` | text (nullable) | Who said it / where it's from. |
| `source_ref` | text (nullable) | Report name, law, docket, dataset id, etc. |
| `span_start` | int (nullable) | Optional offsets. |
| `span_end` | int (nullable) | Optional offsets. |
| `extraction_confidence` | numeric | Confidence. |
| `metadata` | jsonb | Units, timeframe, URL to cited doc, etc. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

---

### story_claim_evidence_links

**Purpose:** Story-local links: “in THIS story, this evidence relates to THIS story-claim.” (Phase 1)

| Column | Type | Purpose |
|--------|------|---------|
| `story_claim_id` | uuid (FK → story_claims.story_claim_id) | Which story-claim. |
| `evidence_id` | uuid (FK → story_evidence.evidence_id) | Which evidence. |
| `relation_type` | text | supports \| contradicts \| contextual. |
| `confidence` | numeric | Confidence. |
| `rationale` | text (nullable) | Short explanation. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the link was created. |

**Keys:** PK/unique `(story_claim_id, evidence_id)`.

---

**Note:** Phase 2 canonical claim–evidence links (`claim_evidence_links`) were never implemented and the table was dropped in migration 066. Evidence remains story-local via story_claim_evidence_links.



### archetypes

**Purpose:** Global lenses that viewpoints see through (economic, legal, moral, etc.). Each viewpoint can be related to multiple archetypes; each viewpoint must have only one archetype marked as the primary archetype.

| Column | Type | Purpose |
|--------|------|---------|
| `archetype_id` | uuid (PK) | Unique archetype. |
| `name` | text (unique) | Display name. |
| `description` | text (nullable) | Optional description. |
| `created_at` | timestamptz | When the archetype was created. |

---

### claim_archetypes

**Purpose:** Assigns archetypes to canonical claims (many-to-many, with confidence).

| Column | Type | Purpose |
|--------|------|---------|
| `claim_id` | uuid (FK → claims.claim_id) | Which claim. |
| `archetype_id` | uuid (FK → archetypes.archetype_id) | Which archetype. |
| `confidence` | numeric | Confidence. |
| `is_primary` | boolean (default false) | Optional later lever. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

**Keys:** PK/unique `(claim_id, archetype_id)`.

---

### position_clusters

**Purpose:** Coherent stance groups from supporting claim edges. Stage 1 of position-controversy clustering. Enforced MIN/MAX size via splitting. Upsert by membership_fingerprint preserves IDs when membership unchanged.

| Column | Type | Purpose |
|--------|------|---------|
| `position_cluster_id` | uuid (PK) | Unique position. |
| `topic_id` | uuid (FK, nullable) | Optional for V1. Derive from claim → story_claims → topic_stories. |
| `label` | text (nullable) | Short stance name (LLM). |
| `summary` | text (nullable) | Stance summary (LLM). |
| `membership_fingerprint` | text (unique, nullable) | SHA256 of sorted claim_ids; used for upsert. |
| `status` | text | active \| inactive. Inactive = orphan (grace period before delete). |
| `deactivated_at` | timestamptz (nullable) | When marked inactive. |
| `centroid_embedding` | vector(1536) (nullable) | Optional. |
| `created_at` | timestamptz | Creation. |

---

### position_cluster_claims

**Purpose:** Which claims belong to which position. role: core | supporting for display priority.

| Column | Type | Purpose |
|--------|------|---------|
| `position_cluster_id` | uuid (FK) | Which position. |
| `claim_id` | uuid (FK) | Which claim. |
| `weight` | numeric (nullable) | Optional. |
| `role` | text (nullable) | core \| supporting. |
| `created_at` | timestamptz | Creation. |

**Keys:** PK `(position_cluster_id, claim_id)`.

---

### position_pair_scores

**Purpose:** Pre-aggregated edge counts between position clusters. controversy_score = contradictory + alpha*competing_framing. Populated by aggregate_position_pair_scores.

| Column | Type | Purpose |
|--------|------|---------|
| `position_a_id` | uuid (FK) | Lower UUID of pair (canonical). |
| `position_b_id` | uuid (FK) | Higher UUID of pair. |
| `contradictory_count` | int | Count of claim pairs with contradicts. |
| `competing_framing_count` | int | Count with competing_framing. |
| `supporting_count` | int | Count with supports_same_position. |
| `controversy_score` | numeric | contradictory + alpha*competing. |
| `last_aggregated_at` | timestamptz | When computed. |

**Keys:** PK `(position_a_id, position_b_id)` where position_a_id < position_b_id.

---

### controversy_clusters

**Purpose:** Debate containers linking 2+ opposing position clusters. question = neutral debate question (LLM). Upsert by controversy_fingerprint preserves IDs when position pair unchanged.

| Column | Type | Purpose |
|--------|------|---------|
| `controversy_cluster_id` | uuid (PK) | Unique controversy. |
| `topic_id` | uuid (FK, nullable) | Optional for V1. |
| `question` | text | Neutral debate question. |
| `proposition` | text (nullable) | Optional contested statement. |
| `label` | text (nullable) | Short display label. |
| `summary` | text (nullable) | Neutral overview (LLM). |
| `controversy_fingerprint` | text (unique, nullable) | SHA256 of sorted position_ids; used for upsert. |
| `status` | text | active \| inactive. Inactive = orphan (grace period before delete). |
| `deactivated_at` | timestamptz (nullable) | When marked inactive. |
| `created_at` | timestamptz | Creation. |

---

### controversy_cluster_positions

**Purpose:** Links positions to controversies. side: A/B for display. V1: pairs only.

| Column | Type | Purpose |
|--------|------|---------|
| `controversy_cluster_id` | uuid (FK) | Which controversy. |
| `position_cluster_id` | uuid (FK) | Which position. |
| `side` | text (nullable) | A \| B. |
| `stance_label` | text (nullable) | Per-side label. |
| `weight` | numeric (nullable) | Optional. |
| `created_at` | timestamptz | Creation. |

**Keys:** PK `(controversy_cluster_id, position_cluster_id)`.

---

### controversy_viewpoints

**Purpose:** LLM-generated viewpoint summary per position within a controversy. Versioned for audit.

| Column | Type | Purpose |
|--------|------|---------|
| `viewpoint_id` | uuid (PK) | Unique viewpoint. |
| `controversy_cluster_id` | uuid (FK) | Which controversy. |
| `position_cluster_id` | uuid (FK) | Which position. |
| `title` | text (nullable) | Optional title. |
| `summary` | text | Viewpoint summary (LLM). |
| `version` | int | Audit version. |
| `model` | text (nullable) | LLM model used. |
| `created_at` | timestamptz | Creation. |

**Keys:** Unique `(controversy_cluster_id, position_cluster_id)`.

---

### position_summary_cache

**Purpose:** LLM-generated label/summary keyed by membership fingerprint. Persists across rebuilds; avoids re-calling LLM when position membership unchanged.

| Column | Type | Purpose |
|--------|------|---------|
| `membership_fingerprint` | text (PK) | SHA256 of sorted claim_ids. |
| `label` | text (nullable) | Cached stance name. |
| `summary` | text (nullable) | Cached stance summary. |
| `created_at` | timestamptz | When cached. |

---

### position_cluster_migrations

**Purpose:** Lineage when positions merge or split. old_position_cluster_id has no FK (may be deleted). Purged after 30 days.

| Column | Type | Purpose |
|--------|------|---------|
| `old_position_cluster_id` | uuid | Historical position (no FK). |
| `new_position_cluster_id` | uuid (FK) | Surviving position. |
| `relationship` | text | merged_into \| split_into. |
| `created_at` | timestamptz | When recorded. |

---

### claim_relationships

**Purpose:** LLM result cache for claim pair classification (contradicts, supports_same_position, orthogonal, competing_framing). Avoids re-classifying same pair. Claim-centric only (claim ↔ neighbor).

| Column | Type | Purpose |
|--------|------|---------|
| `claim_a_id` | uuid (FK) | Lower UUID of pair (canonical order). |
| `claim_b_id` | uuid (FK) | Higher UUID of pair. |
| `relationship` | text | supports_same_position \| contradicts \| orthogonal \| competing_framing. |
| `similarity_at_classification` | numeric | Embedding similarity when classified. |
| `classified_at` | timestamptz | When LLM ran. |

**Keys:** PK `(claim_a_id, claim_b_id)` where claim_a_id < claim_b_id.

---

### theses (legacy; deprecated for new clustering)

**Purpose:** A “cluster object” of claims for a specific topic + archetype (the cluster is the thesis).

| Column | Type | Purpose |
|--------|------|---------|
| `thesis_id` | uuid (PK) | Unique thesis. |
| `topic_id` | uuid (FK → topics.topic_id) | Which topic. |
| `archetype_id` | uuid (FK → archetypes.archetype_id) | Which archetype. |
| `label` | text | Short name. |
| `summary` | text | Thesis description. |
| `embedding` | vector/array (nullable) | Optional embedding. |
| `metadata` | jsonb | Misc. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the thesis was created. |

---

### thesis_claims

**Purpose:** Bridge: which canonical claims belong to which thesis (with membership strength).

| Column | Type | Purpose |
|--------|------|---------|
| `thesis_id` | uuid (FK → theses.thesis_id) | Which thesis. |
| `claim_id` | uuid (FK → claims.claim_id) | Which claim. |
| `membership_score` | numeric (nullable) | Membership strength. |
| `rank` | int (nullable) | Order/rank. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

**Keys:** PK/unique `(thesis_id, claim_id)`.

---

### viewpoints

**Purpose:** Archetype-scoped synthesized positions for a topic (built from theses). Topic-scoped.

| Column | Type | Purpose |
|--------|------|---------|
| `viewpoint_id` | uuid (PK) | Unique viewpoint. |
| `topic_id` | uuid (FK → topics.topic_id) | Which topic. |
| `archetype_id` | uuid (FK → archetypes.archetype_id) | Which archetype. |
| `title` | text | Viewpoint title. |
| `summary` | text | The viewpoint statement. |
| `embedding` | vector/array (nullable) | Optional embedding. |
| `metadata` | jsonb | Misc. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the viewpoint was created. |

---

### viewpoint_theses

**Purpose:** Bridge: which theses are synthesized into a viewpoint (with weights).

| Column | Type | Purpose |
|--------|------|---------|
| `viewpoint_id` | uuid (FK → viewpoints.viewpoint_id) | Which viewpoint. |
| `thesis_id` | uuid (FK → theses.thesis_id) | Which thesis. |
| `weight` | numeric (nullable) | Weight. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

**Keys:** PK/unique `(viewpoint_id, thesis_id)`.

---

### narratives

**Purpose:** Cross-topic aggregation of viewpoints into overarching narratives. Topic-agnostic.

| Column | Type | Purpose |
|--------|------|---------|
| `narrative_id` | uuid (PK) | Unique narrative. |
| `title` | text | Title. |
| `summary` | text | Summary. |
| `embedding` | vector/array (nullable) | Optional embedding. |
| `metadata` | jsonb | Misc. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the narrative was created. |

---

### narrative_viewpoint_links

**Purpose:** Bridge: narrative ↔ underlying topic-level viewpoints (many-to-many).

| Column | Type | Purpose |
|--------|------|---------|
| `narrative_id` | uuid (FK → narratives.narrative_id) | Which narrative. |
| `viewpoint_id` | uuid (FK → viewpoints.viewpoint_id) | Which viewpoint. |
| `weight` | numeric (nullable) | Weight. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the row was created. |

**Keys:** PK/unique `(narrative_id, viewpoint_id)`.

---

### pipeline_runs

**Purpose:** Audit + idempotency for AI/ETL runs (what ran, with which model, and what it produced).

| Column | Type | Purpose |
|--------|------|---------|
| `run_id` | uuid (PK) | Unique run. |
| `pipeline_name` | text | e.g. ingest_newsapi, extract_claims, canonicalize_claims, cluster_theses, synthesize_viewpoints. |
| `status` | text | running \| success \| failed. |
| `started_at` | timestamptz | When the run started. |
| `ended_at` | timestamptz (nullable) | When the run ended. |
| `model_provider` | text (nullable) | Model provider. |
| `model_name` | text (nullable) | Model name. |
| `parameters` | jsonb (nullable) | Run parameters. |
| `counts` | jsonb (nullable) | Inserted/updated row counts. |
| `error` | text (nullable) | Error message if failed. |

---

### Notes (v1 conventions)

- Use uuid PKs everywhere; add appropriate indexes on FK columns and `published_at`.
- Keep ingestion tables (`stories`, `story_claims`, `story_evidence`) topic-agnostic; scope by `topic_stories`.
- Canonical/derived layers use **position_clusters**, **controversy_clusters**, and **controversy_viewpoints**. Legacy theses/viewpoints are obsolete.
- Evidence is stored as story-scoped artifacts (`story_evidence`); Phase 2 claim–evidence aggregation was never implemented (table dropped in migration 066).

---

## Schema overview (target)

The **target** Doxa backend is built around:

1. **Ingestion:** **sources** (publishers) and **stories** (articles). **topic_stories** assigns stories to topics.
2. **Extraction:** **story_claims** (raw claims per story) and **story_evidence** (quotes, stats, citations). **story_claim_evidence_links** ties evidence to story-claims (Phase 1).
3. **Canonical layer:** **claims** (normalized, de-duplicated). Phase 2 claim–evidence links were never implemented (table dropped in 066).
4. **Lenses:** **archetypes** (economic, legal, moral, etc.). **claim_archetypes** assigns claims to archetypes.
5. **Clustering (new):** **position_clusters** (supporting-claim stances) → **controversy_clusters** (opposing positions). **position_cluster_claims**, **position_pair_scores**, **controversy_cluster_positions**, **controversy_viewpoints**. **claim_relationships** caches LLM pair classifications.
6. **Clustering (legacy):** **theses** (claim clusters per topic + archetype). **thesis_claims** links claims to theses. Kept for Atlas; migrate later.
7. **Synthesis:** **viewpoints** (archetype-scoped positions per topic, from theses). **viewpoint_theses** links theses to viewpoints.
8. **Cross-topic:** **narratives** (aggregation of viewpoints into overarching narratives). **narrative_viewpoint_links** links narratives to topic-level viewpoints.
9. **Audit:** **pipeline_runs** tracks AI/ETL runs for idempotency and debugging.

---

## How tables relate (target)

```
sources ─── source_id ──┬── stories (story_id)
                        │       │
                        │       ├── story_bodies (full scraped text)
                        │       ├── story_chunks (chunked text)
                        │       ├── story_claims ── claim_id (nullable) ──► claims
                        │       ├── story_evidence
                        │       └── story_claim_evidence_links (story-local)
                        │
topics (topic_id) ──────┼── topic_stories ─── story_id ──► stories
                        │
                        ├── topic_theses ─── thesis_id ──► theses (legacy; obsolete)
                        ├── topic_relationships ──► topics (topic-to-topic, symmetric)

archetypes (archetype_id) ── claim_archetypes ──► claims

claims ◄── position_cluster_claims ──► position_clusters (stance groups)
position_clusters ◄── position_pair_scores ──► position_clusters (aggregated cross-edges)
position_clusters ◄── controversy_cluster_positions ──► controversy_clusters (debate containers)
controversy_clusters ◄── controversy_viewpoints ──► position_clusters (LLM viewpoint per side)
claims ◄── claim_relationships (claim_a_id, claim_b_id) ──► claims (LLM pair cache)

pipeline_runs (run_id) ── referenced by topic_stories, story_claims, story_evidence,
  story_claim_evidence_links, claim_archetypes, theses, thesis_claims,
  viewpoints, viewpoint_theses (legacy); position_clusters, controversy_clusters, controversy_viewpoints (active)
```

- **Stories** are topic-agnostic; **topic_stories** scopes them to topics.
- **Evidence** is story-local via **story_claim_evidence_links** (Phase 1); Phase 2 canonical claim–evidence links were never implemented.
- **Theses** and **viewpoints** (legacy) are topic- and archetype-scoped; the active pipeline uses **position_clusters** → **controversy_clusters** → **controversy_viewpoints**.

---

## Migrations (current vs target)

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` … `009_rename_...sql` | Legacy schema (topics as “nodes”, viewpoints as “perspectives”, topic_viewpoints, etc.). |
| `010_drop_dependents_and_refactor_topics.sql` | Drops old dependents; refactors topics to topic_id, slug, title, summary, status (text), metadata. |
| `011_new_schema_pgvector.sql` | Enables pgvector; creates pipeline_runs, sources, stories, topic_stories, claims, story_claims, story_evidence, links, archetypes, theses, viewpoints, viewpoint_theses, narratives, narrative_viewpoint_links; RLS. |
| `012_stories_relevance_fields.sql` | Adds relevance columns to stories; index for cron #2. |
| `013_stories_relevance_status_generated.sql` | relevance_status as generated column. |
| `014_stories_being_processed.sql` | Lock column for cron overlap prevention. |
| `015_stories_extraction_status_fields.sql` | extraction_completed_at, extraction_skipped_empty. |
| `016_stories_scraped_content.sql` | scraped_content (superseded by 017). |
| `017_story_bodies_and_domain_throttle.sql` | story_bodies, domain_throttle; drops scraped_content. |
| `018_story_bodies_domain_throttle_rls.sql` | Enables RLS on story_bodies and domain_throttle. |
| `019_story_chunks.sql` | Creates story_chunks table; RLS. |
| `020_chunk_extraction_and_claims_index.sql` | extraction_json on story_chunks; HNSW index on claims.embedding; story_claims.embedding. |
| `021_claims_nearest_claim_rpc.sql` | RPC match_claims_nearest for pgvector cosine search. |
| `022_relevance_status_threshold_75.sql` | relevance_status threshold 75. |
| `023_stories_scraped_at.sql` | scraped_at on stories. |
| `024_story_bodies_scrape_method.sql` | scrape_method on story_bodies. |
| `025_story_bodies_content_length.sql` | content_length on story_bodies (superseded by 026). |
| `026_story_bodies_content_raw_clean.sql` | content → content_raw; content_clean, content_length_raw/clean, cleaned_at, cleaner_model. |
| `027_story_bodies_drop_extractor_rename_scraped.sql` | Drop extractor_version; rename extracted_at to scraped_at. |
| `028_relevance_status_threshold_50.sql` | Lower relevance_status KEEP threshold from 75 to 50. |
| `044_topic_theses_and_embeddings.sql` | Adds topic_description, topic_embedding to topics; creates topic_theses, topic_relationships; HNSW index on topic_embedding. |
| `045_match_theses_nearest_rpc.sql` | RPCs match_theses_nearest and match_topics_nearest for pgvector similarity search. |
| `047_claim_clusters.sql` | claim_clusters, claim_cluster_members, claim_relationships; claims.cluster_computed_at; RLS. |
| `048_match_clusters_rpc.sql` | RPC match_clusters_nearest for centroid similarity (future topic/consumer use). |
| `049_migrate_thesis_to_clusters.sql` | One-time migration: seed claim_clusters from thesis_claims (seeded_from_thesis=true). |
| `050_position_controversy_clustering.sql` | Hard cutover: drop claim_clusters; create position_clusters, position_cluster_claims, position_pair_scores, controversy_clusters, controversy_cluster_positions, controversy_viewpoints. |
| `051_claims_needs_cluster_update.sql` | Add claims.needs_cluster_update for split refresh/classify scaling. |
| `052_position_controversy_upsert_schema.sql` | Add membership_fingerprint, status, deactivated_at to position_clusters; controversy_fingerprint, status, deactivated_at to controversy_clusters; position_summary_cache; position_cluster_migrations. |
| `053_upsert_position_clusters_rpc.sql` | RPC upsert_position_clusters_batch: fingerprint-based upsert, lineage, mark orphans inactive. |
| `054_upsert_position_pair_scores_rpc.sql` | RPC upsert_position_pair_scores: compute and upsert pair scores (active positions only). |
| `055_upsert_controversy_clusters_rpc.sql` | RPC upsert_controversy_clusters_batch: fingerprint-based upsert, mark orphans inactive. |
| `056_orphan_cleanup_rpc.sql` | RPC run_orphan_cleanup: delete inactive positions/controversies (7+ days), purge lineage (30+ days). |
| `057_upsert_position_clusters_ambiguous_c_fix.sql` | Fix ambiguous column "c" in upsert_position_clusters_batch (orphan block alias). |
| `058_sync_position_summaries_from_cache_rpc.sql` | RPC sync_position_summaries_from_cache: bulk-update position_clusters from cache (no LLM). |
| `066_drop_claim_evidence_links.sql` | Drop claim_evidence_links (Phase 2 canonical evidence layer never implemented). |

After running 010–011, seed the database with **seed_new_schema.sql** (see **Seeding** below). Run 012–021 before scrape, chunk_story_bodies, extract_chunk_claims, merge_story_claims, and link_canonical_claims. Run 050 for the position-controversy clustering engine (replaces 047–049). Run 051 for split refresh/classify scaling. Run 052–058 for iterative upsert (zero-downtime rebuilds).

---

## Seeding

- **Seed file:** [seed_new_schema.sql](seed_new_schema.sql) — for use after migrations 010 and 011. Populates pipeline_runs, sources, stories, topics, topic_stories, archetypes, claims, story_claims, theses, thesis_claims, viewpoints, viewpoint_theses, narratives, narrative_viewpoint_links.
- **How to run:**
  - **Supabase Dashboard:** Open Supabase Dashboard → SQL Editor → paste the contents of `supabase/seed_new_schema.sql` → Run.
  - **Supabase CLI (optional):** If the project is linked, run: `supabase db execute -f supabase/seed_new_schema.sql`.
  - **Print instructions:** Run `node supabase/run-seed.js` (or `npm run seed`) to print these steps; the script may attempt direct execution if an RPC is available.

---

## Edge Functions

### ingest-newsapi (cron #1)

Fetches NewsAPI `/top-headlines` (country=us, category=politics, language=en, pageSize=100), upserts new sources by name, and upserts stories by URL so the same story is never added twice. Creates a `pipeline_runs` row for audit.

- **Cron (pg_cron):** [cron_ingest_newsapi.sql](cron_ingest_newsapi.sql) — runs at 6 AM and 6 PM CST (00:00 and 12:00 UTC). Vault: project_url, service_role_key.

### relevance_gate (cron #2)

Classifies ingested stories into `KEEP`, `DROP`, or `PENDING` using OpenAI. Each run fetches up to `max_stories` unclassified stories (where `relevance_status` is null) from the last N days, sends them to the LLM in a single request, and updates `stories` with `relevance_score`, `relevance_confidence`, `relevance_reason`, `relevance_tags`, `relevance_model`, and `relevance_ran_at`. The function does not write `relevance_status`; it is a **generated column** (migration 028): null when not yet run; **KEEP** when confidence ≥ 60 and score ≥ 50; **DROP** when confidence ≥ 60 and score &lt; 50, or when confidence &lt; 60 and score &lt; 50; **PENDING** when confidence &lt; 60 and score ≥ 50 (or no score). PENDING stories are scraped and then re-reviewed by **review_pending_stories** with full body content. When there are no unclassified stories, the function returns immediately with no work (graceful no-op).

**Request body (optional):** `lookback_days` (1–14, default 7), `max_stories` (1–2000, default 10), `content_max_chars` (0–6000, default 2500), `dry_run` (boolean).

**Cron (pg_cron):** [cron_relevance_gate.sql](cron_relevance_gate.sql) — every 2 minutes. Vault: project_url, service_role_key.

### scrape_story_content (cron #3 – before extraction)

Dispatches **one KEEP or PENDING story per run** to the Cloudflare Worker for scraping. Does not scrape itself: it selects the next eligible story (respecting per-domain throttle), locks it, POSTs to the Worker with `url` and `story_id`, and awaits the response. The Worker scrapes, then calls **receive_scraped_content**, which writes full text to **story_bodies** and updates `stories` (being_processed, scrape_skipped). No LLM.

**Cron (pg_cron):** [cron_scrape_story_content.sql](cron_scrape_story_content.sql) — every 2 minutes. Vault: project_url, service_role_key.

### receive_scraped_content

Edge Function called by the Cloudflare Worker after scraping. Validates **Authorization: Bearer SCRAPE_SECRET**; writes `content_raw` to **story_bodies** and updates `stories` flags. Deploy with `--no-verify-jwt` so it accepts the shared secret instead of a Supabase JWT. Requires `verify_jwt = false` in config or `supabase/config.toml`.

### clean_scraped_content

Cleans raw article text with an LLM: removes site chrome (nav, footer, ads, related links, etc.), writes `content_clean` to story_bodies. Selects one uncleaned story per run; uses OPENAI_MODEL by default, OPENAI_MODEL_LARGE when content_length_raw > 12000. For very long articles (>30k chars), cleans only first 5k + last 5k; middle stays untouched. Run after receive_scraped_content, before chunk_story_bodies.

**Request body (optional):** `max_stories` (1, default 1), `dry_run` (boolean). **Secrets:** `OPENAI_API_KEY`, `OPENAI_MODEL`; optional `OPENAI_MODEL_LARGE`.

**Cron (pg_cron):** [cron_clean_scraped_content.sql](cron_clean_scraped_content.sql) — every 5 minutes.

### chunk_story_bodies

Chunks unchunked story_bodies into story_chunks (3500 chars per chunk, 500 overlap). Selects only rows with `content_clean` (already cleaned). Chunks from `content_clean`. Run after clean_scraped_content. No external APIs.

**Request body (optional):** `max_stories` (1–50, default 10).

**Cron (pg_cron):** [cron_chunk_story_bodies.sql](cron_chunk_story_bodies.sql) — every 2 minutes.

### extract_chunk_claims

Extracts claims, evidence, and links from story chunks via LLM. Writes `extraction_json` to story_chunks. Run after chunk_story_bodies.

**Request body (optional):** `max_chunks` (1–20, default 5). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL`.

**Cron (pg_cron):** [cron_extract_chunk_claims.sql](cron_extract_chunk_claims.sql) — every 2 minutes.

### merge_story_claims

Merges all chunk `extraction_json` for a story into story_claims, story_evidence, story_claim_evidence_links. Deduplicates, normalizes; no orphan evidence. Run after all chunks for a story have extraction_json.

**Request body (optional):** `max_stories` (1–5, default 1). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL`.

**Cron (pg_cron):** [cron_merge_story_claims.sql](cron_merge_story_claims.sql) — every 2 minutes.

### link_canonical_claims

Links story_claims to canonical claims via embedding similarity. Creates new claims when no match above threshold. Required for every new story_claim.

**Request body (optional):** `max_claims` (1–50, default 10). **Secrets:** `OPENAI_API_KEY`; optional `SIMILARITY_THRESHOLD` (0–1, default 0.9).

**Cron (pg_cron):** [cron_link_canonical_claims.sql](cron_link_canonical_claims.sql) — every 2 minutes.

### update_stances

Backfills `stance` on story_claims that have null stance. For each claim, sends raw_text + article content (from story_bodies.content_clean, truncated to 6000 chars) to the LLM; LLM returns support/oppose/neutral. Processes one claim at a time by default.

**Request body (optional):** `max_claims` (1–10, default 1), `dry_run` (boolean). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL`.

**Cron (pg_cron):** [cron_update_stance.sql](cron_update_stance.sql) — every 20 minutes.

### clustering_pipeline (position-controversy engine)

Orchestrates: (1) classify_claim_pairs — populate claim_relationships; (2) build_position_clusters — supporting graph, upsert by fingerprint; (3) aggregate_position_pair_scores; (4) build_controversy_clusters; (5) generate_position_summaries; (6) generate_viewpoints. Uses fingerprint-based upsert for zero-downtime; orphans marked inactive (grace period), deleted by orphan-cleanup-weekly. The periodic cron (`clustering-upsert-periodic`) runs only steps 1–4 (structure only); summaries and viewpoints run on separate crons every 6 hours.

**Request body (optional):** `dry_run` (boolean), `skip_classify` (boolean), `skip_summaries_viewpoints` (boolean, default true; pass false to run summaries/viewpoints in-pipeline). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL`.

**Cron (pg_cron):** [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) — `refresh_claim_eligibility` daily at 3am UTC; `classify_claim_pairs` every 15 min; `clustering-upsert-periodic` (skip_classify, skip_summaries_viewpoints) on 1st and 15th at 2am UTC; `generate-position-summaries-every-6h` every 6h at :00; `generate-viewpoints-every-6h` every 6h at :30; `orphan-cleanup-weekly` Sundays 4am UTC.

### refresh_claim_eligibility

Reevaluates claims with `cluster_computed_at` older than 14 days via vector search (no LLM). Up to 500 claims/run. Resets 14-day timer if no new pairs; sets `needs_cluster_update = true` if new pairs found. **Secrets:** none (SUPABASE_URL, SERVICE_ROLE_KEY only).

### classify_claim_pairs

Populates claim_relationships for eligible claims (cluster_computed_at null OR needs_cluster_update true). Up to 25 claims/run. match_claims_nearest + LLM. Step 1 of clustering_pipeline. **Secrets:** `OPENAI_API_KEY`.

### build_position_clusters

Builds position clusters from supporting edges. Connected components + enforced split (MIN=2, MAX=30). Calls upsert_position_clusters_batch RPC: fingerprint-based upsert, lineage (merge/split), mark orphans inactive. Step 2.

### aggregate_position_pair_scores

Invokes upsert_position_pair_scores RPC: computes pair scores from claim_relationships + position_cluster_claims (active positions only), upserts. Step 3.

### build_controversy_clusters

Reads position_pair_scores, creates controversy clusters (pairs) where score ≥ threshold. Calls upsert_controversy_clusters_batch RPC: fingerprint-based upsert, mark orphans inactive. Step 4. **Secrets:** `OPENAI_API_KEY`.

### generate_position_summaries

Two modes run in parallel: (1) LLM for cache misses (up to 10 per call); (2) sync from position_summary_cache to position_clusters (up to 500, no LLM). Uses membership_fingerprint from position_clusters. Step 5. **Secrets:** `OPENAI_API_KEY`.

### generate_viewpoints

LLM viewpoint per (controversy, position). New-only (skips links with existing viewpoint); positions must have label. max_viewpoints default 25. Step 6. **Secrets:** `OPENAI_API_KEY`.

### claim_cluster_nightly — **removed**

Replaced by **clustering_pipeline**. Function and cron removed; claim_clusters table was dropped in migration 050.

### process_topic

Creates or processes a topic: (1) LLM expands title to description, (2) embeds and stores in topic_embedding, (3) links theses via match_theses_nearest (similarity ≥ 0.60), (4) synthesizes 1,000–1,500 word summary from linked thesis_text, (5) re-embeds title+summary, (6) links related topics via match_topics_nearest (similarity ≥ 0.70, cap 10). Invoked manually or via Admin UI. **On hold:** uses legacy theses; will be overhauled when backend migration to controversy_viewpoints is complete.

**Request body:** `{ title?: string, topic_id?: string }` — either create new topic by title, or process existing topic by id.

**Secrets:** OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.

**Invoke (test):** `curl -L -X POST 'https://<project_ref>.supabase.co/functions/v1/process_topic' -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' -H 'Content-Type: application/json' -d '{"title":"NATO"}'`

### review_pending_stories

Re-reviews stories with **relevance_status = PENDING** that have `content_clean` in **story_bodies** (skips stories not yet cleaned). Sends the first 3000 characters of content_clean to the LLM (same classification prompt as relevance_gate). If confidence >= 60, writes the LLM result (relevance_score, etc.); if confidence < 60, writes a template DROP (score=0, confidence=100, reason="Relevance unclear after thorough review, choosing to drop."). Run after clean_scraped_content so PENDING stories have cleaned bodies.

**Request body (optional):** `lookback_days` (1–14, default 7), `max_stories` (1–50, default 10), `dry_run` (boolean). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL`.

**Cron (pg_cron):** [cron_review_pending_stories.sql](cron_review_pending_stories.sql) — every hour.

### Cron jobs (pg_cron, all times CST)

| Job | Function | Schedule (CST) | SQL file |
|-----|----------|----------------|----------|
| ingest-newsapi-6am-6pm-cst | ingest-newsapi | 6 AM, 6 PM daily | [cron_ingest_newsapi.sql](cron_ingest_newsapi.sql) |
| relevance-gate-every-2min | relevance_gate | Every 2 min | [cron_relevance_gate.sql](cron_relevance_gate.sql) |
| scrape-story-content-every-2min | scrape_story_content | Every 2 min | [cron_scrape_story_content.sql](cron_scrape_story_content.sql) |
| clean-scraped-content-every-5min | clean_scraped_content | Every 5 min | [cron_clean_scraped_content.sql](cron_clean_scraped_content.sql) |
| chunk-story-bodies-every-2min | chunk_story_bodies | Every 2 min | [cron_chunk_story_bodies.sql](cron_chunk_story_bodies.sql) |
| extract-chunk-claims-every-2min | extract_chunk_claims | Every 2 min | [cron_extract_chunk_claims.sql](cron_extract_chunk_claims.sql) |
| merge-story-claims-every-2min | merge_story_claims | Every 2 min | [cron_merge_story_claims.sql](cron_merge_story_claims.sql) |
| link-canonical-claims-every-2min | link_canonical_claims | Every 2 min | [cron_link_canonical_claims.sql](cron_link_canonical_claims.sql) |
| update-stance-every-20min | update_stances | Every 20 min | [cron_update_stance.sql](cron_update_stance.sql) |
| refresh-claim-eligibility-daily | refresh_claim_eligibility | Daily 3am UTC (no LLM, 500/run) | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| classify-claim-pairs-every-15min | classify_claim_pairs | Every 15 min (LLM, 25/run) | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| clustering-upsert-periodic | clustering_pipeline (skip_classify, skip_summaries_viewpoints) | 1st & 15th, 2am UTC (incremental upsert, structure only) | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| generate-position-summaries-every-6h | generate_position_summaries | Every 6h at :00 UTC | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| generate-viewpoints-every-6h | generate_viewpoints | Every 6h at :30 UTC | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| orphan-cleanup-weekly | run_orphan_cleanup (RPC) | Sundays 4am UTC | [cron_clustering_pipeline.sql](cron_clustering_pipeline.sql) |
| cleanup-cron-job-run-details-daily | DELETE cron.job_run_details | Daily 4:30am UTC (2-day retention) | [cron_cleanup_logs.sql](cron_cleanup_logs.sql) |
| cleanup-http-responses-hourly | DELETE net._http_response | Every hour (1-hour retention) | [cron_cleanup_logs.sql](cron_cleanup_logs.sql) |
| purge-drop-stories-monthly | purge_drop_stories (RPC) | 1st of month, 4am UTC (30-day retention) | [cron_purge_drop_stories.sql](cron_purge_drop_stories.sql) |
| claim-cluster-hourly *(removed)* | claim_cluster_nightly | — | *(function and cron removed)* |
| review-pending-stories-every-hour | review_pending_stories | Every hour | [cron_review_pending_stories.sql](cron_review_pending_stories.sql) |

**New engine:** Use `refresh-claim-eligibility-daily`, `classify-claim-pairs-every-15min`, `clustering-upsert-periodic`, `generate-position-summaries-every-6h`, and `generate-viewpoints-every-6h`. Deprecated crons (claim-cluster-hourly, claim-to-thesis, label-thesis) have been removed; their SQL files are deleted. receive_scraped_content has no cron; it is invoked by the Cloudflare Worker after scrape_story_content triggers the Worker. Prerequisites for all: pg_cron and pg_net enabled; Vault secrets `project_url` and `service_role_key`. To change a schedule: `cron.unschedule('job-name')` then run the updated SQL file.

### Deploy and secrets

- **Secrets (set in Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`):**
  - `NEWSAPI_API_KEY` — for ingest-newsapi; get at [newsapi.org](https://newsapi.org)
  - `OPENAI_API_KEY` — for relevance_gate; get at [platform.openai.com](https://platform.openai.com)
  - Optional: `OPENAI_MODEL` (default `gpt-4o-mini`)
  - **scrape_story_content:** `WORKER_SCRAPE_URL` (e.g. `https://doxa.grpallen.workers.dev`), `SCRAPE_SECRET`
  - **receive_scraped_content:** `SCRAPE_SECRET` (same value as Worker)
- **Deploy:** `supabase functions deploy ingest-newsapi` (and `relevance_gate`, `scrape_story_content`, `receive_scraped_content`, `clean_scraped_content`, `review_pending_stories`, `chunk_story_bodies`, `extract_chunk_claims`, `merge_story_claims`, `link_canonical_claims`, `update_stances`, `refresh_claim_eligibility`, `classify_claim_pairs`, `build_position_clusters`, `aggregate_position_pair_scores`, `build_controversy_clusters`, `generate_position_summaries`, `generate_viewpoints`, `clustering_pipeline`, `process_topic`). For receive_scraped_content, use `--no-verify-jwt`. **Clustering sub-functions** must be deployed with `--no-verify-jwt` so clustering_pipeline can invoke them (config.toml alone may not apply on updates). Redeploy with:
```
supabase functions deploy classify_claim_pairs --no-verify-jwt
supabase functions deploy build_position_clusters --no-verify-jwt
supabase functions deploy aggregate_position_pair_scores --no-verify-jwt
supabase functions deploy build_controversy_clusters --no-verify-jwt
supabase functions deploy generate_position_summaries --no-verify-jwt
supabase functions deploy generate_viewpoints --no-verify-jwt
```
- **Invoke (test):** `curl -L -X POST 'https://<project_ref>.supabase.co/functions/v1/ingest-newsapi' -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' -H 'Content-Type: application/json' -d '{}'` (or `/relevance_gate`, `/chunk_story_bodies`, `/extract_chunk_claims`, `/merge_story_claims`, `/link_canonical_claims`, `/update_stances`, `/process_topic`)
- **Cron:** See [Cron jobs (pg_cron)](#cron-jobs-pg_cron-all-times-cst) above. Run each SQL file once (after Vault is set up); to update a schedule, unschedule the job then run the script again.

---

## Row Level Security (RLS)

- **Current schema (001–009):** RLS is defined in the migration files (topics, viewpoints, topic_viewpoints, topic_relationships, sources, validations, viewpoint_votes, users, avatars).
- **Target schema (011+):** RLS enabled on pipeline_runs, sources, stories, topic_stories, claims, story_claims, story_evidence, and bridge tables; public read policies where appropriate. **story_bodies**, **story_chunks**, and **domain_throttle** have RLS (migrations 018–019) with public read. Edge Functions use service_role and bypass RLS.

---

## Implementation status

- **Current app:** Uses the legacy schema (topics, viewpoints, topic_viewpoints, topic_relationships, sources, validations, viewpoint_votes). See migrations 001–009.
- **Target (data dictionary above):** Not yet implemented in migrations. This README is the source of truth for the pipeline/ingestion and claim–thesis–viewpoint model. New migrations and API changes will align to it over time.

---

## Aligning with intentions / possible tweaks

When you review this doc and the target schema:

1. **Tables and keys:** Confirm that every table and PK/unique in the data dictionary matches product intentions (ingestion → extraction → canonical → clustering → synthesis → narratives).
2. **Column names and types:** Check that types (uuid, text, jsonb, numeric, timestamptz, optional vector) and key columns (e.g. `canonical_hash`, `run_id`, `assignment_method`) match how the pipeline and app will use them.
3. **Relationships:** Confirm FKs and recommended unique constraints (e.g. topic_stories) match business rules.
4. **RLS and access:** Ensure read/write rules for the new tables will match who can see or edit what (public read for published content; pipeline/service role for writes).

Once you’ve reviewed, we can adjust this README and add migrations so the backend evolves toward the data dictionary above.
