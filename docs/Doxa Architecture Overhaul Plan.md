# Doxa L3 Overhaul Plan

**Status:** Authorized for implementation in a no-user / easy-wipe environment.  
**Steering:** this file. Design history: [Proposal 2](Doxa%20Architecture%20Proposal%202.md), [Rebuttal 2](Doxa%20Architecture%20Rebuttal%202.md).  
**Substrate (do not rebuild):** [neo4j-graph-architecture.md](../doxa-agents/docs/architecture/neo4j-graph-architecture.md) L0–L2.

This is a **truncate-and-replace of the analytical layer**, not a migration of existing Viewpoints and Controversies. Keep ingested atoms. Delete extrapolations. Rebuild with Question-first construction. No A/B, no dual-running ontologies, no scoring of the old clusters.

---

## Locked decisions

```text
L0–L2 atoms stay
        ↓
speechAct + HAS_ROLE routing (no new extractor)
        ↓
retrieve top-k frozen Questions
        ↓
duplicate-question adjudication
        ↓
mint a Question only on a true miss
        ↓
CQ-conditioned stance / answer assignment
        ↓
structural incompatibility (exclusivity lives on the Question)
        ↓
Controversy = overlay on a Question
        ↓
ArgSum / KPA family inside (Question, polarity or Position)
        ↓
Viewpoints
        ↓
L4 / GDS later
```

| Rule | Meaning |
|---|---|
| Atoms are source of truth | Document, Segment, Utterance, Agent, Publication, Proposition, Entity, Event, Argument, `HAS_ROLE`, Decision, ExtractionRun |
| Extrapolations are disposable | Viewpoint, Controversy, Dispute, Arena (`:Issue` with `arena:` uids), `IN_ISSUE`, `RELATES_TO`, `SUBJECT_OF`, pair-candidate Decisions, Supabase `graph_controversies` / `graph_viewpoints` / evidence / subjects / controversy Assessments |
| Identity is a Question | New `:Question` node. Never reuse `:Issue` (that label is Arena). |
| Position is an abstraction | Polarity on the assignment edge for policy/factual CQs. Materialize `:Position` only for causal/attribution CQs where polarity would lie. |
| Controversy is a state | Overlay on a Question after structural incompatibility. Not a caption glued onto an oppose-cluster. |
| Viewpoint is a recurring reason | ArgSum/KPA inside `(Question, polarity)` or `(Question, Position)`. Not agree-union-find. |
| Pairwise / NLI is a veto | `FAVOR` vs `AGAINST` on the same policy CQ is enough to *candidate* a Controversy. `RELATES_TO` and NLI corroborate or veto. They do not mint identity. |
| Arena is optional ops | Do not rebuild Arenas in v1. The registry is small; assign theses directly to Questions. |
| Tools are baselines | QQP-style duplicate-question models and published ArgSum matchers are starting points. Doxa’s gold worksheet decides. |
| Gold worksheet is of atoms | Label real propositions. Do not grade the old Controversies you are about to delete. |

---

## Keep vs wipe

### Keep (Neo4j)

- `Publication`, `Document`, `MediaAsset`, `Segment`
- `Utterance`, `Agent`, `ExtractionRun`
- `Proposition`, `EXPRESSES`, `VARIANT_OF` (claim identity only)
- `Entity`, `Event`, mention/ER edges
- `Argument`, `HAS_ROLE`
- Decisions for `proposition_link`, `argument_role`, entity ER
- L4 that does **not** hang on Controversy: EvidenceCheck, Citation, HELD_BY, MethodRun for those

### Wipe (Neo4j)

- `:Viewpoint`, `:Controversy`, `:Dispute`
- `:Issue` Arena nodes and `(Proposition)-[:IN_ISSUE]->`
- `RELATES_TO` and `proposition_pair_candidate` Decisions
- `SUBJECT_OF`
- Assessments `ABOUT` Controversy/Viewpoint
- Any `controversy_title` Decisions

### Wipe (Postgres)

Truncate (existing purge already lists most of these):

