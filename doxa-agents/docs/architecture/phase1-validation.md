# Phase 1 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  
Handoff: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

**Preference:** under-merge over over-merge. Vectors are candidates only — never silent auto-merge without a `Decision`.

## Versions

- `GRAPH_SCHEMA_VERSION = 2.1.0`
- `EXTRACTOR_VERSION = 2.1.2-utterance-proposition`
- Auto-link cosine threshold: **0.92** (`PROPOSITION_AUTO_LINK_THRESHOLD` / `ENTITY_AUTO_LINK_THRESHOLD`)
- Near-miss band for `VARIANT_OF` / quarantine Decision: **0.75–0.92**

## Titles / offices (2.1.1–2.1.2)

- **Person Entity** and **Agent** display names are identity-only (`Donald Trump`), not `President Donald Trump`.
- Office-like titles promote to an Office `Entity` (`kindHint=office`) linked via
  `REFERRED_AS {documentUid, title, source:'mention_title'}` from both person Entity and Agent.
- Provenance keeps article wording on `MENTIONS.surfaceForm` / `ASSERTED_BY.surfaceForm`.
- Honorifics (`Mr.`, `Ms.`, …) are stripped and not promoted; party prefixes (`Republican Sen.`) are handled.
- Admin Neo explorer labels Agents by canonical name and shows Office nodes + `REFERRED_AS`.

## Evidence story (2026-08-03)

- `story_id`: `1ab913f7-3913-4fd3-be18-6ceafc9f4dd4`
- Latest succeeded job uses `schema_version=2.1.0`, `extractor_version=2.1.2-utterance-proposition`
- Aura: Agents `Donald Trump` / `Tom Cotton` / `John Thune`; offices via `REFERRED_AS`
- Admin: Neo document **Reprocess** button + last-graphed timestamp (`graph_processing_jobs.finished_at`)

## Automated (no Aura)

From `services/graph-worker`:

```bash
python -m unittest discover -s tests -v
```

Includes Phase 1 link/ER unit tests (`tests/test_phase1_link.py`): threshold gate, VARIANT_OF, never-merge office/person, title parsing.

## Provenance Cypher

```cypher
MATCH (u:Utterance {documentUid: $storyId})-[:EXPRESSES]->(p:Proposition)
OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'proposition_link'})-[:ABOUT]->(p)
OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
OPTIONAL MATCH (p)-[:VARIANT_OF]->(parent:Proposition)
RETURN u.uid, p.uid, p.text, dec.status, dec.confidence, seg.ord, parent.uid
ORDER BY seg.ord
```

Agent / office titles:

```cypher
MATCH (a:Agent)-[r:REFERRED_AS {documentUid: $storyId}]->(o:Entity)
RETURN a.name, o.name, r.title
```

Entity mentions:

```cypher
MATCH (u:Utterance {documentUid: $storyId})-[:MENTIONS]->(e:Entity)
OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'entity_link'})-[:ABOUT]->(e)
RETURN u.uid, e.name, e.kindHint, dec.status, dec.confidence
```

## Checklist

- [x] Proposition + `EXPRESSES` + `Decision(decisionType=proposition_link)` written for each utterance
- [x] No auto-reuse of Proposition below 0.92; near-miss may set `Decision.status=quarantined` or `VARIANT_OF`
- [x] Entity ER never-merges office vs person / org vs person
- [x] Every `EXPRESSES` path has Segment grounding (Phase 1 provenance audit)
- [x] Reprocess under `2.1.0` replaces document subgraph; shared Publication reused
- [x] Admin Neo list shows `quarantined` errors + schema version; document header shows proposition/entity counts + Reprocess
- [x] Agent names are title-free; titles appear as Office nodes via `REFERRED_AS` (extractor `2.1.2`)

## Manual Aura acceptance

1. Apply updated [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) (includes Proposition/Entity).
2. Redeploy Azure `doxa-graph-worker` with extractor `2.1.2-utterance-proposition`.
3. Enqueue / Admin Reprocess a story; confirm Agent labels and Office `REFERRED_AS` in Neo UI.
4. Deploy edge functions so automatic clean/enqueue uses current graph-jobs versions:

```bash
supabase functions deploy clean_scraped_content --no-verify-jwt
supabase functions deploy enqueue_graph_job --no-verify-jwt
```
