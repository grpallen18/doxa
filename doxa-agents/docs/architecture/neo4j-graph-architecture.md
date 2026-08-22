# Neo4j graph architecture (steering document)

**Status:** L3 Question-first overhaul complete (Session 5, 2026-08-22); Phase 3 L4 Analytical live  
**Next:** Organic debate growth via cron; optional NLI veto channel — see [neo4j-overhaul-next.md](neo4j-overhaul-next.md)  
**Validation:** [phase0-validation.md](phase0-validation.md) · [phase1-validation.md](phase1-validation.md) · [phase2-validation.md](phase2-validation.md) · [phase3-validation.md](phase3-validation.md) · [cross-story-neo-validation.md](cross-story-neo-validation.md)

This is the authoritative architecture document for the Neo4j discourse graph. Implementation work should reference this file. Do not maintain contradictory pipeline descriptions elsewhere.

## Purpose

Doxa's product center of gravity is **controversy topology** (agreement / opposition / multi-sided debate). That product requires a **provenance-rich knowledge graph** as substrate.

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
| L3 Argumentation | Question, Argument, Viewpoint, Controversy (overlay), Dispute | Derived; Question identity; Controversy qualifies from ANSWERS; Viewpoints cluster inside `(Question, polarity)`; Arena (`Issue`) retired |
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

- Deletion of obsolete handlers/tables (after Phase 2 product path)

### Phase 3 — L4 Analytical (implemented as Edge `analysis_pipeline`)

Lower layers never depend on L4. Assessments and EvidenceChecks are **rebuildable**, Decision + MethodRun backed, and must never be presented as extracted facts in UI.

#### Node labels

| Label | Role | Key identity |
|-------|------|----------------|
| `MethodRun` | Versioned method/model/prompt bundle | `uid` = `mrun:{methodId}:{iso}` |
| `EvidenceCheck` | Analytical support verdict for a Proposition | `uid` = `echeck:{propositionUid}:{segmentUid}` |
| `Citation` | Explicit source pointer (Segment/Document) — not a verdict | `uid` = `cite:{propositionUid}:{segmentUid}` |
| `Assessment` | Model judgment on Controversy / Viewpoint / Proposition | `uid` = `assess:{targetKind}:{targetUid}:{methodRunUid}` |

#### Relationship types

| Type | From → To | Notes |
|------|-----------|--------|
| `PRODUCED_BY` | EvidenceCheck / Assessment → MethodRun | Provenance |
| `CHECKS` | EvidenceCheck → Proposition | Verdict target |
| `GROUNDED_IN` | EvidenceCheck / Citation → Segment | Text span |
| `CITES` | Citation → Segment (or Document) | Source pointer only |
| `ABOUT` | Assessment / Decision → Controversy\|Viewpoint\|Proposition | Target |
| `HELD_BY` | Agent → Proposition | Temporal: `validFrom`, `validTo`, `decisionUid` |
| `DERIVED_FROM` | MediaAsset (clip) → MediaAsset (parent) | Multimodal excerpt |

#### EvidenceCheck properties

- `verdict`: `supported | weak | unsupported | not_applicable`
- `confidence` (0–1), `rationale`, `schemaVersion`, `propositionUid`, `segmentUid`
- Decision: `decisionType: 'evidence_check'`, status `accepted` \| `quarantined`

#### Citation properties

- `surfaceForm`, `documentUid`, `segmentUid` — never carries a support verdict

#### Assessment properties

- `kind`: `framing | strength | coherence | other`
- `summary`, `confidence`, `targetKind`, `targetUid`, `schemaVersion`
- UI must label **Analyzed** (not extracted)

#### HELD_BY

- Closes prior open interval when a new contradicting hold is written for the same Agent+Proposition
- `validFrom` / `validTo` (null `validTo` = current)

### Implemented (Admin Neo)

- **Story Neo** — `/admin/neo/[storyId]` document-scoped discourse explorer (Agents, office + person Entities via `MENTIONS`/`REFERRED_AS`, provenance + reprocess). Filter kinds/edges in the canvas.
- **Story union** — `/admin/neo/union` auto-loads all succeeded story graphs in one Sigma view (dev; capped; shared Publication/Entity nodes collapse)
- **Cross-story Neo hubs** — `/admin/neo/hub/{controversy|question|proposition|entity}/[uid]` Sigma explorer centered on shared L2/L3 nodes (not a corpus dump). Entry: Graph controversies detail → **Open in Neo** / **Open Question in Neo**. Validation: [cross-story-neo-validation.md](cross-story-neo-validation.md)

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

## L3 debate contract (Question-first — Session 5)

Debate **identity** lives on `:Question` nodes; `:Controversy` is a **qualified overlay** for policy/factual/causal exclusive splits. Definitional Questions surface `:Dispute` nodes instead of qualifying Controversies.

| Axis | Unit | Role |
|------|------|------|
| **Debate identity** | `:Question` (`uid` `cq:…`) | Stable contested question; registry + mint path via `retrieve_or_mint_questions` |
| **Answer membership** | `(Proposition)-[:ANSWERS]->(Question)` | LLM-assigned theses/antitheses with confidence + polarity |
| **Controversy overlay** | `:Controversy {status:'established'}` | `(c)-[:ABOUT]->(q)` when ≥2 opposing accepted answers (non-definitional); uid `ctr_…` |
| **Viewpoint clusters** | `:Viewpoint` inside `(Question, polarity)` | Union-find on propositions that share Question + polarity; `(c)-[:INCLUDES]->(v)-[:ADVANCES]->(p)` |
| **Definitional conflict** | `:Dispute` | `(d)-[:SURFACES_IN]->(q)` + `(d)-[:CONCERNS]->(p)` when ≥2 theses on definitional Questions |
| **Browse indexes** | Person, Topic (`SUBJECT_OF`) | Facets into Questions — never the controversy uid |

Active pipeline (`debate_pipeline`, hourly cron):

```text
retrieve_or_mint_questions → assign_question_answers → qualify_controversies
  → build_viewpoints → detect_disputes → project_debate_summaries
```

Key invariants:

- **No global `RELATES_TO` writer** — pair-first classify step removed; optional intra-Question LLM pair pass lives in `detect_disputes` only.
- **Arena (`Issue`) retired** — no `IN_ISSUE`, no dirty Arena rebuild; hygiene fails on leftover `arena:` / `issue:` Issues.
- **Stable opaque L3 ids** — `vp_…` / `ctr_…` / dispute uids from pair hash; membership is mutable edges.
- **Projection scope** — Postgres `graph_controversies` / reconcile match `Controversy {status:'established'}` only.
- **L4 assessments** — title from `(c)-[:ABOUT]->(q).question`; sides from distinct Viewpoints in `INCLUDES`.
- **Time chapters** — deferred post-overhaul; organic growth via cron is the default path.

Debate classification is **Doxa-owned**, not assumed from generic GraphRAG output.

Validation: [scalable-controversy-validation.md](scalable-controversy-validation.md) · gold fixtures in `docs/gold/`

### Follow-ons

- Optional NLI veto channel on ANSWERS assignments
- Time-chapter forks when Jaccard + evidence-gap rules are reintroduced
- Relevance decay lives on `graph_controversies.ranking_score` (projected)

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
- Scalable controversies: [scalable-controversy-validation.md](scalable-controversy-validation.md)
- Phase 0 checklist: [phase0-validation.md](phase0-validation.md)
- Worker: [`services/graph-worker/README.md`](../../../services/graph-worker/README.md)
- Ingestion: [AGENTS.md](../../AGENTS.md)
