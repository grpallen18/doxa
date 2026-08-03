# Phase 0 validation checklist

Steering: [neo4j-graph-architecture.md](neo4j-graph-architecture.md)

**Signed off:** 2026-08-02 (America/Chicago) / 2026-08-03 UTC  
**Evidence story:** `1ab913f7-3913-4fd3-be18-6ceafc9f4dd4` (Time / Trump ODNI)  
**Jobs:** succeeded `b344b5a2-…`, reprocess succeeded `e691828a-…` (`schema_version=2.0.0`, `extractor_version=2.0.3-utterance`); prior quarantine `081cca6b-…`

Phase 0 success criterion: for one cleaned story, Neo4j can answer **who said what, in which segment, with which attribution mode**, via:

```cypher
MATCH (u:Utterance)-[:GROUNDED_IN]->(seg:Segment)<-[:CONTAINS]-(d:Document)
OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
OPTIONAL MATCH (u)-[:PRODUCED_BY]->(r:ExtractionRun)
RETURN d.uid, p.name, a.name, u.attributionMode, u.speechAct, u.text, seg.ord, r.uid
ORDER BY seg.ord
```

## Automated (no Aura)

From `services/graph-worker`:

```bash
python -m unittest discover -s tests -v
```

Covers: segment offset fidelity, stable ords, span mismatch rejection, speaker required except `journalist_voice`.

**Result (2026-08-02):** 7 passed, 1 integration skipped (`RUN_GRAPH_INTEGRATION` unset).

## Fixture

Synthetic article: [`services/graph-worker/fixtures/sample_article.txt`](../../../services/graph-worker/fixtures/sample_article.txt)

Expected discourse (manual / LLM-assisted):

- Paraphrase or quote from Sen. Maria Chen (prediction about crossings)
- White House / spokesperson pushback (`reported_speech` or paraphrase)
- Critics’ prescription; Chen’s assumption about enforcement capacity

Live acceptance used production story above (fixture path available for future runs).

## Manual Aura acceptance

1. Re-run [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura — **done** via `scripts/apply_constraints.py` (+ document constraint).
2. Graph-worker versions from code: `GRAPH_SCHEMA_VERSION=2.0.0` / `EXTRACTOR_VERSION=2.0.3-utterance` (`app/config.py`). Azure app `doxa-graph-worker` Running.
3. Story with cleaned body already graphed; re-enqueued via `enqueue_graph_processing_job`.
4. Confirmed `stories.graph_status = succeeded` and job `schema_version = 2.0.0`.
5. Cypher provenance: every Utterance had Segment + ExtractionRun; non-journalist rows had Agent; Publication `Time`.
6. Re-enqueue: Publication uid/elementId reused (`dbfffcdb-…` / `…:2`); subgraph rebuilt (utterance count refreshed).
7. Quarantine: historical job `081cca6b-…` status `quarantined` (span locate failures); unit tests cover reject paths.

## Checklist

- [x] Provenance completeness (Utterance → Segment → Document → Publication) — Aura check: 0 missing runs/segs; pub=Time
- [x] Attribution modes distinguished (`direct_quote` / `paraphrase` observed on first succeeded run; vocabs enforced in validate)
- [x] Offset fidelity (`GROUNDED_IN.charStart/charEnd` matches Document body) — `scripts/phase0_offset_check.py`: 0 mismatches
- [x] Reprocess idempotency under schema `2.0.0` — job `e691828a-…` succeeded; Publication node reused
- [x] Quarantine on bad spans / missing speaker / failed provenance audit — job `081cca6b-…` + unit tests
- [x] Token fields populated on job/attempt when OpenAI usage present — e.g. `prompt_tokens=2126`, `total_tokens=2729` on reprocess
