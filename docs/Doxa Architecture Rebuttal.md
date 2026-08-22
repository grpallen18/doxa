# Doxa Architecture Rebuttal

This document answers [Doxa Architecture Proposal.md](Doxa%20Architecture%20Proposal.md). It does not validate that proposal. It treats every proposed layer as guilty until justified against current computational argumentation, stance mining, argument knowledge graphs, GraphRAG, Project Debater / Key Point Analysis, formal argumentation, and discourse-mining systems.

**Verdict:** the diagnosis is first-class. The named stack is not. StanceMining, oAMF, PAKT, and Dung solvers mostly solve adjacent problems at the wrong grain. Chaining them will recreate topical-relatedness-as-controversy with more ceremony.

The live bug is **construction order**, not missing libraries.

---

## What is actually true

Doxa’s L3 path today is:

```text
embedding / shared-entity pairs
        → gpt-4o-mini RELATES_TO (agree|oppose|…)
        → Arena (Issue) buckets
        → agree-clusters = Viewpoints
        → oppose-between-viewpoints = Controversies
        → THEN name_controversies writes the CQ
```

That is why topical relatedness becomes controversy. Candidate generation is relatedness (`min_similarity` 0.72, shared Entity). Classification is a small LLM with no contradiction test. Union-find then amplifies a few `oppose` edges. `name_controversies` captions the blob after the fact.

Phase 2.4 already decided the right product rule: **identity is a contested question, Arena is only assembly scope, Entity is browse/blocking**. The proposal rediscovers that rule and then outsources it to StanceMining, which mines *targets* (noun phrases or claims), not questions. That is the entity-as-controversy bug with a new label.

The Ukraine/Clark worked example also contradicts itself. Stage 2 drops Clark’s spending fact as background. Later in the same document, that exact fact is used as an undercutter of “Europe should carry the burden.” A fact can be a **premise** without being a **thesis**. An argumentativeness gate that drops it is wrong.

---

## Layer-by-layer: keep, replace, or drop

| Proposal layer | Verdict | Replace with |
|---|---|---|
| Neo4j L0–L2 substrate | **Keep.** First-class vs GraphRAG. | Nothing. Microsoft GraphRAG / Leiden community summaries would *cause* topical mega-clusters. HippoRAG is retrieval, not debate identity. |
| Argumentativeness gate | **Guilty as specified.** | **Thesis vs premise split**, using existing `speechAct` + `HAS_ROLE`. |
| StanceMining as CQ engine | **Drop from the write path.** | IBM Debater pattern: generate CQs from theses, then stance *toward the CQ*. |
| New `StanceTarget` node | **Drop.** | Existing `Controversy.question` + Proposition ER / `VARIANT_OF`. |
| oAMF as argument writer | **Do not write the graph.** | Keep graph-worker `Argument`/`HAS_ROLE`. Optional xAIF *export*. |
| PAKT as a stage | **Drop the runtime.** Keep the idea as L4. | SemEval ValueEval + optional MediaFrames as `Assessment`. `kind: framing` already exists. |
| PyArg/pygarg as Viewpoint factory | **Drop from batch.** | KPA-style key-point clustering. Optional ASPIC+ *explainer* in UI. |
| GDS purpose-built projections | **Keep, later.** | Same idea; only after CQ-conditioned edges exist. |
| GraphRAG | **Do not use for L3.** | Retrieval for agents/UI only. |

Error compounds. Five research stages at ~0.7 F1 is ~17% end-to-end. Project Debater worked because a **topic was given**, then high-precision claim/stance/quality models ran against it. It never ran open target mining → AMF → frames → Dung extensions as a controversy factory. The Debater APIs were sunset in 2024; Doxa should inherit the **architecture**, not the hosted stack.

---

## Why the named systems fail Doxa’s grain

### StanceMining (Steel & Ruths, IJCNLP 2025 demo)

Document-author attitude toward mined targets, plus Gaussian-process time series and a dashboard. Targets are often noun phrases. Grain is document, not utterance/proposition. Labels are favor/against/none, not qualify/talking-past/assumption-conflict. Feeding documents collapses speakers; feeding propositions is off-label. Unconstrained target mining will emit “Ukraine”, “Biden”, “military aid” — the same collapse Phase 2.4 just forbade.

