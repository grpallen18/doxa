# Doxa Architecture Rebuttal 2

This document answers [Doxa Architecture Proposal 2.md](Doxa%20Architecture%20Proposal%202.md). It is not a review of [Doxa Architecture Proposal.md](Doxa%20Architecture%20Proposal.md) or [Doxa Architecture Rebuttal.md](Doxa%20Architecture%20Rebuttal.md). Round 1 already killed StanceMining / oAMF / PAKT / Dung as the write path. Proposal 2 absorbed that. The job now is to falsify what remains.

**Verdict:** the diagnosis and construction order are first-class. The remaining stack is not. Proposal 2 still asks Doxa to own four product entities, nine question types, a new compatibility taxonomy, generate-from-every-thesis Issue minting, and a homegrown “KPA-style” pipeline — all of which lose to smaller, already-proven fillings of the same shape.

The live bug is still **construction order**. The new way to recreate it is **Issue explosion + embedding reconciliation**.

---

## What Proposal 2 got right

Keep these without re-arguing them:

- Relatedness proposes; it does not decide conflict.
- The question must exist before the fight.
- Issue ≠ Controversy. An unanswered or one-sided question is allowed.
- Difference ≠ incompatibility. Causal explanations can coexist.
- A factual premise is not a debate side. Clark’s spending line stays available.
- Viewpoints are recurring reasons, not agree-clusters.
- Formal extensions, GraphRAG communities, and open stance targets must not mint product identity.
- Gold evaluation before architectural commitment.
- Shadow the new path; retire the old one only when it wins.

Those invariants are the architecture. Most of the rest is ceremony around them.

---

## What the repo actually is

Proposal 2’s mapping table is conceptually right and mechanically wrong until this collision is named.

### The `:Issue` label is already burned

`doxa-agents/lib/debate/issue-assignment.ts` is explicit: the Neo4j label `Issue` is an **Arena** — a size-capped dirty-rebuild bucket with uid `arena:{hash}`, `MAX_ARENA_PROPS = 48`, and `IN_ISSUE` membership. It is assembly scope, not a contested question.

Current L3 identity is:

| Concept in docs | Graph object | Reality |
|---|---|---|
| Arena | `(:Issue {uid: 'arena:…'})` | Ops bucket. Merged from accepted `RELATES_TO` pairs. |
| Contested question | `Controversy.question` | Written **after** clustering by `name_controversies`. |
| Viewpoint | agree-union-find inside an Arena | Shared `agree` edges, not shared reasons. |
| Controversy | oppose-union-find over Viewpoints | `oppose` is identity, then the question is captioned. |
| Dispute | `definitional_conflict` / `talking_past` / `assumption_conflict` | Already separated from controversy. |

`name_controversies` cannot create a question before qualification. It requires a Controversy with ≥2 viewpoint sides, then asks gpt-4o-mini for a CQ. `Controversy.question` therefore cannot currently exist as a developing Issue.

Pair generation is still relatedness: shared Entity (blocking recall) + knn at `min_similarity` 0.72. Classification is still a small LLM with no NLI channel. `assignArenaForPair` then puts any accepted pair in the same Arena. Union-find amplifies that.

Phase 2.4 already decided: **identity is a contested question, Arena is assembly, Entity is browse/blocking**. Proposal 2 rediscovers the identity rule, then proposes a new `:Issue` node on top of a label that already means something else.

### What is reliable enough to reuse

| Signal | Density | Trust for triage |
|---|---|---|
| `Utterance.speechAct` | Every utterance | **Primary.** Vocab: `assertion, allegation, prediction, prescription, judgment, definition, question, concession, other`. |
| `HAS_ROLE` | Sparse | **Bonus only.** Graph-worker extracts “1–4 arguments per document” and prefers under-merge. Most propositions have no role. |
| `Proposition` certainty / timeframe / scope | On extract | Useful for `VARIANT_OF`, not for question identity. |
| `VARIANT_OF` | Proposition ER | Auto-link ≥ 0.92; variant band 0.75–0.92 when scope/time/certainty differ. This is **claim** identity, not **question** identity. |
| `RELATES_TO` taxonomy | Pairwise | Already richer than binary NLI: `oppose, qualify, compatible, orthogonal, talking_past, definitional_conflict, assumption_conflict, …`. Demote `oppose` from identity to evidence; do not replace the taxonomy. |
| Arena dirty/rebuild, Jaccard `vp_`/`ctr_` uids, time chapters | Live | Keep as ops. Not ontology. |

