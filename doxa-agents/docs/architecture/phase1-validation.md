# Phase 1 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)  
Handoff: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)

**Preference:** under-merge over over-merge. Vectors are candidates only — never silent auto-merge without a `Decision`.

## Versions

- `GRAPH_SCHEMA_VERSION = 2.1.0`
- `EXTRACTOR_VERSION = 2.1.1-utterance-proposition`

## Entity titles (2.1.1)

- Person Entity `name` is identity-only (`Donald Trump`), not `President Donald Trump`.
- Office-like titles promote to an Office Entity (`kindHint=office`) linked via
  `(person)-[:REFERRED_AS {documentUid, title, source:'mention_title'}]->(office)`.
- `MENTIONS.surfaceForm` / `MENTIONS.title` keep the article wording for provenance.
- Honorifics (`Mr.`, `Ms.`, …) are stripped and not promoted.

- Auto-link cosine threshold: **0.92** (`PROPOSITION_AUTO_LINK_THRESHOLD` / `ENTITY_AUTO_LINK_THRESHOLD`)
- Near-miss band for `VARIANT_OF` / quarantine Decision: **0.75–0.92**

## Evidence story (2026-08-03)

- `story_id`: `1ab913f7-3913-4fd3-be18-6ceafc9f4dd4`
- Jobs: `75cbe28e-357d-4465-8f4e-7bc26133a523`, `24a38183-97f0-4a79-9b93-8c5aa477806e`, `b0cb1635-15ec-499c-9429-b695d1811ae2` — `succeeded`, `schema_version=2.1.0`
- Aura spot-check (`scripts/phase1_aura_check.py`): EXPRESSES + ABOUT Decisions with `missing_prop_dec=0` / `missing_ent_dec=0`, Segment grounding intact
- Azure revision with ABOUT-edge audit: `doxa-graph-worker--0000009`

## Automated (no Aura)

From `services/graph-worker`:

```bash
python -m unittest discover -s tests -v
```

Includes Phase 1 link/ER unit tests (`tests/test_phase1_link.py`): threshold gate, VARIANT_OF (including distinct variant uid + unspecified→concrete), never-merge office/person.

## Provenance Cypher

```cypher
MATCH (u:Utterance {documentUid: $storyId})-[:EXPRESSES]->(p:Proposition)
OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'proposition_link'})-[:ABOUT]->(p)
OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
OPTIONAL MATCH (p)-[:VARIANT_OF]->(parent:Proposition)
RETURN u.uid, p.uid, p.text, dec.status, dec.confidence, seg.ord, parent.uid
ORDER BY seg.ord
```

Entity mentions:

```cypher
MATCH (u:Utterance {documentUid: $storyId})-[:MENTIONS]->(e:Entity)
OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'entity_link'})-[:ABOUT]->(e)
RETURN u.uid, e.name, e.kindHint, dec.status, dec.confidence
```

## Checklist

- [x] Proposition + `EXPRESSES` + `Decision(decisionType=proposition_link)` written for each utterance — evidence story above (6/6)
- [x] No auto-reuse of Proposition below 0.92; near-miss may set `Decision.status=quarantined` or `VARIANT_OF` — unit tests + link thresholds in `proposition_link.py`
- [x] Entity ER never-merges office vs person / org vs person — `tests/test_phase1_link.py`
- [x] Every `EXPRESSES` path has Segment grounding (Phase 1 provenance audit) — Aura `missing_grounding=0`
- [x] Reprocess under `2.1.0` replaces document subgraph; shared Publication reused — second job `24a38183-…` succeeded after force re-enqueue
- [x] Admin Neo list shows `quarantined` errors + schema version; document header shows proposition/entity counts — `neo-story-list.tsx` / `neo-document-workspace.tsx`

## Manual Aura acceptance

1. Apply updated [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) (includes Proposition/Entity) — applied 2026-08-03 via `scripts/apply_constraints.py`
2. Redeploy Azure `doxa-graph-worker` with schema `2.1.0` — revision `doxa-graph-worker--0000008`
3. Enqueue a succeeded Phase 0 story; confirm job `schema_version=2.1.0` and Neo counts > 0 — done
4. Spot-check Cypher above; prefer distinct propositions when meanings differ — done (`phase1_aura_check.py`)
