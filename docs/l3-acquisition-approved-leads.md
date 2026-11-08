# L3 acquisition leads and approved-lead binding

How a one-sided Question becomes a scraped story, a graph Document, and then a targeted `CANDIDATE_FOR` edge. Slack Approve is **not** the bind.

Related: [admin-l3-proposals-and-approval.md](./admin-l3-proposals-and-approval.md) · [grok-bots README](../integrations/grok-bots/README.md) · [debate-pipeline README](../doxa-agents/departments/06-debate-engine/debate-pipeline/README.md) · [graph-worker README](../services/graph-worker/README.md)

## Intent

Acquisition fills **missing opposing evidence** for Questions that already have answers on only one polarity. Humans gate the URL. The graph-worker extracts propositions. `attach_approved_lead` then proposes those propositions as candidates for the intended Question. **Curator ADMIT is still required** — this path never writes `ANSWERS`.

| Live | Not live |
|------|----------|
| `enqueue_l3_reviews` inserts `lead_requests` for one-sided Questions (post-bootstrap) | A dedicated Acquisition Grok prompt file |
| MCP `claim_lead_request` → `submit_lead_candidate` | Auto-ingest on submit (queues `pending_approval` only) |
| Slack / admin Approve → `ingestSourceLead` + graph job | Scrape cron picking up the new row (see pitfalls) |
| `attach_approved_lead` inside hourly `debate_pipeline` | `CANDIDATE_FOR` becoming membership |
| `sweep_counter_side` cron (separate, Neo kNN) | Sweep inside `debate_pipeline` |

## End-to-end

```text
onesided Question (one ANSWERS polarity)
        ↓  enqueue_l3_reviews (skipped while bootstrap)
lead_requests state=pending
        ↓  MCP claim_lead_request (lease 1h, max 5)
claimed
        ↓  MCP submit_lead_candidate { url, question_uid, lead_request_id? }
l3_proposals kind=lead_candidate, status=pending_approval  →  Slack card
        ↓  Slack Approve (or admin Apply)
validated → apply_l3_proposals { proposal_uid, force_apply_all: true }
        ↓  ingestSourceLead (approved: true)
stories row (source "L3 acquisition", metadata.approved_lead) + graph_processing_jobs
        ↓  scrape (story_id POST) → clean → graph-worker
stories.graph_status = succeeded  +  Document/Proposition in Aura
        ↓  next debate_pipeline tick → attach_approved_lead
(p)-[:CANDIDATE_FOR {method:'approved_lead'}]->(q)
        ↓  curator ADMIT (separate)
(p)-[:ANSWERS]->(q)
```

`DEBATE_REBUILD_MODE` does **not** block this chain. It only 503s / empties explore reads.

## 1. Mint the work item (`lead_requests`)

`enqueue_l3_reviews` (inside `debate_pipeline`, after apply + attach) runs this **only when bootstrap is false**:

```cypher
MATCH (q:Question)<-[a:ANSWERS]-(:Proposition)
WITH q, collect(DISTINCT a.polarity) AS pols
WHERE size(pols) = 1
```

Inserts `lead_requests` with `priority: 50`, `created_by: enqueue_l3_reviews`, `expected_counter_thesis: q.expectedCounterThesis`. Skips if that `question_uid` already has a `pending` or `claimed` row. Up to `min(limit, 40)` Questions per tick.

Bootstrap is on while `graph_questions` count &lt; 30, unless Edge secret `L3_BOOTSTRAP=false|0|off`. Post-bootstrap plan currently runs with that secret off — [post-bootstrap-plan.md](../integrations/grok-bots/post-bootstrap-plan.md).

Schema: migration `20260829180315_l3_approval_leads.sql`. States: `pending` → `claimed` → `fulfilled` | `cancelled`. Expired claims (`claimed_until &lt; now()`) return to `pending` inside `claim_lead_request`.

## 2. Bot submits a URL (MCP)

Production MCP: `POST /api/mcp/l3` with `Authorization: Bearer <DOXA_MCP_TOKEN>`. Shared `grok` kind exposes acquisition tools; a dedicated `acquisition` kind is narrower.