`HAS_ROLE ∈ {conclusion, objection, rebuttal, prediction, value}` is not a complete thesis detector. News often has implicit conclusions, journalist ledes tagged `assertion`, and opponent views inside `concession`. A new debate-role LLM on top of this will mostly relabel `speechAct` at extra cost.

---

## Layer-by-layer: keep, replace, or drop

| Proposal 2 layer | Verdict | Replace with |
|---|---|---|
| L0–L2 Neo4j substrate | **Keep.** | Nothing. GraphRAG/HippoRAG still must not define identity. |
| Debate-role triage as a new model | **Guilty as a stage.** | Rules on `speechAct` + sparse `HAS_ROLE`. No extra LLM. |
| Candidate Issue generation from every thesis | **Guilty.** This is the new failure mode. | **Retrieve-then-assign** against a CQ registry (IBM Debater / Touché grain). Mint only on miss. |
| First-class `:Issue` node using the existing label | **Drop.** Label collision. | New `:Question` **or** `Controversy` with an early lifecycle. Never reuse Arena’s `Issue`. |
| Nine `question_type`s | **Overbuilt.** | Stasis: `fact \| definition \| quality \| policy`, plus `causal` if the corpus forces it. |
| Question-conditioned assignment | **Keep the idea.** | IBM claim-stance toward a frozen CQ. Retrieval first (Touché / args.me pattern), not all-pairs. |
| Universal `Position` node | **Guilty as always-on.** | Polarity for policy CQs. For causal CQs, ArgSum clusters *are* the answers. Mint Position only when polarity is insufficient. |
| New 10-way Position compatibility taxonomy | **Drop.** Duplicates `RELATES_TO`. | Same-CQ + existing kinds + NLI veto. |
| “KPA-style” custom pipeline | **Keep the task, drop the homegrown filling.** | Published ArgSum: Bar-Haim matching, SMatchToPr (ArgMining 2021 winner), NL2G/argsum (EMNLP 2025). |
| Controversy qualification | **Keep.** | Status on the CQ object, not a second identity node unless product UI needs it. |
| Frames / values / schemes | **Keep as L4, later.** | Existing `Assessment.kind: framing` + ValueEval models. |
| QBAF / weighted bipolar as a roadmap item | **Drop from the plan.** | GDS PageRank on bipolar SUPPORTS/ATTACKS. ArgRAG (2025) is an explainer for retrieval, not a controversy factory. |
| StanceMining, oAMF, GraphRAG | **Stay off the write path.** Unchanged from round 1. | Optional instruments after identity exists. |
| Gold set of 100–300 flat propositions | **Wrong shape.** | 20–40 Issues with near-miss pairs and role/position/reason labels. |
| Issue–Issue edges (`BROADER_THAN`, `TEMPORAL_VARIANT_OF`, …) | **Defer.** | Quarantine near-misses. Do not build an Issue graph in v1. |

Error still compounds. A generate → canonicalize → assign → position → compatibility → KPA chain at 0.75 F1 each is ~18% end-to-end. IBM Debater worked because a **topic was given or retrieved**, then high-precision claim/stance/quality/KPA ran against it. It never generated a question per claim and then merged the questions with generic embeddings.

---

## Where Proposal 2 recreates the same bug

### 1. Generate-from-every-thesis is open target mining with better copy

Proposal 2 correctly forbids StanceMining’s noun-phrase targets. It then generates an interrogative from every thesis candidate.

That produces thousands of paraphrases and near-misses:

```text
Should the U.S. continue military aid to Ukraine?
Should Washington keep sending weapons to Kyiv?
Should Europe spend more on defense?
Who should finance Ukraine’s reconstruction?
```