- `graph_viewpoints`
- `graph_controversies`
- `graph_controversy_evidence`
- `graph_controversy_subjects`
- `graph_topic_links` (rebuilt from new CQs)
- `graph_assessments` (controversy-targeted; EvidenceCheck projections can stay if they key off propositions)

Do **not** truncate `stories`, `story_bodies`, `sources`, `graph_processing_jobs` unless you also want to re-ingest. You do not.

### Keep (code you will rewrite, not delete)

Graph-worker L0–L2. Explore/Admin UI shells. `debate_pipeline` as the orchestrator name. Projection tables (same names, new semantics: a Controversy row is now a qualified Question).

---

## Target graph (v1)

```text
(:Question {
  uid,                  // cq:{hash of canonical question text}
  question,             // natural-language interrogative
  questionType,         // policy | factual | causal | definitional
  answerExclusivity,    // exclusive | compatible | unknown
  status,               // developing | established
  confidence,
  embedding,
  schemaVersion
})

(:Controversy {         // overlay; only when established
  uid,                  // ctr_…
  question,             // copy of Question.question for projection convenience
  status,               // established
  confidence
})

(:Viewpoint {
  uid,                  // vp_…
  keyPoint,
  summary,
  polarity,             // FAVOR | AGAINST | QUALIFY | none for causal
  salience,
  confidence
})
```

Relationships:

```text
(:Proposition)-[:ANSWERS {
    polarity,           // FAVOR | AGAINST | QUALIFY | AFFIRMS | DENIES | UNCERTAIN | NONE
    debateRole,         // thesis | premise | background
    confidence,
    decisionUid
}]->(:Question)

(:Proposition)-[:SUPPORTS_VIEWPOINT]->(:Viewpoint)

(:Viewpoint)-[:ANSWERS]->(:Question)          // optional polarity on the edge if not on the node
(:Controversy)-[:ABOUT]->(:Question)
(:Controversy)-[:INCLUDES]->(:Viewpoint)      // keep this name so projections/UI change less

(:Dispute)-[:CONCERNS]->(:Proposition)
(:Dispute)-[:SURFACES_IN]->(:Question)

(:Entity)-[:SUBJECT_OF]->(:Question)          // browse; not identity
```

`:Position` is **not** in v1 unless Phase 3 gold cases require it. Until then, polarity *is* the position.

`definitional` Questions do not become Controversies. They feed `Dispute`.

---

## Phase 0 — Contract, gold worksheet, wipe

**Status (Session 1 complete, 2026-08-21):** Debate crons unscheduled; Neo L3 wiped (Viewpoints/Controversies/Disputes/Arenas/`RELATES_TO` = 0; atoms preserved); Postgres `graph_controversies` / `graph_viewpoints` / related projections truncated; gold at [docs/gold/](gold/) (300 propositions + 10 question pairs). Labels approved for Session 2.

**Goal:** freeze the contract in the repo, label a small set of real atoms, delete L3 so nothing old can leak into the new path.

### 0.1 Gold worksheet (required, small)

Pull thesis-like propositions from Aura (speechAct in `prescription, judgment, allegation, prediction` plus `HAS_ROLE` in `conclusion, objection, rebuttal, prediction`). Export ~150–300 rows.

Label in a sheet or `docs/gold/cq-worksheet.csv`:

| Column | Values |
|---|---|
| `proposition_uid` | existing uid |
| `text` | as stored |
| `debate_role` | thesis / premise / background |
| `question` | the interrogative this answers, or `none` |
| `question_type` | policy / factual / causal / definitional |
| `exclusivity` | exclusive / compatible / unknown |
| `polarity` | FAVOR / AGAINST / QUALIFY / AFFIRMS / DENIES / UNCERTAIN / NONE |
| `key_point` | short reason, or blank if premise-only |
| `notes` | near-miss pointers |

Add a second sheet of **question pairs**:

| `question_a` | `question_b` | `label` |
|---|---|---|
| … | … | `same` / `adjacent` / `unrelated` |

