# Admin L3 proposals and Slack approval

Human gate for mint / lead proposals. Slack `#l3-approvals` is the daily inbox; **`/admin/l3-proposals`** is the override console.

Related: [grok-bot-architecture.md](../doxa-agents/docs/grok-bot-architecture.md) · [slack-l3-approvals README](../integrations/slack-l3-approvals/README.md) · [debate-pipeline README](../doxa-agents/departments/06-debate-engine/debate-pipeline/README.md)

## Intent

Grok (or an Edge worker) **proposes**; humans **approve or reject**; Edge `apply_l3_proposals` **writes Neo + Postgres**. The admin page can also accept/reject individual ops and revert an applied proposal. Slack cannot.

## Who hits `pending_approval`

`initialProposalStatus()` in `doxa-agents/lib/debate/proposal-ops.ts`:

| Condition | Initial status |
|-----------|----------------|
| Zero ops (“nothing to change”) | `submitted` (applier marks `no_op`) |
| Kind `mint`, `source_lead`, or `lead_candidate` | `pending_approval` |
| Any op `MINT_QUESTION` | `pending_approval` |
| Everything else | `submitted` |

`notifyPendingProposal` → `POST /api/slack/notify` only when status is **`pending_approval`**. Other statuses skip Slack (`status_<current>`).

## Status machine

```text
pending_approval ── Slack Approve / admin Apply ──► validated ── apply_l3_proposals ──► applied
                └── Slack/admin Reject ──► rejected (+ l3_gold_negatives)
submitted ── admin Validate / Apply, or Slack if still submitted ──► validated / applied
applied ── admin Revert ──► apply_l3_proposals { revert_proposal_uid }
```

Slack Approve sets `validated` then invokes apply with `{ proposal_uid, force_apply_all: true }`. Admin **Apply** does the same invoke without requiring a prior validate click. Admin **Mark validated** only writes Postgres `status=validated` (does not apply).

## Admin console (`/admin/l3-proposals`)

Nav: Admin Center → **L3**. Client page; APIs use `requireAdmin()`.

Loads:

- `GET /api/admin/l3-proposals?status=` — default **`pending_approval`**; `all` skips the filter; max **80** rows, newest first, nested `l3_proposal_ops`.
- `GET /api/admin/l3-metrics` — tiles (see below).

Filters: `pending_approval` · `submitted` · `validated` · `applied` · `rejected` · `all`.

Question uid (when present) links to `/admin/neo/union?focus=question:{uid}`.

### Actions (`POST /api/admin/l3-proposals`)

Body always includes `{ action, proposal_uid }`.

| Action | Extra | What it does |
|--------|-------|----------------|
| `apply` | — | Invokes Edge `apply_l3_proposals` with `force_apply_all: true` |
| `revert` | — | Invokes Edge with `{ revert_proposal_uid }` (shown only when status is `applied`) |
| `validate` | — | Sets proposal `validated` in Postgres |
| `accept_op` | `op_index` (number) | Sets that op `accepted` |
| `reject` + `op_index` | `question_uid?` | Rejects one op, writes `l3_gold_negatives` (`gold_negative: true`) |
| `reject` (no op) | `question_uid?` | Rejects proposal + all ops + gold negatives |

Per-op Accept/Reject and whole-proposal Apply/Validate/Reject only render when status is `submitted`, `validated`, or `pending_approval`.

**503** on apply/revert = missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`. **502** = Edge returned an error.

## Metrics caveats

`GET /api/admin/l3-metrics` (`app/api/admin/l3-metrics/route.ts`):

| Field | Actual meaning |
|-------|----------------|
| `queue.pending` / `leased` | `l3_review_queue.state` counts |
| `proposals.submitted` / `applied` / `rejected` | `l3_proposals` counts (no `pending_approval` tile) |
| `gold_negatives` | Row count in `l3_gold_negatives` |
| `foreign_member_rate` | **Proposal reject rate** `rejected / (applied + rejected)` — **not** a Neo foreign-member share. UI small text says “reject rate”. |
| `opposing_side_share` | Fraction of sampled `graph_questions` with `member_count ≥ 2` |
| `density` | From up to **500** `graph_questions` rows: q1 vs q2+, fragmentation (`questions / attached members`), mean `speaker_count` |

## Slack vs admin

| | Slack | Admin |
|--|-------|--------|
| Daily path | Yes — buttons on the card | Override / audit |
| Approve | One click → validate + apply whole proposal | Apply (or validate without apply) |
| Reject | Modal, reason ≥ **8** chars, not `reject`/`no`/`rejected` | One click; reason defaults to `admin_reject` |
| Per-op accept/reject | No | Yes |
| Revert applied | No | Yes |
| MCP parallel | `submit_approval_verdict` (`lib/l3/mcp-tools.ts`) uses the same `recordApprovalDecision`; `bot:*` users bypass the Slack allowlist | — |

Thread backup (same channel + `l3_slack_threads.slack_thread_ts`): `approve` / `yes` / `lgtm`; `reject: <reason>`. Bare `reject` is ignored. Bot messages and top-level channel chatter are ignored.

If the rich mint card fails, Slack posts a compact fallback; if that fails too, a failure alert with buttons + `/admin/l3-proposals` link.

## Tables touched

| Table | Role |
|-------|------|
| `l3_proposals` / `l3_proposal_ops` | Proposal + ops |
| `l3_review_queue` | Work the curator claims |
| `l3_slack_threads` | Card `thread_ts` for replies |
| `l3_approval_decisions` | Slack/MCP audit (`approver`, verdict, reason, payload snapshot) |
| `l3_gold_negatives` | Rejected ops / Slack rejects (training) |
| `lead_requests` | Slack reject of a lead with `payload.lead_request_id` resets `claimed` → `pending` |

## Env (Next.js)

| Variable | Required |
|----------|----------|
| `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` + `SLACK_APPROVAL_CHANNEL_ID` | Cards + thread handler (`slackConfigured()`) |
| `SLACK_OPS_CHANNEL_ID` | Run summaries (`#grok-ops`); else approvals channel |
| `SLACK_APPROVER_USER_IDS` | Comma-separated Slack user ids; empty = anyone |
| `SLACK_NOTIFY_SECRET` | Bearer for `/api/slack/notify` and run-summary routes (fallback: service role) |
| `DOXA_APP_URL` / `NEXT_PUBLIC_SITE_URL` | Links in failure cards |
| `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` | Apply / revert from admin **and** Slack approve |

Manifest request URLs in `integrations/slack-l3-approvals/manifest.json` point at **`https://doxa-two.vercel.app`**. Change them if you are not on that host.

## Pitfalls

- **No Slack card** — status is not `pending_approval`, Slack env incomplete, or notify Bearer wrong. Check notify `{ skipped: true, reason }`.
- **Approve then “apply failed”** — proposal is already `validated` but Neo/Postgres write failed. Retry **Apply** on the admin page after fixing Edge/`NEO4J_*`.
- **503 on Apply** — Next.js missing service role. Same as Observability run-step.
- **Allowlist 401-style “approver not allowlisted”** — Slack user id not in `SLACK_APPROVER_USER_IDS`.
- **Metrics “foreign member” looks wrong** — it is reject rate over applied+rejected, not graph membership.
- **Queue pending forever** — Grok not claiming; Edge `run_l3_*` crons are **off**. See Observability pitfalls.