The reconciliation layer then compares them with embeddings, shared entities, predicate/action, and “LLM adjudication for ambiguous cases.” Shared entity is “never sufficient” on paper and dominant in practice — the same pattern that made `issue:ent:` mega-buckets. LLM merge of adjacent questions is how “Ukraine aid” and “NATO admission” become one Issue.

**Deliberatorium** (Klein, MIT) already learned this at IBIS scale: unmoderated issue proliferation makes the map unusable. Production systems **retrieve against a catalog** (debate motions, ProCon questions, IBM topics, Kialo theses) and mint conservatively.

The proven order is:

```text
thesis
    → retrieve top-k CQs from a registry (question-paraphrase / argument retrieval)
    → assign if a hit is actually the same question
    → mint a new CQ only on confident miss
    → freeze the CQ
    → stance / reasons toward that CQ
```

Not:

```text
thesis → generate question → embed → merge → hope
```

Candidate generation from theses can seed the registry when it is empty. It must not be the steady-state writer.

### 2. Generic embeddings are the wrong matcher for questions

Proposition ER uses cosine ≥ 0.92 to merge claims and 0.75–0.92 + scope diff for `VARIANT_OF`. That is the right tool for “is this the same assertion with different certainty/time/scope?”

It is the wrong tool for “is this the same contested question?”

Question identity is a **duplicate-question** problem. The proven filling is Quora Question Pairs / CQADupStack paraphrase models (e.g. `sentence-transformers` models trained on QQP), plus a cross-encoder on the shortlist, plus human/Decision quarantine in the near-miss band. PAWS exists specifically because lexical overlap fools bi-encoders — “Should the U.S. aid Ukraine?” vs “Should Ukraine aid the U.S.?”

Do not reuse `VARIANT_OF` semantics for Issues. Scope/time/certainty on a claim is not polarity-independent question identity. If two questions differ in timeframe (“2022 withdrawal” vs “any future intervention”), that is a **new CQ** or a quarantined near-miss, not a proposition-style variant edge.

### 3. Universal Position nodes are a granularity trap

IBM Debater, Kialo, and almost every stance benchmark use:

```text
Topic (question)
    → polarity (pro / con / none)
    → key points (reasons)
```

That is already Issue → coarse Position → Viewpoint.

Proposal 2’s extra canonical answers (Continue / Increase / Reduce / End) are real distinctions and a product foot-gun. Pairwise incompatibility among four policy shades yields a complete graph that looks like one Controversy and also like four. The inflation example is the actual reason to *sometimes* go beyond polarity: “stimulus contributed” and “supply chains contributed” are compatible answers to a causal question.

So Position is **question-type-dependent**, not a universal required node:

| CQ type | Position in v1 | Viewpoint |
|---|---|---|
| Policy / quality | `FAVOR \| AGAINST \| QUALIFY` | ArgSum key points inside polarity |
| Factual | `AFFIRMS \| DENIES \| UNCERTAIN` | Usually one cluster per pole |
| Causal / attribution | ArgSum clusters **are** the answers | Same objects; incompatibility is a second pass among clusters |
| Definitional | Not a Controversy | Existing `Dispute` |

Mint a `Position` node only when a CQ is non-binary **and** polarity would lie. Do not insert Position into every path “for ontology completeness.”

### 4. A second compatibility taxonomy will drift from `RELATES_TO`

The current kinds already cover the proposal’s list:

| Proposal 2 | Already in `RELATES_TO` / Dispute |
|---|---|
| `INCOMPATIBLE` | `oppose` |
| `PARTIALLY_INCOMPATIBLE` | `qualify` / `assumption_conflict` |
| `COMPATIBLE` / `COMPLEMENTARY` | `compatible` / `agree` |
| `BROADER` / `NARROWER` | `broader` / `narrower` |
| `ORTHOGONAL` / `TALKING_PAST` | `orthogonal` / `talking_past` |
| `UNCLEAR` | `unrelated` + quarantine |

Adding `INCOMPATIBLE_WITH` on Position nodes creates two sources of truth. Keep one taxonomy. Condition it on **same CQ**. Add NLI as a **veto/prior**, not a writer.

