# Doxa L3 Slack approvals

HTTP handlers live in the Next.js app (`/api/slack/events`, `/api/slack/interactions`, `/api/slack/notify`). This folder is the Slack CLI manifest only — not a Bolt process.

## Agent install (Phase 3)

```bash
slackcli login
cd integrations/slack-l3-approvals
slackcli install
```

This folder is a tiny Node project so the Slack CLI can detect a runtime (`package.json` + `hooks/`). Do not run `slackcli init` from the Doxa repo root — it can attach Slack hooks to the Next.js `package.json`.

The desktop Slack app already owns the `slack` command on Windows, so the developer CLI is installed as **`slackcli`**.

Then set `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APPROVAL_CHANNEL_ID` (`#l3-approvals`) in Vercel and `.env.local`. Optional: `SLACK_OPS_CHANNEL_ID` (`#grok-ops` — curator/editor/auditor **run summaries** land here), `SLACK_APPROVER_USER_IDS`, `SLACK_NOTIFY_SECRET`, `DOXA_APP_URL`.

**Run summaries** (informational, no buttons): `/api/slack/run-summary` (curator), `/api/slack/worker-run-summary` (editor + auditor). Edge workers ping these after each invoke. An empty editor/auditor scan includes `idle_note` so `#grok-ops` still gets a confirmation. Grok posts the same payload via MCP `report_editor_idle` / `report_auditor_idle`.

Enable Event Subscriptions only after `/api/slack/events` is deployed (URL verification).

**Reject flow:** the Reject button opens a Slack modal with a **required reason** (minimum 8 characters). Thread replies must use `reject: your reason` — bare `reject` is ignored. Approve stays one-click.

Operator walkthrough (status machine, admin vs Slack, tables, pitfalls): [docs/admin-l3-proposals-and-approval.md](../../docs/admin-l3-proposals-and-approval.md).

## Approval operations

`slackConfigured()` needs all three of `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APPROVAL_CHANNEL_ID`. Signature check allows **5 minutes** of clock skew (`verifySlackSignature`).

| Route | Auth | Body / trigger |
|-------|------|----------------|
| `POST /api/slack/notify` | Bearer `SLACK_NOTIFY_SECRET` or service role | `{ "proposal_uid" }` — posts only if status is `pending_approval` |
| `POST /api/slack/events` | Slack HMAC | URL verification + thread replies in the approval channel |
| `POST /api/slack/interactions` | Slack HMAC | `l3_approve` / `l3_reject` + modal `l3_reject_modal` |

**Approve** (`recordApprovalDecision`): allowed when proposal is `pending_approval` or `submitted`. Writes `l3_approval_decisions`, sets `validated`, invokes `apply_l3_proposals` with `force_apply_all: true`. Thread: “Approved and applied.” or “Approved but apply failed: …”.

**Reject:** reason ≥ 8 chars and not `reject` / `no` / `rejected` / `slack_button_reject`. Sets proposal `rejected`, `validator_errors.slack`, inserts `l3_gold_negatives` (`op_type: MINT_QUESTION`), and if `payload.lead_request_id` is `claimed`, resets that lead to `pending`.

**Allowlist:** `SLACK_APPROVER_USER_IDS` (comma-separated). Empty = all users. MCP `submit_approval_verdict` sends `slackUser: bot:<id>` and is always allowed.

**Card fallback:** rich mint card → compact card → failure alert with Approve/Reject + link to `/admin/l3-proposals`. `used_fallback: true` on the notify response means the compact path ran.

Manifest `request_url`s are hardcoded to `https://doxa-two.vercel.app`. Point Event Subscriptions and Interactivity at your `DOXA_APP_URL` if that is not the host.

**Admin difference:** Slack is whole-proposal only. Per-op accept/reject and revert live on `/admin/l3-proposals`.