| Tool | Who | What |
|------|-----|------|
| `claim_lead_request` | `grok`, `acquisition`, `admin` | RPC lease. Body `{ limit? }` (1–5). Returns `{ items: [...] }`. |
| `submit_lead_candidate` | same | Inserts `l3_proposals` `kind: lead_candidate`, `status: pending_approval`. Required: `url`, `question_uid`. Optional: `lead_request_id`, `title`, `note`. |
| `submit_source_lead` | **`admin` only** | Deprecated twin (`kind: source_lead`). Same pending-approval path. Prefer `submit_lead_candidate`. |
| `list_onesided_questions` | **`admin` only** | Deprecated. Prefer `claim_lead_request`. |
| `submit_approval_verdict` | `grok`, `lead-reviewer`, `admin` | Same `recordApprovalDecision` as Slack (bots bypass the Slack user allowlist). |

`lead_request_id` is optional. If present, MCP checks the row exists, is not `fulfilled`/`cancelled`, and is not claimed by another `bot_id`, then sets `claimed` + `claimed_by_bot`. Submit without an id still notifies Slack (blind URL).

Both submit tools call `notifyPendingProposal` → Slack `#l3-approvals`. They **do not ingest**.

## 3. Human gate → ingest (not bind)

`source_lead` and `lead_candidate` are human-gated (`HUMAN_GATED_PROPOSAL_KINDS`). Approve path:

1. Slack / MCP / admin Apply sets proposal `validated`.
2. Invokes Edge `apply_l3_proposals` with `{ proposal_uid, force_apply_all: true }`.
3. Applier requires `payload.url` and `question_uid` (payload or row).
4. `ingestSourceLead(..., { approved: true })` then `enqueueGraphJob(story_id)`.
5. Proposal → `applied`. Matching `lead_requests` → `fulfilled`.

Reject (Slack reason ≥ 8 chars): proposal `rejected`, gold negative with `op_type: MINT_QUESTION` (same column as mint rejects — not a mint op), and if `payload.lead_request_id` is `claimed`, that request returns to `pending`.

### What ingest writes

`doxa-agents/lib/debate/source-lead.ts`:

- SSRF: public `http(s)` only. No credentials, no localhost/`.local`/`.internal`, no IPv6 literal, no private/reserved IPv4. Failures show in Slack as “Approved but apply failed” / `validator_errors`.
- Upserts `sources` named **`L3 acquisition`** (first insert stamps `domain` from this URL; later leads reuse that row even if the host differs).
- Upserts `stories` on `url` with `relevance_score: 75`, `l3_lead: true`, and when approved:

```json
{
  "approved_lead": {
    "question_uid": "cq:…",
    "lead_request_id": "… or null",
    "proposal_uid": "lead:grok:…"
  }
}
```

Approved upserts **overwrite** `stories.metadata` for that URL (`ignoreDuplicates: false`). Non-approved ingest (not used by apply) uses `ignoreDuplicates: true` and will not update an existing URL.

**Not set:** `relevance_status`. NewsAPI stories get `KEEP`/`PENDING`/`DROP` from the relevance gate. Acquisition rows stay `NULL`.

## 4. Scrape and graph (required before attach)

`apply_l3_proposals` enqueues `graph_processing_jobs` immediately. The Python worker then claims the job and **fails** with `Missing story or content_clean` if `story_bodies.content_clean` is empty (`services/graph-worker/app/jobs.py`).

The scrape **cron** will not save you: `claim_stories_for_scrape` only selects `relevance_status in ('KEEP', 'PENDING')`. Acquisition rows are `NULL`, so they never enter the batch claim.