ClaimDiff (2023) still applies: MNLI often labels argumentative strengthen/weaken as `neutral`. Policy opposition is frequently not sentence contradiction. Use a modern multi-genre NLI model (e.g. DeBERTa-v3 MNLI/FEVER/ANLI/WANLI) as:

- contradiction → raise confidence in `oppose` **if same CQ**
- entailment → raise confidence in `agree` / `broader`
- neutral → **do nothing** (do not infer compatibility)

### 5. “KPA-style” is not an implementation

The task match is real. The filling is specified as embeddings + LLM key points + matching + Decision thresholds — i.e. a new Doxa product.

ArgSum is a mature, evaluated pipeline:

1. **Bar-Haim et al. (ACL/EMNLP 2020)** — candidate key points from high-quality short sentences; match remaining arguments; report prevalence.
2. **SMatchToPr (Alshomary et al., ArgMining 2021 winner)** — quality filter + match-graph PageRank + redundancy suppression.
3. **NL2G/argsum (Altemeyer et al., EMNLP 2025)** — LLM candidate generation **inside** those published matchers; Qwen-3-32B beat GPT-4o on their eval. Code: `https://github.com/NL2G/argsum`.
4. **ArgKP** (~24k labeled pairs, 28 topics) and **QAM** — the gold contract for the matcher, not a 100-sentence internal vibe check.

v1 should run a published matcher **inside `(CQ, polarity)`** (or inside a causal CQ with no polarity), with Doxa Decision provenance around it. Fine-tune later on ArgKP if news domain-shift is ugly. Do not re-derive Bar-Haim from prompts.

Local `HAS_ROLE` premises attach as evidence to the matched key point. They are not a second clustering space.

### 6. Nine question types are a philosophy department

Stasis theory (fact, definition, quality, policy) has organized controversy for two millennia. IBM motions are almost all policy. `detect_disputes` already owns definitional / talking-past. Causal “what caused X?” is the one extra type Doxa’s corpus will actually force, because `FAVOR/AGAINST` lies there.

Start with:

```text
policy | factual | causal | definitional
```

Map `definitional` into Dispute, not Controversy. Expand only when the gold set shows a type error that these four cannot express. `predictive`, `interpretive`, `priority`, `normative`, `attribution` can wait; several collapse into quality/policy/causal.

### 7. QUD parsers are the wrong grain

QUDSELECT (EMNLP 2024) and QUD generation (IJCNLP 2025) recover **local discourse questions** (“what does this sentence answer in context?”). Doxa’s Issue is a **corpus-level contested motion**. Using QUD parsing as Issue generation will emit one question per utterance — worse explosion than thesis-to-CQ.

Do not put QUDSELECT on the write path. The linguistic analogy is useful in a design doc; the software is not.

### 8. QBAF is still not a product milestone

Proposal 2 correctly refuses Dung extensions as a Viewpoint factory, then puts quantitative bipolar argumentation on the long-term map.

ArgRAG (NeSy 2025) uses QBAF to make retrieval-augmented *answers* contestable. That is an explainer. GDS PageRank / betweenness on a bipolar SUPPORTS/ATTACKS projection is the same gradual idea without a 2026 semantics paper as a dependency. Keep an “argument analysis” UI mode as optional. Remove QBAF from the implementation sequence until a mature CQ has users asking “how sensitive is this conclusion to premise X?”

---

## Replacement architecture

The proven shape is **IBIS + Debater**, not a novel L3+ ontology.

- **IBIS** (Kunz & Rittel; gIBIS; Deliberatorium): Issue → Position → Argument.
- **IBM Project Debater**: given/retrieved topic → claims → stance toward that topic → quality → key points.
- **ArgSum 2020–2025**: name the Position’s reasons.

Doxa already has the discourse substrate IBIS assumes. It does not need four new canonical labels to express that.

