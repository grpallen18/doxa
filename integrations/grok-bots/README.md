# Wire Grok bots to Doxa L3 MCP

Grok bots talk to Doxa over **HTTPS MCP** at `/api/mcp/l3`. They do **not** join Slack — human approval stays in `#l3-approvals`.

## 1. Generate tokens (once per environment)

```bash
npx tsx scripts/generate-l3-mcp-tokens.ts
```

This:

- Upserts `l3_bots` rows in Supabase (SHA-256 hashes only)
- Writes **`integrations/grok-bots/mcp-tokens.local.env`** (gitignored) with one bearer token per bot

Re-running **rotates** tokens — update every xAI connector after.

## 2. MCP endpoint

| Field | Value |
|-------|--------|
| URL | `https://doxa-two.vercel.app/api/mcp/l3` |
| Auth | `Authorization: Bearer <token from mcp-tokens.local.env>` |
| Protocol | JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) |

Prod must be deployed (Vercel). Local `npm run dev` works for testing with ngrok if needed.

## 3. One xAI Grok per persona

Create **five separate** Grok custom bots (or agents) in the [xAI console](https://console.x.ai/). Each gets its **own** MCP server connector and **its own** bearer token.

| Grok persona | `bot_id` | Token env key | Role |
|--------------|----------|---------------|------|
| **Curator** | `curator` | `CURATOR_MCP_TOKEN` | Claim review batches; submit MINT/ADMIT/MERGE proposals |
| **Editor** | `editor` | `EDITOR_MCP_TOKEN` | Submit viewpoint proposals |
| **Auditor** | `auditor` | `AUDITOR_MCP_TOKEN` | Submit audit verdicts (publish gate) |
| **Lead reviewer** | `lead-reviewer` | `LEAD_REVIEWER_MCP_TOKEN` | Submit approval verdicts (Phase 8 — after enough Slack history) |
| **Acquisition** | `acquisition` | `ACQUISITION_MCP_TOKEN` | Claim `lead_requests`; submit URL candidates (post-bootstrap) |

**Skip for now:** `provenance` (empty tool allowlist — Phase 11).

### xAI connector settings (each bot)

1. **Tools → Add MCP server** (or equivalent in your xAI UI)
2. **Server URL:** `https://doxa-two.vercel.app/api/mcp/l3`
3. **Authentication:** Bearer token — paste the matching `*_MCP_TOKEN` from `mcp-tokens.local.env`
4. Save and enable the connector for that Grok

### System prompts (paste into xAI — not optional)

MCP tool descriptions are one-liners; **`get_*_dossier` returns graph data only** (members, utterance excerpts, polarities). It does not include audit rules or JSON schemas.

Edge workers (`run_l3_curator`, etc.) inject prompts from code automatically. **Grok must get the full rubric in its system instructions.**

Copy the entire contents of the matching file into each Grok's system prompt:

| Grok persona | Canonical prompt file | MCP workflow |
|--------------|----------------------|--------------|
| **Curator** | [`doxa-agents/prompts/l3-curator.md`](../../doxa-agents/prompts/l3-curator.md) | `claim_review_batch` → read dossiers → `submit_membership_proposal`. MINT ops go to Slack approval. |
| **Editor** | [`doxa-agents/prompts/l3-editor.md`](../../doxa-agents/prompts/l3-editor.md) | Read question/controversy dossier → `submit_viewpoint_proposal`. |
| **Auditor** | [`doxa-agents/prompts/l3-auditor.md`](../../doxa-agents/prompts/l3-auditor.md) | `get_controversy_dossier` → `submit_audit_verdict`. **No queue-claim tool** — you must supply a `controversy_uid`, or rely on `run_l3_auditor` cron until a list-pending MCP tool exists. |
| **Lead reviewer** | *(Phase 8 — no prompt file yet)* | Use dossier reads + `submit_approval_verdict`. Train on human Slack decisions in `l3_approval_decisions`. |
| **Acquisition** | *(no prompt file yet)* | `claim_lead_request` → find URL → `submit_lead_candidate`. Do not mint questions or analyze the corpus. |

The Edge workers use runtime copies in [`doxa-agents/lib/debate/prompts.ts`](../../doxa-agents/lib/debate/prompts.ts) (`CURATOR_SYSTEM`, `EDITOR_SYSTEM`, `AUDITOR_SYSTEM`). They carry the **same rubric** as the `.md` files minus the MCP tool-workflow section and worked examples, so Grok and worker output stay comparable. **Edit both when you change a rule** — a rule in only one place makes the two paths diverge.

**Server validation** (`proposal-validator.ts`) enforces JSON shape (e.g. auditor must include `weakest_member_uid`, `cited_utterance_uids`, `reason`) but not semantic quality — the system prompt carries the rubric.

## 4. Verify MCP auth

```bash
# Replace TOKEN with CURATOR_MCP_TOKEN from mcp-tokens.local.env
curl -s -X POST "https://doxa-two.vercel.app/api/mcp/l3" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect a JSON-RPC result listing curator tools (`claim_review_batch`, `submit_membership_proposal`, …).

## 5. How Grok fits the pipeline

```text
Cron / enqueue → l3_review_queue
       ↓
Grok curator (MCP) OR run_l3_curator (Edge worker) → l3_proposals
       ↓
pending_approval → Slack card → you approve
       ↓
apply_l3_proposals → Neo4j Question
```

Grok proposes; **workers and applier execute**. Grok does not need to be online 24/7.

## 6. Fallback workers (no Grok required)

These Edge functions drain the same queues with an LLM when Grok is offline:

| Function | Cron (when enabled) |
|----------|---------------------|
| `run_l3_curator` | `l3-curator-every-20min` |
| `run_l3_editor` | (off during bootstrap) |
| `run_l3_auditor` | (off during bootstrap) |

Optional Supabase secrets for xAI API: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.

## Related

- [grok-bot-architecture.md](../../doxa-agents/docs/grok-bot-architecture.md)
- Canonical L3 prompts: [`doxa-agents/prompts/`](../../doxa-agents/prompts/)
- Tool allowlists: `lib/l3/mcp-allowlist.ts`
- Seed script (manual tokens): `scripts/seed-l3-bots.ts`