Include on purpose: Ukraine-aid vs NATO-admission; inflation stimulus vs supply-chain (compatible); “primary cause” vs “contributing factor”; two AGAINST-aid reasons; a spending fact that is not a side; a talking-past pair.

This is the test of the **new** method. It is not a score of the old Controversies.

Seed the live Question registry from the **canonical questions in this worksheet**, not from `name_controversies` captions.

### 0.2 Wipe script (run once)

Neo4j (Aura). Review, then run:

```cypher
// L3 analytical nodes and their incident edges
MATCH (n)
WHERE n:Viewpoint OR n:Controversy OR n:Dispute
   OR (n:Issue AND n.uid STARTS WITH 'arena:')
   OR (n:Issue AND n.uid STARTS WITH 'issue:')
DETACH DELETE n;

MATCH ()-[r:RELATES_TO]->()
DELETE r;

MATCH ()-[r:IN_ISSUE]->()
DELETE r;

MATCH ()-[r:SUBJECT_OF]->()
DELETE r;

MATCH (d:Decision)
WHERE d.decisionType IN [
  'proposition_pair_candidate',
  'controversy_title',
  'dispute'
]
DETACH DELETE d;

MATCH (a:Assessment)
WHERE a.targetKind IN ['controversy', 'viewpoint']
DETACH DELETE a;
```

Postgres: `TRUNCATE graph_viewpoints, graph_controversy_evidence, graph_controversy_subjects, graph_topic_links, graph_controversies RESTART IDENTITY CASCADE;`  
Also truncate controversy-keyed `graph_assessments` if present.

Explore/Admin will show empty debates until Phase 3 projects again. That is expected.

### 0.3 Stop the old cron

Disable or no-op `debate_pipeline` until Phase 1 handlers exist. Leaving hourly assembly on will recreate Arenas and oppose-clusters on the atoms you just cleaned.

**Exit:** worksheet started (does not need to be finished to begin Phase 1, but the near-miss pair sheet must exist before trusting retrieve/mint). Aura L3 empty. Cron stopped.

**Session 1 ops notes**
- Wipe Edge function: `wipe_l3_analytical` (`POST` `{ "confirm": "WIPE_L3" }`, JWT-off).
- Re-export gold: `npx tsx scripts/export-cq-gold.ts` (overwrites unlabeled CSVs — copy labeled files aside first).
- Soft-disable escape hatch: `POST debate_pipeline` `{ "force_legacy": true, ... }` only if you intentionally need the old path.

---

## Phase 1 — Route theses, retrieve or mint Questions

**Status (Session 2, 2026-08-21):** `:Question` schema + gold seed; `debate-role` helper; Edge `retrieve_or_mint_questions` + `assign_question_answers`; `debate_pipeline` defaults to those two steps (`force_legacy` keeps old chain). Cron still off. Eval: `scripts/eval-question-gold.ts`.

**Goal:** every thesis-like proposition is attached to a frozen Question, or quarantined. No Viewpoints. No Controversies.

### 1.1 Cheap debate-role routing

New helper (not a new LLM job): `doxa-agents/lib/debate/debate-role.ts`.

- **Thesis:** `speechAct ∈ {prescription, judgment, allegation, prediction}` or `HAS_ROLE ∈ {conclusion, objection, rebuttal, prediction}`
- **Premise:** `speechAct = assertion` or `HAS_ROLE ∈ {premise, qualifier, assumption}`
- **Background:** no role and weak speechAct
- **Not a Controversy side:** `definition` → Dispute path; `question` → candidate CQ *text* only; `concession` keeps original Agent, do not treat as the speaker’s thesis without care

Write `debateRole` on the future `ANSWERS` edge (Phase 1.3). Do not invent a new node.

### 1.2 Question registry

- Constraint: `CREATE CONSTRAINT question_uid IF NOT EXISTS FOR (q:Question) REQUIRE q.uid IS UNIQUE;`
- Vector index on `Question.embedding` (candidates only, same rule as propositions)
- Seed from the gold worksheet’s canonical questions

### 1.3 New handlers (replace pair-first assembly)