```text
L0–L2 Neo4j                 unchanged
        ↓
Thesis routing              speechAct + sparse HAS_ROLE
                            facts remain premise candidates
        ↓
CQ retrieve-or-mint         question-paraphrase retrieval into a registry
                            mint only on miss; Decision + quarantine
        ↓
Freeze the CQ               Question node OR Controversy.status=developing
        ↓
Assign to CQ                relevant? then polarity / causal cluster
                            retrieve candidates (Touché grain), do not score every pair
        ↓
Incompatibility gate        same CQ
                            ∩ RELATES_TO oppose|assumption_conflict
                            ∩ NLI contradiction as raise, never as sole writer
                            ∩ neither channel orthogonal|talking_past
        ↓
Controversy                 CQ.status=established when gate passes
        ↓
Viewpoint                   published ArgSum inside (CQ, polarity)
                            or inside causal CQ without polarity
        ↓
L4 overlays                 EvidenceCheck, framing Assessment, HELD_BY
        ↓
Optional later              GDS on purpose-built projections
                            ASPIC+ / QBAF explainer on a user-picked subgraph
                            StanceMining GP on (CQ × polarity) time series
```

Invariant, unchanged: **relatedness proposes; question membership organizes; incompatibility establishes conflict; reasons distinguish Viewpoints.**

Arena stays an ops bucket. It is not the question, and it must not share a semantic label with the question.

### Schema: preserve the distinction without a label war

**Do not** `MERGE (:Issue)` for the contested question while Arenas still use that label.

Two acceptable implementations; pick one in Phase 0 of engineering, not both:

**A. Preferred for product simplicity.** `Controversy` gains an early lifecycle.

```text
(:Controversy {
    question,                 // identity, written first
    questionType,             // policy|factual|causal|definitional
    status,                   // developing | established | closed
    confidence
})
```

`developing` = Issue with insufficient incompatibility. `established` = Controversy in the product sense. Explore feeds can show developing questions as “under discussion” without pretending they are fights. No new label. Matches the current UI object (`graph_controversies.question`).

**B. Preferred if you refuse to let a fight-shaped noun store a non-fight.** Add `(:Question)` (or `(:CQ)`), keep Arena as `Issue`, keep `Controversy` as the qualified overlay.

```text
(:Question)-[:ASSEMBLED_IN]->(:Issue)     // Arena, ops only
(:Controversy)-[:ABOUT]->(:Question)
(:Viewpoint)-[:ANSWERS {polarity}]->(:Question)
```

Do **not** do A and B. Do **not** introduce `Position` until a causal CQ in the gold set proves polarity is a lie.

`VARIANT_OF` among Questions, if ever, is a Decision-backed paraphrase merge, not a scope-diff copy of proposition ER.

### Thesis routing (not a new extractor)

Reuse what the worker already writes.

**May found a CQ / take a polarity:**

- `speechAct ∈ {prescription, judgment, allegation, prediction}`
- or `HAS_ROLE ∈ {conclusion, objection, rebuttal, prediction}` when present

**Premise / evidence only:**

- `speechAct = assertion` without a thesis-like role
- `HAS_ROLE ∈ {premise, qualifier, assumption}`

**Stay out of topology membership until attached:**

- `speechAct ∈ {other}` with no role
- pure background

**Never treat as a Controversy side:**

- `speechAct = definition` → Dispute path
- `speechAct = question` → may *be* a CQ candidate string, not a Position
- `speechAct = concession` → often the *opponent’s* thesis; attribution must stay on the original Agent

Measure: fraction of current Controversy members that fail this filter. That is the cheap win, without a debate-role model.

### CQ registry: retrieve, then mint

1. Maintain a registry of frozen questions (initially seeded from existing `Controversy.question` plus a short human list of gold CQs).
2. For each thesis, retrieve top-k registry questions with a **question-paraphrase** bi-encoder; rerank with a cross-encoder.
3. LLM (or a small classifier) answers only: `same_question | distinct_but_related | unrelated`. Distinct-but-related must **not** merge. Optionally store `RELATED_ISSUE` later; not in v1.
4. If all are unrelated at high confidence, generate 1 interrogative from the thesis (the `name_controversies` prompt shape is fine **here**, on a single thesis, not on a cluster of sides) and mint with Decision provenance.
5. Assign the thesis to the frozen CQ: relevant + polarity (or causal cluster id).