**Operator scrape** — single-story POST bypasses that filter:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/scrape_story_content" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"story_id":"<uuid from ingest>"}'
```

Then wait for `receive_scraped_content` → `clean_scraped_content` (clean also `enqueueGraphJob`). The first graph job may already be `failed`; clean’s enqueue creates a new pending job unless one is still `running`. Admin Agent Flow on the story record is the same path.

Confirm `stories.graph_status = succeeded` and a Document in `/admin/neo/union?focus=document:{story_id}` before expecting attach to do anything.

## 5. Targeted bind (`attach_approved_lead`)

Runs **inside** hourly `debate_pipeline` **after** `apply_l3_proposals` and **before** `enqueue_l3_reviews`. Not a separate cron. JWT-off like the other debate steps.

Selects stories with `metadata->approved_lead` not null **and** `graph_status = succeeded`. Optional body: `{ dry_run, limit, story_id }` (`limit` 1–50, default 20). Orchestrator isolation does **not** forward `story_id` — POST this function directly to pin one story.

For each story:

1. Read `metadata.approved_lead.question_uid`. Empty → skip (not counted in `scanned`).
2. Load `:Question {uid}`. Missing node → **silent skip** (no error, no edge).
3. Load up to 40 debate-eligible propositions in that Document that do **not** already `ANSWERS` a Question.
4. Keep roles `thesis` or `premise` (`mayBeCandidateAnswer`).
5. Score with the same stack as `bind_candidates`: `maxAnswerCosine` vs pro/con/question embeddings, lexical NLI, floor `CANDIDATE_MIN_COSINE` **0.32** / strong **0.45**. `sharedEntity` is hardcoded `false` here.
6. `MERGE (p)-[:CANDIDATE_FOR]->(q)` with `method: "approved_lead"`.

Response: `{ ok, stories: scanned, bound }`. `dry_run` only counts eligible story rows.

Hourly pipeline `limit: 500` is clamped to **50** on this step.

## What this is not

| Nearby path | Difference |
|-------------|------------|
| `bind_candidates` | Global kNN over propositions, not “this approved URL → this Question”. |
| `sweep_counter_side` | Separate cron `50 */2 * * *`. Neo counter-thesis kNN for one-sided Questions. **Skipped in bootstrap.** Not in `debate_pipeline` `STEP_NAMES`. |
| Curator membership | `CANDIDATE_FOR` is a review hint. `ANSWERS` only after ADMIT. |
| Publish / `/home` | Still needs qualify + viewpoints + auditor pass. A bound lead does not open a controversy. |

## Isolation / debug POSTs

Service-role, JWT-off. See [pipeline-test-params.md](../doxa-agents/docs/pipeline-test-params.md).

```bash
# Preview how many succeeded approved-lead stories exist
curl -X POST "$SUPABASE_URL/functions/v1/attach_approved_lead" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true}'

# Bind one story after graph_status=succeeded
curl -X POST "$SUPABASE_URL/functions/v1/attach_approved_lead" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"story_id":"<uuid>"}'
```

Retry a validated lead that Slack already approved but apply failed:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/apply_l3_proposals" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"proposal_uid":"lead:grok:…","force_apply_all":true}'
```

Batch apply **without** `proposal_uid` or `force_apply_all` **skips** `source_lead` / `lead_candidate` rows. Hourly `debate_pipeline` does not set `force_apply_all`, so a stuck `validated` lead is **not** retried at `:15`. Use admin **Apply** or the curl above.

## Pitfalls

1. **Approve ≠ bound.** Slack “Approved and applied” means story + graph job. Edges wait for `graph_status=succeeded` and the next attach tick.
2. **`relevance_status` is null.** Scrape cron ignores the row. Dispatch `scrape_story_content` with `story_id`, or the graph job fails on missing `content_clean`.
3. **Silent Question miss.** Typo / wrong `question_uid` → attach scans the story, finds no `:Question`, writes nothing.
4. **Already `ANSWERS` or not debate-eligible.** Those propositions are excluded. `debateEligible: false` or an existing membership skips the bind.
5. **Cosine / NLI floor.** Weak lexical overlap against pro/con/question text will not bind even after a perfect scrape.
6. **Duplicate URL.** Re-approving the same URL overwrites `stories.metadata` (including `approved_lead`) and enqueues another graph job.
7. **SSRF.** Internal, metadata, or credentialed URLs fail ingest; proposal becomes `rejected` with the URL error.
8. **Bootstrap.** No new `lead_requests` (and no `sweep_counter_side`) while bootstrap is on. Existing pending requests can still be claimed.
9. **Acquisition prompt.** Grok can call the tools on the shared token, but there is no `doxa-agents/prompts/` file for the persona yet — treat backlog as optional until that prompt exists.
10. **Gold negatives.** Slack reject of a lead still inserts `l3_gold_negatives.op_type = MINT_QUESTION`. Do not read that table as “this was a mint.”
