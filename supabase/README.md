# Doxa Backend (Supabase)

This document describes the Doxa database schema, data dictionary, table purposes, and how tables relate. It is the source of truth for backend/data intentions. For step-by-step setup of the current migrations, see [SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md).

## Quick setup

1. Run migrations in order (SQL Editor): `001_initial_schema.sql` through `012_stories_relevance_fields.sql`.
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

**Purpose:** One row per ingested article/story. Rolls up to sources. Relevance fields are filled by cron #2 (classify ingested stories into KEEP/DROP).

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
| `content_full` | text (nullable) | Optional if you store full text. |
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
| `012_stories_relevance_fields.sql` | Adds relevance columns to stories (relevance_status, relevance_score, relevance_confidence, relevance_reason, relevance_tags, relevance_model, relevance_ran_at); index for cron #2. |

After running 010, 011, and 012, seed the database with **seed_new_schema.sql** (see **Seeding** below).

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

- **Cron (pg_cron):** Schedule with [cron_ingest_newsapi.sql](cron_ingest_newsapi.sql). The default example runs at 7:08/7:10/7:12 PM CST (01:08/01:10/01:12 UTC) and pulls the project URL and service role key from Vault. Adjust the cron expression if you need a different cadence.

### relevance_gate (cron #2)

Classifies ingested stories into `KEEP`, `DROP`, or `PENDING` using OpenAI. Each run fetches up to `max_stories` unclassified stories (where `relevance_status` is null) from the last N days, sends them to the LLM in a single request, and updates `stories` with `relevance_score`, `relevance_confidence`, `relevance_reason`, `relevance_tags`, `relevance_model`, and `relevance_ran_at`. The function does not write `relevance_status`; it is a **generated column** on `stories` computed from `relevance_ran_at`, `relevance_score`, and `relevance_confidence`: null when not yet run; `PENDING` when no score or confidence &lt; 60; `KEEP` when score ≥ 60; else `DROP`. When there are no unclassified stories, the function returns immediately with no work (graceful no-op).

**Request body (optional):** `lookback_days` (1–14, default 7), `max_stories` (1–2000, default 10), `content_max_chars` (0–6000, default 2500), `dry_run` (boolean).

**Cron (pg_cron):** Schedule at 11:05 AM UTC, then every 2 minutes until 11:30 AM UTC. Store your project URL and service role key in [Supabase Vault](https://supabase.com/docs/guides/database/vault), then run [supabase/cron_relevance_gate.sql](cron_relevance_gate.sql) once (see comments in that file for Vault setup steps).

### scrape_story_content (cron #3 – before extraction)

Scrapes full body text from story URLs for **KEEP** stories and writes to `stories.scraped_content` only; `content_full` comes from NewsAPI and is never overwritten. No LLM. Considers all KEEP stories (including those with no URL); sets `scrape_skipped` when URL is null or scrape fails so every story is assessed once and unscrapable ones are not retried. Run before `extract_story_claims_evidence`. Optional body: `max_stories` (default 5), `content_min_length`, `dry_run`.

**Cron (pg_cron):** [cron_scrape_story_content.sql](cron_scrape_story_content.sql) – uses same Vault secrets; schedule to run before extract (e.g. 11:05 UTC).

### extract_story_claims_evidence (cron #4)

Extracts claims, evidence, and links from KEEP stories using the LLM. Uses **final_content** = longest of `content_full`, `scraped_content`, and `content_snippet` (no URL scraping; run `scrape_story_content` first). One story per run. Optional body: `dry_run`.

**Cron (pg_cron):** [cron_extract_story_claims_evidence.sql](cron_extract_story_claims_evidence.sql).

### Deploy and secrets

- **Secrets (set in Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`):**
  - `NEWSAPI_API_KEY` — for ingest-newsapi; get at [newsapi.org](https://newsapi.org)
  - `OPENAI_API_KEY` — for relevance_gate; get at [platform.openai.com](https://platform.openai.com)
  - Optional: `OPENAI_MODEL` (default `gpt-4o-mini`)
- **Deploy:** `supabase functions deploy ingest-newsapi --project-ref gjxihyaovyfwajjyoyoz` and `supabase functions deploy relevance_gate --project-ref gjxihyaovyfwajjyoyoz`
- **Invoke (test):** `curl -L -X POST 'https://gjxihyaovyfwajjyoyoz.supabase.co/functions/v1/ingest-newsapi' -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY'` (or `/relevance_gate` for cron #2)
- **Cron:** Run relevance_gate at 11:05 AM UTC, then every 2 minutes until 11:30 AM UTC (cron `5,7,9,11,13,15,17,19,21,23,25,27,29 11 * * *`). Each run processes up to max_stories (default 10); when there are none, the run is a quick no-op. Keep ingest-newsapi on its current schedule and run relevance_gate after it as needed.

---

## Row Level Security (RLS)

- **Current schema (001–009):** RLS is defined in the migration files (topics, viewpoints, topic_viewpoints, topic_relationships, sources, validations, viewpoint_votes, users, avatars).
- **Target schema:** RLS policies for the new tables (sources, stories, topics, topic_stories, story_claims, claims, story_evidence, pipeline_runs, archetypes, theses, viewpoints, global_viewpoints, and bridge tables) will be added in future migrations. Plan for: public read where appropriate (e.g. published topics, global_viewpoints); restrict write to service role or authenticated pipeline/backend.

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