This is Project Debater’s claim-stance setting, which is the setting where stance detection works. IBM’s `claim_stance` dataset (2.4k Wikipedia claims, 55 topics) is the first off-the-shelf eval, not a runtime dependency.

Cross-document SUPPORTS/ATTACKS are then Issue-conditioned by construction: you only classify pairs that already share a CQ, plus a small recall net of knn/shared-entity **inside that CQ**. Global pair classification can stay as a recall instrument; it stops being the controversy authority.

### Incompatibility gate

A Controversy is established when:

```text
same canonical CQ
+ two or more polarities (or two causal clusters judged exclusive)
+ at least one accepted oppose|assumption_conflict among theses
+ NLI does not contradict that with entailment
+ neither side is talking_past|orthogonal|unrelated
+ Decision confidence above auto-accept
```

Source diversity, speaker count, and persistence affect **ranking / maturity**, not identity — Proposal 2 is right.

`detect_disputes` stays. Talking-past is not a Controversy.

### Viewpoints = published ArgSum, not agree-union-find

Replace `build_viewpoints` union-find (`isCoreViewpointUnion` = `agree` only) with ArgSum inside `(CQ, polarity)`:

1. Collect member theses + local premises (`HAS_ROLE`).
2. Quality/length filter (Debater argument-quality; SMatchToPr thresholds).
3. Match scorer (ArgKP-trained or LLM matcher from NL2G/argsum).
4. PageRank-on-match-graph or coverage ranking.
5. Dedup near-duplicate key points.
6. Quarantine unmatched material; do not force-assign.
7. Each surviving key point is a `Viewpoint`. Salience = matched evidence count (already projected).

That is the Ukraine split (deterrence vs European burden vs domestic spending) without Position nodes and without PyArg.

`build_controversies` oppose-union-find goes away as identity. Time chapters, Jaccard stable `ctr_` uids, mega-merge caps, and dirty Arena rebuild remain **ops** around the CQ object.

---

## Answers to Proposal 2’s RFC questions

1. **Does the graph already contain an entity that can represent Issue without conflating it with Controversy?**  
   No. `:Issue` is Arena. `Controversy.question` is a post-hoc caption and currently requires ≥2 sides. There is no developing-question object.

2. **Is a first-class Issue node warranted?**  
   The **semantic** distinction is warranted. A new node using the `Issue` label is not. Use `Controversy.status` or a `Question` label. See schema A/B above.

3. **Does `Controversy.question` lifecycle allow a question before qualification?**  
   No. `name_controversies` runs after `build_controversies` and skips Controversies with fewer than two sides.

4. **How should Arena map?**  
   Keep as size-capped dirty-rebuild scope. Never treat `IN_ISSUE` as “answers this contested question.” If CQs become first-class, Arena is `ASSEMBLED_IN` / processing neighborhood only. Rename in docs and uids; migrating the Neo label is optional and expensive.

5. **Can existing features implement thesis/premise/background triage without another model?**  
   Yes, as a routing rule on `speechAct` + sparse `HAS_ROLE`. Measure, don’t train.

6. **Which speech acts break the proposed triage?**  
   `assertion` (can be a thesis: “The withdrawal was a disaster”). `concession` (often the other side). `question` (CQ text, not a Position). `definition` (Dispute). `journalist_voice` attribution (ledes look like conclusions). `HAS_ROLE=value` (a reason, not a side). Implicit conclusions never extracted because the worker caps at 1–4 arguments/document.

7. **Minimum useful question-type taxonomy?**  
   `policy | factual | causal | definitional`. Four. Not nine.

8. **Issue generation without generic topics or duplicates?**  
   Retrieve-then-mint against a registry with a QQP-style matcher. Generation is the miss path. Ban entity-only labels in the mint prompt (“Ukraine” is invalid; the current `name_controversies` prompt already says this).

9. **Reuse Proposition canonicalization / `VARIANT_OF`?**  
   Reuse the **Decision / quarantine / never-silent-merge** pattern. Do not reuse the matcher or the variant semantics. Questions need paraphrase identity, not certainty/time/scope variants.