Unique useful piece: **noisy ordinal stance time series**. That is L4 analytics, not identity.

### oAMF (ARG-tech / Reed, ACL 2025)

Best open argument-mining *workbench*, xAIF interlingua, ~17 modules. It (re)segments ADUs and local support/attack **inside a text**. Doxa already does that in `graph-worker`: `HAS_ROLE` of `premise|conclusion|assumption|objection|rebuttal|qualifier|value|prediction`. Running oAMF on original text duplicates L1–L3 and fights provenance. Cross-document attack is not AMF’s job. License/ops (remote arg.tech modules, LGPL/GPL mix) are real costs for a write path.

### PAKT (Heidelberg 2024)

Schema paper on Debate.org-style deliberation, stored in Neo4j. Frames = MediaFrames (15 classes, trained on immigration / same-sex marriage / marijuana news). Values = Schwartz via ValueEval. Concepts = ConceptNet. ConceptNet is a bad news background graph. MediaFrames will domain-shift on geopolitics. PAKT is not a library you run. Doxa already has L4 `Assessment` with `framing`.

### Dung solvers (PyArg / pygarg)

Dung AFs are **attack-only**. The proposal’s graph is SUPPORTS + ATTACKS. pygarg will not represent support. PyArg’s ASPIC+ *can*, but extension semantics assume a complete, clean attack relation. Mined news graphs are incomplete and noisy; preferred extensions thrash. The proposal says not to hard-code “multiple preferred extensions = controversy,” then the worked example does exactly that.

IBM, Kialo, and ArgumenText never used Dung to *create* debates. Gradual/ranking semantics (h-categorizer, PageRank on bipolar edges) are the robust cousin — and GDS already does PageRank.

### Pairwise NLI is not a silver bullet either

ClaimDiff (2023) shows MNLI often labels argumentative strengthen/weaken as `neutral`. So: NLI is a **veto / prior** on `oppose`, not the only classifier. The current `RELATES_TO` taxonomy (`orthogonal`, `talking_past`, `compatible`, `assumption_conflict`, …) is already more honest about news than binary contradiction.

---

## Replacement architecture

Reuse the IBIS shape Doxa already has: **Issue (question) → Position (stance + reasons) → Argument**. IBM Debater is the production-proven NLP filling of that shape. Key Point Analysis is how positions get *named* when many people share a polarity but not a reason.

```text
L0–L2 Neo4j          unchanged (utterance-grounded discourse)
        ↓
Thesis selection     conclusions / prescriptions / judgments
                     facts stay as premise candidates
        ↓
CQ generation        interrogative from theses (move name_controversies earlier)
        ↓
CQ canonicalization  existing Proposition ER + VARIANT_OF + quarantine
        ↓
Assign + polarity    (proposition, CQ): relevant? then FAVOR|AGAINST|QUALIFY|NONE
        ↓
Incompatibility gate  LLM kind ∩ NLI contradiction/entailment
                     oppose only if same CQ AND incompatible
        ↓
Controversy          one canonical CQ + ≥2 polarities + source diversity
        ↓
Viewpoint            KPA inside (CQ, polarity): shared reason, not shared agree-edge
        ↓
L4 overlays          EvidenceCheck (exists), frames/values, HELD_BY
        ↓
Optional             ASPIC+ explainer on a user-picked CQ subgraph
                     GDS on purpose-built projections
                     StanceMining GP on (CQ × polarity) time series
```

Invariant: **relatedness proposes; question-membership filters; incompatibility decides; reasons split sides.**

### 1. Thesis selection (not a generic argumentativeness gate)

Reuse what the worker already writes.

- **May be a thesis** (can found a CQ / Viewpoint): `HAS_ROLE` in `{conclusion, prediction, value}` or `speechAct` in `{prescription, judgment, allegation, prediction}`.
- **May be a premise/evidence only**: factual `assertion`s, including Clark’s spending line.
- **Stay out of debate topology as members**: pure background with no argument role and no later attachment as premise.

Measure: fraction of current controversy members that are thesis-like vs incidental facts. That is the cheap win the proposal wanted from the gate, without deleting rebuttal material.