| New step | Deploy | Job |
|---|---|---|
| `retrieve-or-mint-questions` | `retrieve_or_mint_questions` | For each thesis: embed a generated candidate interrogative; retrieve top-k Questions; cross-encode / LLM adjudicate `same \| adjacent \| unrelated`; on `same`, attach; on miss, mint; on `adjacent`, **do not merge** (quarantine Decision) |
| `assign-question-answers` | `assign_question_answers` | For attached theses (and later premises): `relevant?` then polarity toward that Question. Decision-backed `ANSWERS` |

Mint prompt (single thesis, not a cluster of sides): one specific interrogative people actually argue; forbid entity labels (“Ukraine”); set `questionType` + `answerExclusivity` (`What was the primary cause?` → exclusive; `What factors contributed?` → compatible).

Duplicate-question baseline: a QQP-trained bi-encoder + cross-encoder shortlist. Quarantine the near-miss band. Measure against the gold pair sheet before loosening thresholds.

### 1.4 Orchestrator (v1)

`debate_pipeline` becomes:

```text
retrieve_or_mint_questions
assign_question_answers
```

Do **not** call `generate_proposition_pair_candidates`, `classify_proposition_relationships`, `build_viewpoints`, `build_controversies`, `name_controversies` in this phase. Leave the files on disk until Phase 4 deletes or rewrites them.

**Exit:** gold theses land on the right Questions; adjacent pairs stay apart; mint count is small relative to retrieve hits. Spot-check 20 random attachments in Admin Neo.

---

## Phase 2 — Structural incompatibility → Controversy overlay

**Status (Session 3, 2026-08-22):** `qualify-controversy.ts` helper; Edge `qualify_controversies`; `debate_pipeline` adds third step. Controversy overlays in Neo only (no Postgres projection yet — Session 4). Cron still off. Eval: `scripts/eval-controversy-gold.ts`.

**Goal:** a Question becomes a Controversy when the *answers* cannot coexist, not when a pairwise `oppose` edge exists.

### 2.1 Qualification rule

**Policy / factual (exclusive CQs):**

```text
same Question
+ at least one high-confidence FAVOR (or AFFIRMS)
+ at least one high-confidence AGAINST (or DENIES)
+ neither assignment is NONE / background
+ no veto (talking_past, orthogonal, or NLI entailment that says they are the same claim)
→ MERGE Controversy ABOUT that Question, status=established
```

**Causal with `answerExclusivity=compatible`:** do **not** mint a Controversy just because two causes exist. Stay `developing` (Question only) unless two Positions are labeled exclusive in the worksheet/model (e.g. “stimulus was primary” vs “stimulus had no effect”).

**Causal with `answerExclusivity=exclusive`:** two different high-confidence answers → Controversy.

**Definitional:** Dispute, not Controversy.

Low-confidence assignments never establish a Controversy. That is how a retrieve miss would otherwise become a fake fight.

### 2.2 Optional veto channel (narrow)

Rewrite `classify_proposition_relationships` to run **only on thesis pairs that already share a Question**. Taxonomy stays. NLI (e.g. DeBERTa-v3 MNLI/FEVER/ANLI) as raise/veto:

- contradiction + same CQ → supports incompatibility
- entailment → veto (probably same claim / not a fight)
- neutral → ignore
- model/`RELATES_TO` `talking_past` or `orthogonal` → veto

Do not regenerate global knn/shared-entity pair candidates as disagreement. If you keep `generate_proposition_pair_candidates` at all, it is recall for “might be the same Question,” which Phase 1 already does via the registry.

### 2.3 Handler

| Step | Deploy | Job |
|---|---|---|
| `qualify-controversies` | `qualify_controversies` | Apply the rule; MERGE/DETACH Controversy overlays; copy question text onto the Controversy for old projection columns |

`name_controversies` is **deleted as a stage**. The Question already *is* the title.

**Exit:** gold exclusive policy CQs produce Controversies; compatible causal CQs do not; talking-past pairs do not.

---

## Phase 3 — Viewpoints via ArgSum / KPA