10. **Position identity for binary and non-binary Issues?**  
    Binary policy: polarity. Causal: ArgSum clusters. Do not mint Position in v1 unless the gold set shows polarity lying.

11. **Which pairwise labels become compatibility evidence?**  
    `oppose`, `assumption_conflict` → incompatibility evidence. `agree` / `broader` / `narrower` / `compatible` → same-side / compatible. `qualify` → not automatic incompatibility. `orthogonal` / `talking_past` / `unrelated` / `definitional_conflict` → veto controversy identity.

12. **Where NLI helps / false confidence?**  
    Helps as contradiction raise on same-CQ thesis pairs. False confidence: policy opposition without lexical negation; causal “contributed” vs “primary cause”; quotations and concessions; headlines. Neutral must not mean compatible.

13. **Pairwise Position edges vs Assessment vs existing structure?**  
    Do not add Position edges in v1. Condition existing `RELATES_TO` on CQ membership. If you need an analytical object, `Assessment` on the CQ (`kind: compatibility`) is enough.

14. **Does `Viewpoint = Position + recurring reason` fit the product?**  
    Yes as product copy. Current `Viewpoint` is an agree-cluster with `label`/`summary`; Explore shows them as sides of a Controversy. Replacing clustering with ArgSum matches the intended semantics. A mandatory Position parent does not.

15. **How should ArgSum attach to `HAS_ROLE`?**  
    Cluster theses (and high-quality conclusions). Attach premises/qualifiers as evidence on the matched Viewpoint. Do not cluster premises into Viewpoints.

16. **Handler fates?** See table below.

17. **Smallest gold set that distinguishes the two architectures?**  
    Not 100–300 flat propositions. **20–40 CQs** drawn from live Doxa output, each with 5–15 propositions, plus a **near-miss matrix** of question pairs (same vs adjacent vs unrelated). Labels: debate role, CQ id, type, polarity or causal cluster, compatibility, key-point id. Include: related-but-different CQs, compatible causal pair, exclusive causal pair, same polarity different reasons, fact-as-side, talking-past, temporal/scope mismatch. That is enough to measure false Controversy from relatedness vs the current pipeline.

18. **Failure cases that recreate topical clustering?**  
    Embedding merge of generated questions; LLM “related debate” merges; assigning every proposition to every CQ; Arena membership used as CQ membership; shared Entity as Issue identity; too-fine Positions fully connected by `INCOMPATIBLE_WITH`; GraphRAG later “to help Issues.”

19. **What to remove without losing semantic correctness?**  
    Nine question types; always-on Position; new compatibility taxonomy; Issue–Issue relation set; debate-role LLM; QBAF/StanceMining/GDS/frames in the first milestone; generate-from-every-thesis as the writer; `VARIANT_OF` copy-paste onto questions.

20. **Stronger modern fillings?**  
    IBIS + Debater construction order; QQP paraphrase models; IBM `claim_stance` + SemEval target-conditioned stance; Touché argument retrieval; ArgKP / SMatchToPr / NL2G argsum; MoritzLaurer-style NLI as veto; ValueEval at L4; GDS PageRank instead of QBAF. Not QUD parsers, not GraphRAG, not Dung, not StanceMining as registry.

21. **Should QBAF remain on the roadmap?**  
    No as a named milestone. Optional explainer after users have trustworthy CQs. GDS is the batch scoring tool already in the stack.

22. **Shadow migration without destabilizing UI?**  
    Write new CQ assignments and ArgSum viewpoints under a `schemaVersion` / MethodRun that Explore does not read. Keep serving current `vp_`/`ctr_` projections. Compare on the gold set and on a shadow report: members removed as unrelated, CQs split, facts rerouted, same-polarity splits, missed opposition. Flip `project_debate_summaries` only after the new path wins. Jaccard reuse of `ctr_` uids when the established CQ’s member set overlaps ≥ 0.5 with an old Controversy.

---

## Mapping onto current handlers

