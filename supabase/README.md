# Doxa Backend (Supabase)

This document describes the Doxa database schema, data dictionary, table purposes, and how tables relate. It is the source of truth for backend/data intentions. For step-by-step setup of the current migrations, see [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md).

## Quick setup

1. Run migrations in order (SQL Editor): `001_initial_schema.sql` through `021_claims_nearest_claim_rpc.sql`.
2. Seed the database: run [seed_new_schema.sql](seed_new_schema.sql) in the Supabase SQL Editor (paste the file contents and run). See **Seeding** below for details.
3. See [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md) for detailed instructions and verification (if that file exists).

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

**Purpose:** One row per ingested article/story. Rolls up to sources. Relevance fields are filled by cron #2 (classify ingested stories into KEEP/DROP). Full article text is stored in **story_bodies**; stories holds only scrape status flags (`being_processed`, `scrape_skipped`).

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
| `content_full` | text (nullable) | Full text from NewsAPI (optional). |
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
| `extraction_completed_at` | timestamptz (nullable) | When extraction wrote at least one claim/evidence. |
| `extraction_skipped_empty` | boolean | True when extraction ran but found nothing. |

---

### story_bodies

**Purpose:** Full article text scraped from story URLs. One row per story. Written by **receive_scraped_content** (called by the Cloudflare Worker after scraping). **clean_scraped_content** cleans `content_raw` with an LLM and writes `content_clean`. Chunking and re-review use `content_clean`.

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
| `summary` | text (nullable) | Canonical topic blurb. |
| `status` | text | e.g. draft \| published \| archived. |
| `metadata` | jsonb | Tags, time window defaults, etc. |
| `created_at` | timestamptz | When the topic was created. |
| `updated_at` | timestamptz | Last update. |

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

### claim_evidence_links

**Purpose:** Canonical claim ↔ evidence links for aggregation and drilldown (Phase 2 “lift”: “This cross-story canonical claim relates to the evidence in this story.”).

| Column | Type | Purpose |
|--------|------|---------|
| `claim_id` | uuid (FK → claims.claim_id) | Which canonical claim. |
| `evidence_id` | uuid (FK → story_evidence.evidence_id) | Which evidence. |
| `relation_type` | text | supports \| contradicts \| contextual. |
| `confidence` | numeric | Confidence. |
| `rationale` | text (nullable) | Short explanation. |
| `link_origin` | text | intra_story \| cross_story. |
| `origin_story_id` | uuid (FK → stories.story_id, nullable) | Where link was discovered. |
| `origin_story_claim_id` | uuid (FK → story_claims.story_claim_id, nullable) | Origin story-claim. |
| `run_id` | uuid (FK → pipeline_runs.run_id, nullable) | Which run produced this. |
| `created_at` | timestamptz | When the link was created. |

**Keys:** Recommend unique `(claim_id, evidence_id, relation_type, origin_story_id)`.

---

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

### theses

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
- Canonical/derived layers are topic-scoped (`theses`, `viewpoints`, `global_viewpoints`) and use bridge tables for flexibility.
- Evidence is stored as story-scoped artifacts (`story_evidence`), but is claim-aggregated via `claim_evidence_links` after canonicalization.

---

## Schema overview (target)

The **target** Doxa backend is built around:

1. **Ingestion:** **sources** (publishers) and **stories** (articles). **topic_stories** assigns stories to topics.
2. **Extraction:** **story_claims** (raw claims per story) and **story_evidence** (quotes, stats, citations). **story_claim_evidence_links** ties evidence to story-claims (Phase 1).
3. **Canonical layer:** **claims** (normalized, de-duplicated). **claim_evidence_links** ties canonical claims to evidence (Phase 2).
4. **Lenses:** **archetypes** (economic, legal, moral, etc.). **claim_archetypes** assigns claims to archetypes.
5. **Clustering:** **theses** (claim clusters per topic + archetype). **thesis_claims** links claims to theses.
6. **Synthesis:** **viewpoints** (archetype-scoped positions per topic, from theses). **viewpoint_theses** links theses to viewpoints.
7. **Cross-topic:** **narratives** (aggregation of viewpoints into overarching narratives). **narrative_viewpoint_links** links narratives to topic-level viewpoints.
8. **Audit:** **pipeline_runs** tracks AI/ETL runs for idempotency and debugging.

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
                        ├── theses (topic_id, archetype_id) ── thesis_claims ──► claims
                        ├── viewpoints (topic_id, archetype_id) ── viewpoint_theses ──► theses
                        └── global_viewpoints ── global_viewpoint_members ──► viewpoints

archetypes (archetype_id) ── claim_archetypes ──► claims

claims ◄── claim_evidence_links ──► story_evidence