**Status (Session 4, 2026-08-22):** `viewpoint-cluster.ts` (LLM key-point baseline B); rewritten `build_viewpoints` on `(Question, polarity)` buckets; Question-first `project_debate_summaries` → `graph_*`; `debate_pipeline` five-step default. Fixture seed: `scripts/seed-controversy-fixtures.ts`. Eval: `scripts/eval-viewpoint-gold.ts`. Cron still off.

**Goal:** replace agree-clustering. Same polarity, different recurring reasons → different Viewpoints.

Run **inside** `(Question, polarity)` for policy, or inside a causal Question without forcing FAVOR/AGAINST.

### 3.1 Two baselines, one gold worksheet

- **A:** published ArgSum matcher (Bar-Haim / SMatchToPr / NL2G argsum-style: quality filter, match scorer, redundancy suppression). PageRank-on-match-graph is fine; Neo4j GDS is not required for v1 if the candidate set is small.
- **B:** LLM key-point generation + match, Decision-backed, unmatched material quarantined (no force-assign).

Score on the worksheet’s `key_point` column: coverage, purity, duplicate rate, forced-assignment rate. Pick one. Do not invent a third Doxa-only clustering method until both lose.

Attach local `HAS_ROLE=premise` propositions as `SUPPORTS_VIEWPOINT` evidence. Premises are not Viewpoint members.

### 3.2 Handler

Rewrite `build_viewpoints` in place (same deploy name is fine) to consume `ANSWERS` instead of Arena `agree` edges.

Stable `vp_` uids: Jaccard on member proposition ids is still useful so Admin URLs don’t churn during reruns.

### 3.3 Project and UI

Rewrite `project_debate_summaries` Cypher to:

```text
Question ← Controversy ← Viewpoints ← Propositions ← Utterances
```

Keep Postgres column names (`graph_controversies.question`, `sides_count`, …) so Explore (`/home`, `/c/{uid}`, topic hubs) and Admin graph-controversies keep working. `SUBJECT_OF` now points at **Question** (or Controversy overlay—pick one and stick to it; prefer Question).

Home/trending: `Controversy` rows only (`status=established`). Developing Questions can appear later in Admin; not on the consumer home feed.

**Exit:** Ukraine-style split (deterrence vs European burden vs domestic spending) shows as three Viewpoints under one AGAINST polarity. Clark-style facts sit on a Viewpoint as evidence, not as a side. Explore is populated again.

---

## Phase 4 — Disputes, L4 re-hang, delete dead path, hygiene

**Status (Session 5, 2026-08-22):** `detect-dispute.ts`; rewritten `detect_disputes` (`SURFACES_IN` → Question); six-step `debate_pipeline`; L4 `run_controversy_assessments` retargeted; graph hygiene Question-first; legacy pair/Arena handlers removed; debate cron re-enabled. Eval: `scripts/test-detect-dispute.ts`, `scripts/seed-dispute-fixtures.ts`.

- Rewrite `detect_disputes` to `SURFACES_IN` Question.
- Point `run_controversy_assessments` at Controversy overlays (or Questions). EvidenceCheck stays on Propositions (unchanged).
- Hygiene: `prune_orphans`, `graph_integrity_audit`, `projection_reconcile` must know `:Question` and must not treat leftover `arena:` Issues as healthy.
- Delete or archive unused steps: old pair-first candidate generation if unused; `name_controversies`; Arena assign (`arena-assign.ts`) if nothing calls it.
- Update [neo4j-graph-architecture.md](../doxa-agents/docs/architecture/neo4j-graph-architecture.md) L3 section: Question identity, Arena deferred, Controversy overlay, ArgSum Viewpoints.
- Constraints: add `question_uid`; keep `issue_uid` only if you still have leftover Issue nodes (you should not).
- `npm run agents:refresh` after handler/stub/README changes. Do not hand-edit `manifest.yaml`.

**Exit:** librarian validate passes; Admin Neo can open a Question hub; integrity audit is green on a fixture story.

---

## Explicitly out of scope (do not do in this overhaul)