| Handler | Fate |
|---|---|
| graph-worker L0–L2 + `HAS_ROLE` | **Keep.** Thesis routing features come from here. Do not add a second miner. |
| `generate_proposition_pair_candidates` | **Demote** to recall inside a CQ and to “maybe the same CQ” retrieval. Stop treating knn 0.72 as disagreement. Shared entity stays blocking-only. |
| `classify_proposition_relationships` | **Keep taxonomy.** Add CQ id to the prompt. Add NLI channel. `oppose` is evidence, not identity. Stop calling `assignArenaForPair` as if that assigned a question. |
| Arena assign / dirty rebuild | **Keep as ops.** |
| `name_controversies` | **Move before assembly** and retarget: generate a CQ from a **single thesis** on registry miss, or title a developing Controversy. Stop captioning oppose-clusters. |
| `build_viewpoints` | **Replace** agree-union-find with ArgSum inside `(CQ, polarity)`. |
| `build_controversies` | **Replace** oppose-union-find identity with CQ incompatibility qualification. Keep Jaccard uids, time chapters, size caps, dirty clear. |
| `detect_disputes` | **Keep.** |
| `project_debate_summaries` | **Keep.** Flip only after shadow win. `SUBJECT_OF` stays browse. |
| `analysis_pipeline` / EvidenceCheck / Assessment / HELD_BY | **Keep.** Frames/values hang here later. |
| New Issue-generation / Position-canonicalization / QBAF / StanceMining jobs | **Do not add** as write-path stages. |

---

## Implementation sequence

Proposal 2’s Phase 0–1 (repo reality check + gold set) are correct and still skipped at your peril. After that, narrow further than Proposal 2’s first milestone.

0. **Gold set** in the shape above. Measure current false-Controversy rate. This is the contract.
1. **Thesis routing** on existing fields. Re-run assembly. Measure junk-member drop. No new model.
2. **CQ registry + retrieve-or-mint** in shadow. Evaluate same-vs-near-miss question pairs with a QQP matcher, not generic proposition ER.
3. **Question-conditioned polarity** (IBM claim-stance setting) for policy CQs; ArgSum-without-polarity experiment for one causal CQ.
4. **Incompatibility gate** using existing `RELATES_TO` + NLI veto, same CQ required. This is the architectural milestone. Not Position canonicalization.
5. **ArgSum viewpoints** inside polarity. This is the “two AGAINST, two Viewpoints” milestone.
6. Only then consider a Position node, extra question types, frames/values, GDS, or an explainer.

Success metrics from Proposal 2 still hold:

> Does Issue-first construction cut false controversies caused by topical relatedness?

> Does reason-based Viewpoint construction separate different rationales within the same polarity?

Add a third, because it is how Proposal 2 will fail if unchallenged:

> Does retrieve-then-mint keep adjacent questions apart at a higher precision than generate-then-embed-merge?

---

## What to keep from Proposal 2

- Construction order: question → answers → incompatibility → reasons.
- Issue and Controversy as distinct *states*.
- Thesis vs premise vs background as routing, not deletion.
- Polarity as a projection, not the only ontology — but only *activate* richer Positions when the type requires it.
- Research libraries as replaceable modules.
- Provenance, idempotence, quarantine over forced clustering.
- Shadow migration; do not dual-run two ontologies forever.
- Purpose-built GDS later, never community-detection-as-ideology.

**What not to keep:** a new `:Issue` on top of Arena; generate-from-every-thesis as the writer; nine question types; always-on Position; a second compatibility taxonomy; homegrown KPA; QUD parsers; QBAF as a milestone; reusing proposition `VARIANT_OF` for questions.

The first-class system is still in the repo: utterance-grounded Neo4j, Decision provenance, a pairwise taxonomy that already knows `orthogonal` and `talking_past`, Arena as ops, CQ as the intended identity. Proposal 2 names the right invariant and then over-builds a custom stack around it. The proven filling is **IBIS’s shape, Debater’s retrieve-and-stance order, QQP for question identity, and ArgSum for naming reasons** — with Doxa owning ontology, provenance, and product, not owning a new matcher for every layer.
