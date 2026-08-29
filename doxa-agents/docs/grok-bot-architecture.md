# Grok bot architecture

**Status:** Approved direction (2026-08). Product-facing debate **paused** during rebuild. **Wipe L3 + L4/L5 now**; L0–L2 stays.

**Related:** [question-grain.md](../../docs/gold/question-grain.md), [neo4j-graph-architecture.md](architecture/neo4j-graph-architecture.md), [debate-pipeline README](../departments/06-debate-engine/debate-pipeline/README.md), MCP at `app/api/mcp/[transport]/route.ts`.

---

## Overview

Three Grok bot populations with strict separation (full mature roles — do not collapse):

| Team | Layers | Job |
|------|--------|-----|
| **Provenance graph** | L0–L2 | Clean extraction artifacts and bloat; guardrailed delete/merge; **never edit utterance text**; **never touch L3+** |
| **Debate graph** | L3+ | Own debate topology: question registry, membership, audit, gap analysis, lead requests + review; **never delete propositions** |
| **Ingestion** | — | Execute lead requests only; find URLs; **never analyze the corpus** |

**Core decisions**

- L3+ is **authored by the debate graph team**, not auto-minted from contrast pairs.
- L4/L5 wipe with L3; rebuild on provenance (L0–L2).
- Deterministic spine **enqueues** work and **applies** approved proposals; Grok **judges**; spine never MINTs/ADMITs on its own.
- Approved leads get **deterministic attach** after review (build attach **before** scaling ingestion).
- **Bootstrap mode** when L3 is empty: prioritize `unbound_cluster` → MINT; defer `counter_side` / lead requests until a minimum registry exists.

---

## Grok proposes; the engine executes

Grok bots are **not** the 24/7 runtime. They (or you) **decide**; the pipeline **does the work**.

```text
Deterministic spine finds candidates → puts dossiers on review queues
       ↓
Grok bot OR human OR API worker LLM → submits proposal (MINT, ADMIT, lead candidate, …)
       ↓
Human approval (Slack, early) OR approval Grok bot (later) OR auto-apply when gated
       ↓
apply_l3_proposals / applier → Neo4j + Postgres (always server-side, reliable)
```

**In plain terms:** Grok is the reviewer at the top of the funnel — it reads a focused packet, says “mint this question” or “reject this lead,” and walks away. Supabase queues, edge workers, and the applier keep running on cron whether or not Grok is online. API workers (`run_l3_curator`, `run_l3_editor`, `run_l3_auditor`) remain **permanent executors**: they can drain the same queues with the same prompts when Grok isn’t scheduled, and they always run the apply step after approval. Grok does not hold the only copy of “what happens next.”

This is not “Grok until workers replace it.” It is **Grok + workers + human** on one queue, with workers as the dependable execution layer.

---

## Human approval → approval Grok bot

**Spin-up (required):** High-friction items need **easy** approve/reject with minimal context switching.

1. Proposal or lead candidate hits `pending_approval`.
2. **Slack webhook bot** posts a compact card: type, question text, key props/URL, approve/reject reason prompt.
3. Operator replies in-channel (`approve`, `reject: reason`). Other thread chatter is ignored.
4. Webhook writes decision → applier runs (or queues apply) → thread updated with outcome.

Store every human decision (`approver`, `verdict`, `reason`, proposal payload snapshot) for training reference.

**Transition:** A dedicated **approval Grok bot** (debate team persona, `lead-reviewer` / curator scope) takes over routine approvals using prior human judgments as few-shot / gold examples (`l3_gold_negatives`, approval log). Human stays on Slack for edge cases and spot checks until measured precision clears a bar. No permanent dependency on one person’s Slack availability for throughput.

Admin UI (`/admin/l3-proposals`) remains override; Slack is the **primary** low-friction path during spin-up.

**Slack workspace setup:** Channels `#l3-approvals` (+ optional `#grok-ops`) — operator creates channels only. Agent installs **Slack CLI**, scaffolds `integrations/slack-l3-approvals/manifest.json`, runs `slack install` to create **Doxa L3 Approvals** app, wires env vars, invites bot. Operator completes one-time `slack login` browser auth when prompted. Grok bots stay on xAI MCP — they do not join Slack.