pipeline_runs (run_id) ── referenced by topic_stories, story_claims, story_evidence,
  story_claim_evidence_links, claim_evidence_links, claim_archetypes, theses,
  thesis_claims, viewpoints, viewpoint_theses, global_viewpoints, global_viewpoint_members
```

- **Stories** are topic-agnostic; **topic_stories** scopes them to topics.
- **Canonical claims** are linked to **story_evidence** via **claim_evidence_links**; **story_claim_evidence_links** is story-local (Phase 1).
- **Theses** and **viewpoints** are topic- and archetype-scoped; **global_viewpoints** is the UX-facing consolidation per topic.

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

After running 010–011, seed the database with **seed_new_schema.sql** (see **Seeding** below). Run 012–021 before scrape, chunk_story_bodies, extract_chunk_claims, merge_story_claims, and link_canonical_claims.

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

### claim_to_thesis (Postgres function)

Clusters canonical claims into theses by embedding similarity. Processes up to 5 claims per run (FOR UPDATE SKIP LOCKED). Links each claim to matching theses (cosine similarity >= 0.70, cap 3) or creates a new thesis bucket; updates thesis centroid embeddings. No Edge Function; runs inside the DB.

**Cron (pg_cron):** [cron_claim_to_thesis.sql](cron_claim_to_thesis.sql) — every 2 minutes. Runs `SELECT claim_to_thesis_run(5);` (no HTTP, no Vault).

### thesis_drift_relabel

Finds theses with the biggest centroid-vs-text discrepancy, fetches representative claims (up to 30: mix of most central and most recent), calls the LLM to produce one thesis sentence, embeds it, and updates thesis_text / thesis_text_embedding / thesis_text_ok / last_text_ok_claim_count. One LLM call per thesis per run. Eligible when: no text yet and claim_count >= 5; or thesis_text_ok = false; or text has drifted (similarity < 0.70) and at least 5 new claims since last OK.

**Request body (optional):** `dry_run` (boolean), `batch_theses` (1–20, default 10). **Secrets:** `OPENAI_API_KEY`; optional `OPENAI_MODEL` (chat + embedding).

**Cron (pg_cron):** [cron_thesis_drift_relabel.sql](cron_thesis_drift_relabel.sql) — every 10 minutes (optional).

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
| claim-to-thesis-every-2min | claim_to_thesis_run (SQL) | Every 2 min | [cron_claim_to_thesis.sql](cron_claim_to_thesis.sql) |
| thesis-drift-relabel-every-10min | thesis_drift_relabel | Every 10 min | [cron_thesis_drift_relabel.sql](cron_thesis_drift_relabel.sql) |
| review-pending-stories-every-hour | review_pending_stories | Every hour | [cron_review_pending_stories.sql](cron_review_pending_stories.sql) |

receive_scraped_content has no cron; it is invoked by the Cloudflare Worker after scrape_story_content triggers the Worker. Prerequisites for all: pg_cron and pg_net enabled; Vault secrets `project_url` and `service_role_key`. To change a schedule: `cron.unschedule('job-name')` then run the updated SQL file.

### Deploy and secrets

- **Secrets (set in Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`):**
  - `NEWSAPI_API_KEY` — for ingest-newsapi; get at [newsapi.org](https://newsapi.org)
  - `OPENAI_API_KEY` — for relevance_gate; get at [platform.openai.com](https://platform.openai.com)
  - Optional: `OPENAI_MODEL` (default `gpt-4o-mini`)
  - **scrape_story_content:** `WORKER_SCRAPE_URL` (e.g. `https://doxa.grpallen.workers.dev`), `SCRAPE_SECRET`
  - **receive_scraped_content:** `SCRAPE_SECRET` (same value as Worker)
- **Deploy:** `supabase functions deploy ingest-newsapi` (and `relevance_gate`, `scrape_story_content`, `receive_scraped_content`, `clean_scraped_content`, `review_pending_stories`, `chunk_story_bodies`, `extract_chunk_claims`, `merge_story_claims`, `link_canonical_claims`). For receive_scraped_content, use `--no-verify-jwt`.
- **Invoke (test):** `curl -L -X POST 'https://<project_ref>.supabase.co/functions/v1/ingest-newsapi' -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' -H 'Content-Type: application/json' -d '{}'` (or `/relevance_gate`, `/chunk_story_bodies`, `/extract_chunk_claims`, `/merge_story_claims`, `/link_canonical_claims`)
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
3. **Relationships:** Confirm FKs and recommended unique constraints (e.g. claim_evidence_links, topic_stories) match business rules.
4. **RLS and access:** Ensure read/write rules for the new tables will match who can see or edit what (public read for published content; pipeline/service role for writes).

Once you’ve reviewed, we can adjust this README and add migrations so the backend evolves toward the data dictionary above.