### 2. CQ-first, IBM Debater style — not StanceMining

Project Debater: **topic given → detect claims → stance toward that topic → quality → narrative**. Open-corpus Doxa must *generate* topics, then freeze them.

1. From theses, generate 1–2 candidate questions (the prompt in `name_controversies` is already the right shape).
2. Canonicalize with the Phase 1 linker: embedding candidates, Decision-backed merge, `VARIANT_OF` for scope/time/certainty, **never merge on shared entity**.
3. Persist the CQ on `Controversy` (already the identity node). Do not add `StanceTarget`.
4. For each thesis (and later, each candidate premise), classify **relevance to Q**, then **polarity toward Q**.

That is question-conditioned stance, the setting where stance detection is actually reliable. Open target mining is the setting where it collapses to topics.

`Arena` stays a size-capped dirty-rebuild bucket. It is not the question.

### 3. Incompatibility is a two-channel gate

Demote current `RELATES_TO oppose` from controversy authority to **evidence**.

For a pair to count as opposition:

- both assigned to the **same canonical CQ**, and
- polarities incompatible (FAVOR vs AGAINST, or QUALIFY that actually restricts the thesis), and
- either the LLM kind is `oppose` **or** NLI says contradiction — and **neither** channel is `orthogonal` / `talking_past` / `unrelated`.

If NLI is `neutral` (common on policy claims), do not auto-accept `oppose` from gpt-4o-mini alone unless confidence is high **and** both sides are theses on the same CQ.

Keep `detect_disputes` for definitional / talking-past. Those are not controversies.

Candidate generation (knn + shared entity) can stay as a **recall net** for “might be the same CQ,” not as a disagreement net.

### 4. Viewpoints = Key Point Analysis, not AF extensions

The proposal’s best product idea is: same polarity, different reasons → different viewpoints. That is **KPA** (Bar-Haim et al.; ArgKP ~24k labeled pairs; ArgMining 2021). IBM’s API is gone; the task and datasets are not.

Within each `(CQ, polarity)`:

1. Take member theses + their local premises (`HAS_ROLE`).
2. Select short high-quality sentences as key-point candidates (argument-quality / conciseness filter — Debater’s other real contribution).
3. Match remaining material to candidates (contrastive matcher; ArgMining 2021 winner used this).
4. Dedup near-duplicate key points.
5. Each surviving key point is a `Viewpoint`. Salience = matched evidence count, which Doxa already projects.

That is the Ukraine split (deter Russia vs Europe should pay) **without** PyArg. AF extensions group by attack-defense, not by reason. Two arguments that never attack each other can still be the same viewpoint; two that share a conclusion can still be different viewpoints. KPA matches the product; Dung does not.

Fine-tune later on ArgKP if quality is weak; a modern LLM matcher is a valid v1 if Decision provenance and a match threshold are kept.

### 5. Local argument structure stays in the graph-worker

Do not re-extract ADUs. Optionally:

- map Doxa graphs **out** to xAIF for research / oAMF experiment,
- add **scheme classification** (practical reasoning, consequences, …) as L4 on mature CQs.

Cross-document SUPPORTS = same CQ + entailment or `agree`/`broader`/`narrower` toward a thesis. Cross-document ATTACKS = same CQ + the incompatibility gate. That is bipolar AF *data*, which GDS and an explainer can use, without a solver in the cron.

### 6. Frames and values: L4 facets, not a pipeline stage

When KPA clusters are mixed, split or facet by:

- ValueEval (Schwartz; HuggingFace models exist),
- optional MediaFrames, knowing the training domain is narrow.

Store as `Assessment` (`framing` already exists) + Decision + MethodRun. Use them in UI and as a *secondary* split signal, not as controversy membership.

Skip ConceptNet. If background is needed later, link Entities already resolved, not commonsense trivia.

### 7. Formal argumentation: interactive explainer only

Export a user-selected CQ subgraph into **ASPIC+** (PyArg), not pygarg:

- premises → ordinary premises,
- `HAS_ROLE` conclusion → conclusion,
- SUPPORTS → defeasible rules,
- ATTACKS → undercut / rebut.

