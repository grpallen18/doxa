# Neo4j graph architecture (steering document)

**Status:** Phase 1 implemented (Proposition + cautious Entity ER; Phase 0 validation signed off)  
**Next phases:** [neo4j-overhaul-next.md](neo4j-overhaul-next.md)  
**Validation:** [phase0-validation.md](phase0-validation.md)

This is the authoritative architecture document for the Neo4j discourse graph. Implementation work should reference this file. Do not maintain contradictory pipeline descriptions elsewhere.

## Purpose

Doxa’s product center of gravity is **controversy topology** (agreement / opposition / multi-sided debate). That product requires a **provenance-rich knowledge graph** as substrate.

Core invariant: **preserve what was communicated before normalizing meaning.** Utterances are immutable source-grounded speech acts. Propositions, arguments, and analytical assessments are later derived layers with explicit Decision provenance.

Stack:

1. **Neo4j AuraDB** — persistent discourse / argument graph (source of truth for graph structure).
2. **Python `graph-worker`** — deterministic segmentation + structured LLM utterance extraction + Cypher writes (Phase 0).
3. **Doxa-owned later jobs** — proposition linking, ER quarantine, agree/oppose, controversy assembly (Phases 1–2).
4. **Supabase** — ingestion, job state, costs, users, and **projected** product rows (not a full graph mirror).

## Conceptual layers

| Layer | Contents | Mutability |
|-------|----------|------------|
| L0 Source | Publication, Document, MediaAsset, Segment | Immutable once written for a run |
| L1 Discourse | Utterance, Agent (speaker), ExtractionRun, Decision | Utterances append-only; reprocess replaces Document subgraph |
| L2 Canonical | Proposition, Entity, Event (Phase 1+) | Versioned; Decision-backed merges |
| L3 Argumentation | Argument, Viewpoint, Controversy (Phase 2+) | Derived; rebuildable |
| L4 Analytical | Assessment, MethodRun (Phase 3+) | Explicitly derived; never rewrite L0–L1 |
| L5 Ops | Jobs, costs (Postgres) | Operational |

Lower layers never depend on upper layers. Embeddings generate **candidates only** — they never silently merge meanings.

## Scope boundaries

### Preserve

- Story ingestion (NewsAPI, relevance, scrape worker, receive, clean)
- Auth, admin shell, design system, unrelated agent infrastructure
- Postgres `stories`, `story_bodies`, `sources`, `graph_processing_jobs`

### Replace

- Chunk claims extract / validate / refine / approve
- Story claims merge / merge QA
- Multi-atom extract, positions lane, legacy merge/canonical/topology paths
- Assertion-centric SimpleKGPipeline as the write-path authority
- Human review as a required processing stage

### Deferred

- Proposition / `EXPRESSES` / ER quarantine (Phase 1)
- Argument / Viewpoint / Controversy (Phase 2)
- Assessments, EvidenceCheck, temporal position tracks (Phase 3)
- Deletion of obsolete handlers/tables (after Phase 2 product path)

## Data flow (Phase 0)

```text
Ingest → relevance → scrape → receive → clean (content_clean)
  → graph_processing_jobs (pending)
  → Python graph-worker
       → deterministic Segments
       → LLM Utterance JSON extract
       → span / enum validation
       → Cypher write Document / Segment / Utterance / Agent / …
  → Neo4j AuraDB
  → [Phase 1+] proposition + debate jobs → projections → UI
```

Normal path requires **no human review**. Exceptions: poison jobs, failed span/attribution provenance (`quarantined`).

## Store responsibilities

| Store | Owns |
|-------|------|
| **Supabase** | `stories`, `story_bodies`, sources, users, `graph_processing_jobs` / attempts, token/cost metadata, later projected controversy cards |
| **Neo4j AuraDB** | Discourse graph SoT (Document, Segment, Utterance, …) |
| **Vercel / Next.js** | Admin + product UI; server-side Neo4j reads only (never Aura creds in browser) |
| **Python worker** | Claim jobs, segment, extract utterances, validate, write Aura, update job status |
| **Cloudflare Worker** | Scrape only (unchanged) |

**Do not** mirror the entire Neo4j graph into Postgres.

## Phase 0 graph schema

### Node labels

| Label | Role | Key identity |
|-------|------|----------------|
| `Publication` | Outlet | `uid` (= `sources.id` when present) |
| `Document` | Article unit | `uid` (= Supabase `stories.story_id`) |
| `MediaAsset` | Thin text fingerprint | `uid` = `{documentUid}:asset:article_text` |
| `Segment` | Passage with absolute offsets | `uid` = `{documentUid}:seg:{ord}` |
| `Agent` | Speaker | `uid` = `{documentUid}:agent:{normalizedName}` |
| `Utterance` | Immutable speech act | `uid` stable per document+span |
| `ExtractionRun` | Model / schema / extractor versions | `uid` per job run |
| `Decision` | Accept / quarantine provenance | `uid` per decision |