- Re-extracting utterances/propositions/arguments
- StanceMining, oAMF, PAKT, Dung/PyArg, GraphRAG as writers
- QBAF / GDS ideology projections
- Frames / values as membership
- Nine question types
- Always-on `:Position` nodes
- Issue–Issue `BROADER_THAN` graphs
- Time-chapter fork logic until Questions are stable (revisit if a CQ’s membership shifts across 90 days)
- Dual-running old and new L3
- Re-ingesting all stories

---

## Suggested implementation order for Cursor

Do these as separate sessions. Each session should leave the pipeline runnable.

1. **Wipe + stop cron + gold export** (Phase 0). No new ontology yet.
2. **Question schema + retrieve-or-mint + assign** (Phase 1). Orchestrator only those two steps. Seed registry from worksheet.
3. **Qualify controversies** (Phase 2). Optional intra-CQ NLI veto.
4. **ArgSum viewpoints + project_debate_summaries + UI smoke** (Phase 3).
5. **Disputes, assessments, hygiene, dead-code removal, steering-doc update** (Phase 4).

Session 2 is the architectural gate: *can Doxa identify the question before it identifies the fight?* If retrieve/mint over-merges adjacent gold pairs, stop and fix that before building Controversies on top.

---

## Handler fate (summary)

| Current | Fate |
|---|---|
| graph-worker L0–L2 + `HAS_ROLE` | Keep |
| `generate_proposition_pair_candidates` | Remove from orchestrator. Delete after Phase 4 if unused. |
| `classify_proposition_relationships` | Rewrite as intra-Question veto, or delete if qualification does not need it |
| `build_viewpoints` | Rewrite as ArgSum inside `(Question, polarity)` |
| `build_controversies` | Replace with `qualify_controversies` |
| `name_controversies` | Delete |
| `detect_disputes` | Rewrite onto Question |
| `project_debate_summaries` | Rewrite Cypher; keep table names |
| `debate_pipeline` | New step list |
| Arena / `IN_ISSUE` | Do not rebuild in v1 |
| `analysis_pipeline` | Keep; retarget assessments in Phase 4 |
| EvidenceCheck / Citation / HELD_BY | Keep |

New: `retrieve_or_mint_questions`, `assign_question_answers`, `qualify_controversies` (unless `build_controversies` is rewritten in place).

---

## User-owned ops

After each phase that touches handlers or constraints:

1. Re-run `services/graph-worker/neo4j/init_constraints.cypher` on Aura (and the new Question constraint).
2. Apply any new Supabase migrations.
3. Deploy JWT-off functions. New and rewritten debate steps use the service-role orchestrator:

```bash
supabase functions deploy retrieve_or_mint_questions --no-verify-jwt
supabase functions deploy assign_question_answers --no-verify-jwt
supabase functions deploy qualify_controversies --no-verify-jwt
supabase functions deploy build_viewpoints --no-verify-jwt
supabase functions deploy detect_disputes --no-verify-jwt
supabase functions deploy project_debate_summaries --no-verify-jwt
supabase functions deploy debate_pipeline --no-verify-jwt
```

Mirror `verify_jwt = false` in `supabase/config.toml` for each new name.

4. Do not add steps to `activation.yaml` until you want them in the admin runnable catalog.
5. Isolated re-runs: extend [pipeline-test-params.md](../doxa-agents/docs/pipeline-test-params.md) with `proposition_uid` / `question_uid` when those handlers land.

---

## Done when

1. Old Viewpoint / Controversy / Arena / `RELATES_TO` data is gone and cannot come back via cron.
2. Questions exist before fights. Adjacent gold question pairs stay distinct.
3. Policy FAVOR vs AGAINST on the same Question produces a Controversy without needing a global oppose edge.
4. Compatible causal answers do not produce a Controversy.
5. Viewpoints split reasons inside a polarity, and facts are evidence.
6. Explore and Admin show the new objects through the existing projection tables.
7. L0–L2 atom counts are unchanged by the wipe.

The first engineering question is still the only one that matters: **can Doxa reliably identify the question before it identifies the fight?** Everything after that is filling. If that fails, stop; deeper layers will only make confident garbage.