Show grounded/preferred extensions as “analytically coherent sets” in Admin Neo, labeled **Analyzed**, never as writers of `Viewpoint`/`Controversy`. For batch salience, run GDS PageRank / betweenness on the bipolar projection — gradual semantics in all but name.

### 8. GDS and GraphRAG

Keep the proposal’s projection discipline. Do it last.

| Projection | Question |
|---|---|
| `(Agent)-[:STANCE {polarity}]->(Controversy)` | Who aligns across issues? |
| `(Viewpoint)-[:OPPOSES]->(Viewpoint)` within CQ | Local debate topology |
| Argument bipolar SUPPORTS/ATTACKS | Salient reasons |
| Person–Value / Person–Frame | Only after L4 exists |

Do **not** run Microsoft GraphRAG community summaries over the heterogeneous graph. That is topical relatedness at corpus scale — the failure mode this work is trying to kill. GraphRAG/HippoRAG may later retrieve *evidence for a known CQ* in product chat. They must not define CQs.

### 9. StanceMining’s only honest job

If the library is adopted at all: take **already canonical CQs** as fixed targets, classify new documents/utterances against them, fit the GP trend model, project a time series. That is better than rolling a custom noisy stance-over-time. It is not a graph writer.

---

## Mapping onto current handlers

| Handler | Fate |
|---|---|
| graph-worker L0–L2 + `HAS_ROLE` | Keep. Thesis/premise features come from here. |
| `generate_proposition_pair_candidates` | Demote to **CQ-candidate recall**. Do not treat knn as disagreement. |
| `classify_proposition_relationships` | Keep taxonomy; add CQ-id + NLI channel; `oppose` no longer authoritative. |
| `name_controversies` | **Move before** viewpoint/controversy assembly. It becomes CQ generation/canonicalization. |
| `build_viewpoints` | Replace agree-union-find with **KPA within (CQ, polarity)**. |
| `build_controversies` | Replace oppose-union-find with **multi-polar canonical CQ + diversity checks**. Jaccard/time-chapters stay. |
| `detect_disputes` | Keep. Talking-past is not controversy. |
| `analysis_pipeline` / EvidenceCheck / Assessment / HELD_BY | Keep. Hang frames/values here. |
| New StanceMining/oAMF/PAKT/PyArg jobs | Do not add to the write path. |

---

## Implementation sequence

1. **Measure the current false-controversy rate** on a labeled sample (related but not opposing; same stance different reasons; facts-as-sides). Victory cannot be claimed without this.
2. **Thesis filter** on existing `HAS_ROLE`/`speechAct`. Re-run assembly. Measure drop in junk members.
3. **Invert the pipeline**: generate/canonicalize CQs from theses, assign polarity to Q, require same-Q incompatibility to form a controversy. Keep old controversies until this wins on the sample.
4. **NLI as oppose veto**, not as sole classifier.
5. **KPA viewpoints** inside polarity. This is the “two AGAINST, two viewpoints” milestone — not PyArg.
6. Frames/values as Assessments if KPA clusters still mix distinct reasons.
7. ASPIC+ UI explainer; GDS projections; optional StanceMining trends.

Success metric from the proposal still holds: *does CQ-first analysis cut false controversies from semantically related non-opposing statements?* Add a second: *does KPA split same-polarity distinct reasons without AF solving?*

---

## What to keep from the proposal

- Relatedness is candidate generation, not controversy.
- CQ-first identity; proposition-level, not topic-level merge.
- Same polarity ≠ same viewpoint.
- Objective vs analytical provenance; idempotent processors.
- Do not delete live controversies until the new path beats them.
- Purpose-built GDS, not one giant projection.
- Formal solvers as signals, not authorities — then actually obey that.

**What not to keep:** five loosely coupled academic runtimes as the L3 spine, a new `StanceTarget` type, an argumentativeness gate that discards premises, and Dung extensions as viewpoint minting.

The first-class system is already in the repo: utterance-grounded Neo4j, Decision provenance, Arena/CQ dual axes, a pairwise taxonomy that already knows `orthogonal` and `talking_past`. The missing architecture is **Debater’s topic-conditioned stance + KPA reason clustering**, with construction order inverted so the question exists before the cluster. That is the proven stack. The named libraries are optional instruments around it, not the stack.