### Relationship types (Phase 0)

`PUBLISHED_BY`, `HAS_ASSET`, `CONTAINS`, `GROUNDED_IN`, `ASSERTED_BY`, `PRODUCED_BY`, `DECIDED_BY`

### Utterance required properties

- `text`, `speechAct`, `attributionMode`, `polarity`, `modality`, `confidence`, `explicit`
- `documentUid`, `schemaVersion`, `extractorVersion`, `model`
- Controlled vocabularies:
  - `speechAct`: `assertion | allegation | prediction | prescription | judgment | definition | question | concession | other`
  - `attributionMode`: `direct_quote | paraphrase | journalist_voice | reported_speech`
  - `polarity`: `affirms | negates | questions`

### Versions

- `GRAPH_SCHEMA_VERSION` = `2.0.0`
- `EXTRACTOR_VERSION` = `2.0.0-utterance`

Keep Python [`services/graph-worker/app/config.py`](../../../services/graph-worker/app/config.py) and TypeScript [`doxa-agents/lib/graph-jobs.ts`](../../lib/graph-jobs.ts) in sync.

### Constraints / indexes

See [`services/graph-worker/neo4j/init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher). Re-run on Aura after schema changes (user-owned).

## Provenance rules

Every Utterance must retain enough to determine:

- Originating Document and Publication
- Supporting Segment with character offsets (`GROUNDED_IN`)
- Attributed Agent when not pure `journalist_voice`
- Explicit vs inferred (`explicit`)
- Model, extractor version, schema version, confidence
- ExtractionRun and Decision records

Utterances are durable within a Document subgraph. Reprocess **deletes** the Document-rooted Phase 0 subgraph then rebuilds (idempotent v1). Newer contradictory discourse **must not** silently overwrite within a run.

## Dual-runtime conventions

- TypeScript: Edge Functions, Next.js, Cloudflare scrape worker, job enqueue, later debate jobs
- Python: [`services/graph-worker/`](../../../services/graph-worker/) only — thin, no UI
- Job claim: `graph_processing_jobs`

### Enqueue rules (after `content_clean`)

1. If a job for `story_id` is `running`, skip enqueue (manual reprocess later).
2. Else cancel other `pending` jobs for that story, insert a new `pending` job, set `stories.graph_status = 'pending'`.

### Idempotent reprocess (Phase 0)

Delete Neo4j subgraph for `Document {uid: story_id}` (Segments, Utterances, document-scoped Agents/MediaAsset/ExtractionRun/Decision), detach `PUBLISHED_BY` without deleting shared Publication nodes, then rebuild. Also clear legacy `Story`/`Assertion`/`Chunk` subgraphs for the same `story_id` during transition.

## Controversy contract (target — Phase 2+)

The graph must eventually support:

- Attributed utterances / propositions about shared entities/topics
- Candidate agree / oppose / qualify pairs with Decision provenance
- Multi-sided controversy clusters with evidence paths back to Segments

Debate classification is **Doxa-owned**, not assumed from generic GraphRAG output.

## Deletion rules (later cleanup)

When the Neo4j path through Phase 2 is validated:

- Delete claims extract/QA/merge agents under `02-chunking-engine` / `03-merging-engine`
- Delete `departments/legacy/` extraction/merge/canonical/topology once replaced
- Drop unused `story_*` atom tables and old SQL topology tables
- Remove obsolete UI, stubs, docs
- Preserve `stories`, `story_bodies`, `sources`, auth, ops tables, `graph_processing_*`

## Primary risks

| Risk | Mitigation |
|------|------------|
| Collapsing utterance and meaning | Phase 0 writes Utterance only; Proposition is Phase 1 |
| Silent embedding merges | Candidates only; Decision-backed links later |
| Span / attribution errors | Validate before write; quarantine on failure |
| Dual-store delete/reprocess drift | Document-rooted subgraph delete + job state machine |
| Python ops burden | Keep worker thin; no product UI in Python |

## Related

- Next phases: [neo4j-overhaul-next.md](neo4j-overhaul-next.md)
- Phase 0 checklist: [phase0-validation.md](phase0-validation.md)
- Worker: [`services/graph-worker/README.md`](../../../services/graph-worker/README.md)
- Ingestion: [AGENTS.md](../../AGENTS.md)