---

## End-to-end flow

```text
[Wipe L3+ → L0–L2 intact]

Phase 1: graph-worker L2 hygiene (no provenance Grok yet)
  → fix extraction; debateEligible flags at write time
       ↓
Bootstrap mode: enqueue unbound_cluster only
       ↓
Debate Grok / worker / human → MINT Questions
       ↓
apply_l3_proposals → bind_candidates → qualify → editor → auditor → project
       ↓
[L4 after L3 stable]

When registry ≥ bootstrap threshold:
  → counter_side queues, lead_requests, ingestion bot (attach path must exist first)

Phase 2 (later): provenance Grok team
  → delete/merge junk props (guardrailed)

Ingestion team (after attach works):
  → claim lead_request → search → submit candidate → debate review → deterministic attach
```

---

## Provenance graph team (L0–L2) — Phase 2

**Phase 1 (now):** Graph-worker + deterministic flags — no provenance Grok bot yet.

- Fix extraction prompt; remove utterance-echo fallback for non-assertions.
- Write `debateEligible: false` (or equivalent) at extraction for obvious junk.
- Relevance gate + purge unchanged.

**Phase 2:** Provenance Grok bot per trash rules and guardrails below.

### Immutable vs cleanable

| Object | Policy |
|--------|--------|
| Utterance text, segments, document body | **Immutable** |
| Proposition | **Cleanable** when guardrails pass |
| Story / document | Relevance DROP + purge; subgraph reprocess |

### Trash rules

Interrogative/non-claim, utterance echo, duplicate extraction, orphan prop, incoherent extraction (prefer re-extract). Not trash: coherent claims; L3+ references (EVICT first).

### Ops

`DELETE_PROPOSITION`, `MERGE_PROPOSITIONS`, `FLAG_REEXTRACT_DOCUMENT`, `ARCHIVE_DOCUMENT` — proposal-only via `provenance` MCP token.

---

## Debate graph team (L3+)

Separate Grok personas: **curator**, **editor**, **auditor**, **lead-reviewer** (keep distinct tokens and tool allowlists).

### Question creation

MINT when: grounded cluster, registry grain, product-interesting, cites utterances. Not singletons; not non-claims (provenance phase 2).

### Queues

| Queue | Owner | When active |
|-------|--------|-------------|
| `unbound_cluster` | Debate | **Bootstrap** (L3 empty / small) |
| `membership`, `consolidate` | Debate | After registry exists |
| `counter_side`, `lead_candidate` | Debate | After bootstrap threshold |
| `prop_quality`, `duplicate_cluster`, … | Provenance | Phase 2 |

### Lead pipeline

1. Debate writes `lead_request`
2. Ingestion claims → submits candidate
3. **lead-reviewer** (or human via Slack) approves
4. Deterministic attach after graph extraction

**Do not scale ingestion routines until attach path is proven.**

Gap analysis lives **only** on debate team.

---

## Ingestion team

- `acquisition` token; claim `lead_requests` only
- Routine schedule after attach + bootstrap threshold
- No gap analysis, no self-approval

---

## Bot identities (`l3_bots`)

| `bot_id` | kind | Role |
|----------|------|------|
| `grok` | grok | **Shared xAI MCP token** — all Grok personas; full debate tool allowlist |
| `provenance` | provenance | L0–L2 proposals (phase 2) |
| `acquisition` | ingestion | Lead fetch (worker/cron; not a separate MCP token) |
| `curator` | graph | Membership / MINT / MERGE (worker/cron) |
| `editor` | graph | Viewpoints (worker/cron) |
| `auditor` | graph | Publish gate (worker/cron) |
| `lead-reviewer` | graph | Lead + early proposal approval (later auto from human examples) |

Seed: `npx tsx scripts/generate-l3-mcp-tokens.ts` → one `DOXA_MCP_TOKEN` for every xAI MCP connector. Persona bots differ by **system prompt only**. xAI wiring: [integrations/grok-bots/README.md](../../../integrations/grok-bots/README.md). MCP tool allowlist follows `bot.kind` (`grok` = union of debate tools).

