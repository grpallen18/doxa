# Explore people profiles

Consumer dossiers at **`/people`**. Rows come from Postgres **`graph_people`**, filled by Edge **`project_person_profiles`** (also the last step of **`analysis_pipeline`**). That orchestrator has **no cron**.

Related: [analysis-pipeline README](../doxa-agents/departments/07-analysis-engine/analysis-pipeline/README.md) · [API_ENDPOINTS.md](../API_ENDPOINTS.md)

## Intent

People are a **way to find debates**, not a bio or a news feed. The index lists projected persons; a profile shows the distinct questions they appear in, publishers, sample propositions, and an optional eidos graph.

`project_debate_summaries` does **not** write `graph_people`. Empty `/people` after a healthy debate projection is expected until analysis runs.

## Routes

| Path | Data |
|------|------|
| `/people` | `listPeople` — up to **48** `graph_people` rows |
| `/people/[uid]` | `getPersonProfile` — projected row, or a skeletal Neo fallback |
| `/people/[uid]/eidos` | Eidos canvas from the profile payload |
| `/entities/[uid]` | **Redirects** to `/people/{uid}` (`lib/explore-routes.ts`) |
| `/search?q=` | People hits via `GET /api/explore/search` (`searchPeople` ILIKE on name) |

Session required (same middleware as the rest of explore). There is **no** dedicated `/api/people` route — pages are SSR.

Search sanitizes `% _ , . ( ) '` before ILIKE (`lib/explore/person.ts`).

## Projection

Handler: `doxa-agents/departments/07-analysis-engine/analysis-pipeline/09-project-person-profiles/handler.ts`  
Deploy: `project_person_profiles` (JWT-off, `requireInternalAuth`).

```text
Neo Entity(kindHint=person) with ≥1 MENTIONS utterance
  → upsert graph_people (stats, controversies, eidos, publishers, documents, …)
  → /people reads Postgres
```

Body: `{ "dry_run": false, "limit": 80 }`.

| Limit | Value |
|-------|--------|
| Direct invoke default | **80** (clamped 1–200) |
| Via `analysis_pipeline` | Capped at **40** (`PERSON_PROFILE_LIMIT_CAP`) so a large orchestrator `limit` cannot idle-timeout Edge |
| LLM steps in the same orchestrator | Capped at **25** |

Needs Edge secrets `SUPABASE_*` + `NEO4J_*`. Missing Neo → **500** `"Neo4j not configured"`.

`dry_run: true` returns `{ ok, dry_run, people, limit }` without writing.

**Fire rating** is deterministic 1–5 from debate count, mean sides, and distinct sources — not an LLM score (`fireRating()` in the handler).

## Profile fallback

`getPersonProfile`:

1. Load `graph_people` by uid. Controversies prefer `graph_controversy_subjects` over the JSON blob.
2. If no row: look up Neo `Entity` with `kindHint=person`. If found, return a **skeletal** profile (`projected: false`) plus any subject-index controversies.
3. Else **404**.

The **index** (`/people`) only lists projected rows. A deep link to a Neo person that was never projected can still render a thin page.

## When to run what

| Goal | Invoke |
|------|--------|
| Fill `/people` only | `project_person_profiles` |
| Assessments + people | `analysis_pipeline` (includes person profiles last) |
| Home / `/c` controversies | `project_debate_summaries` (debate pipeline — not this step) |

Admin Center run-step or `supabase functions invoke` with service-role auth.

## Pitfalls

- **Empty `/people`** — analysis never ran, Edge missing `NEO4J_*`, or Neo has no `kindHint=person` entities with mentions. Debate rebuild (`DEBATE_REBUILD_MODE=true`) does not hide `/people`, but home/search stay empty.
- **Index empty, `/people/{uid}` works** — skeletal Neo fallback; run projection to populate stats/eidos.
- **Search finds nobody** — people are only in `graph_people`. Rebuild mode search also returns empty arrays.
- **Orchestrator `limit: 80` only projected 40 people** — expected. Invoke `project_person_profiles` directly for up to 200 per call.
- **`/entities/...` bookmarks** — they redirect; do not document entities as the product surface.