---

## Implementation order

1. **Wipe L3+** (`wipe_l3_analytical`); pause debate product + cron
2. **Middleware / MCP** production-ready
3. **Graph-worker L2 fixes** (phase 1 provenance — no Grok)
4. **Enqueue rewrite** + **bootstrap mode** (`unbound_cluster` first)
5. **Slack approval webhook** + decision log
6. **Debate proposals** (MINT/ADMIT) via Grok/worker/human → applier
7. **Deterministic attach** for approved items
8. **`lead_requests`** + ingestion (after attach)
9. **Approval Grok bot** trained on human Slack history
10. **Republish** product when audit metrics acceptable

---

## ⚠️ Retire auto-mint — LAST (do not forget)

**Do not remove until step 10 below is complete and graph-team MINT replaces it in production.**

Checklist before deleting `detect_contrast_seeds` and related mint enqueue:

- [ ] `unbound_cluster` enqueue live and draining via curator/worker/Grok
- [ ] At least one MINT path proven: queue → proposal → Slack/human approve → applier → Question in Neo4j
- [ ] Bootstrap registry above minimum threshold (TBD count)
- [ ] `debate_pipeline` orchestrator updated to **not** call `detect_contrast_seeds`
- [ ] Remove: `12-detect-contrast-seeds` handler + stub, mint rows in `13-enqueue-l3-reviews`, default `mint` auto-lease in `run_l3_curator`, `activation.yaml` entry, cron schedule
- [ ] `npm run agents:refresh`; deploy; verify no orchestrator reference remains

Until this checklist is done, old auto-mint may remain on disk but should stay **disabled** in orchestrator/cron if it would compete with graph-team MINT.

**Also retire (after lead_requests live):** blind MVP `list_onesided_questions` loop; bulk `seed-question-registry` as production driver.

---

## Planned infrastructure

- `lead_requests` + lead candidate review
- **Slack approval bot** (webhook in + out, decision log)
- Approved attach (`metadata.approved_lead`, post-graph targeted bind)
- Provenance proposals (phase 2)
- Approval Grok bot consuming human decision history
- Metrics funnel (`/api/admin/l3-metrics` + Slack thread ids)

---

## What exists today

| Capability | Today |
|------------|--------|
| MCP `/api/mcp/l3` | Live; tool allowlists by `bot.kind` |
| Ingestion MVP | Blind `submit_source_lead` — now queues `pending_approval` (no auto-ingest) |
| Slack approval | Routes + decision log built; Slack CLI install still needs one-time `slack login` |
| Attach / lead_requests / bootstrap | Built (handlers + schema); attach runs in orchestrator after bind |
| Provenance Grok | **Not built** (phase 2) |
| Auto-mint | On disk, **disabled** in orchestrator — retire last |

---

## Keep in pipeline

`bind_candidates`, `enqueue_l3_reviews` (rewritten), `apply_l3_proposals`, validator/applier, qualify/editor/auditor/disputes, `project_debate_summaries`, MCP, `wipe_l3_analytical`, `sweep_counter_side` (enqueue only), API workers as executors.

---

## Grok operations

- Public HTTPS MCP; Grok on xAI cloud
- Bearer tokens in connector store, not chat
- Ingestion routines only after attach + bootstrap threshold

---

## Anti-patterns

- Ingestion before attach path exists
- Ingestion doing gap analysis
- Debate team deleting propositions (phase 2 provenance job)
- Retiring auto-mint before graph-team MINT works
- Collapsing bot personas to save setup time
- Grok as the only runtime (no worker apply path)
- `metadata.question_uid` without attach

---

## Appendix: MVP acquisition (deprecated)

Replace with `lead_requests`. Was: MCP + `list_onesided_questions` + `submit_source_lead` on ~6h routine.

---

## Open questions

- Bootstrap registry minimum (question count before counter_side / leads)
- Lead priority when queue > throughput
- Duplicate URLs vs NewsAPI
- Paywall escalation
- Min cluster size for MINT enqueue
- Auto-apply threshold for approval Grok vs human-only
