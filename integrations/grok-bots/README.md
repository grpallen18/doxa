# Wire Grok bots to Doxa L3 MCP

Grok bots talk to Doxa over **HTTPS MCP** at `/api/mcp/l3`. They do **not** join Slack — human approval stays in `#l3-approvals`.

## 1. Generate token (once per environment)

```bash
npx tsx scripts/generate-l3-mcp-tokens.ts
```

This:

- Upserts the shared `grok` row in `l3_bots` (SHA-256 hash only)
- Invalidates legacy per-persona MCP token hashes
- Writes **`integrations/grok-bots/mcp-tokens.local.env`** (gitignored) with `DOXA_MCP_TOKEN`

Re-running **rotates** the token — update your xAI MCP connector after.

## 2. MCP endpoint

| Field | Value |
|-------|--------|
| URL | `https://doxa-two.vercel.app/api/mcp/l3` |
| Auth | `Authorization: Bearer <DOXA_MCP_TOKEN>` |
| Protocol | JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) |

Prod must be deployed (Vercel). Local `npm run dev` works for testing with ngrok if needed.

## 3. One MCP connector, many Grok personas

Create **separate** Grok custom bots in the [xAI console](https://console.x.ai/) for each **persona** (Curator, Editor, Auditor, …). Each gets a **different system prompt**, but they all attach the **same MCP server** (`doxa`) with the **same** `DOXA_MCP_TOKEN`.

| Grok persona | System prompt | Typical MCP workflow |
|--------------|---------------|----------------------|
| **Curator** | [`doxa-agents/prompts/l3-curator.md`](../../doxa-agents/prompts/l3-curator.md) | `claim_review_batch` → read dossiers → `submit_membership_proposal`. MINT ops go to Slack approval. |
| **Editor** | [`doxa-agents/prompts/l3-editor.md`](../../doxa-agents/prompts/l3-editor.md) | Read question/controversy dossier → `submit_viewpoint_proposal`. |
| **Auditor** | [`doxa-agents/prompts/l3-auditor.md`](../../doxa-agents/prompts/l3-auditor.md) | `get_controversy_dossier` → `submit_audit_verdict`. **No queue-claim tool** — supply a `controversy_uid`, or rely on `run_l3_auditor` cron. |
| **Lead reviewer** | *(Phase 8 — no prompt file yet)* | Dossier reads + `submit_approval_verdict`. |
| **Acquisition** | *(no prompt file yet)* | `claim_lead_request` → find URL → `submit_lead_candidate`. |

**Skip for now:** `provenance` (empty tool allowlist — Phase 11).

The shared token authenticates as `bot_id` **`grok`** and exposes all debate-team MCP tools. Persona separation is **prompt-only** on the xAI side; proposals submitted via MCP are recorded as `bot_id: grok`.

### xAI connector settings

1. **Tools → Add MCP server** (name it e.g. `doxa`)
2. **Server URL:** `https://doxa-two.vercel.app/api/mcp/l3`
3. **Authentication:** Bearer — paste **`DOXA_MCP_TOKEN`** only (full string including `doxa_mcp_` prefix; do not add a second `Bearer`)
4. Attach this connector to every Grok persona that needs pipeline tools

### System prompts (paste into xAI — not optional)

MCP tool descriptions are one-liners; **`get_*_dossier` returns graph data only** (members, utterance excerpts, polarities). It does not include audit rules or JSON schemas.

Edge workers (`run_l3_curator`, etc.) inject prompts from code automatically. **Grok must get the full rubric in its system instructions.**

The Edge workers use runtime copies in [`doxa-agents/lib/debate/prompts.ts`](../../doxa-agents/lib/debate/prompts.ts) (`CURATOR_SYSTEM`, `EDITOR_SYSTEM`, `AUDITOR_SYSTEM`). They carry the **same rubric** as the `.md` files minus the MCP tool-workflow section and worked examples, so Grok and worker output stay comparable. **Edit both when you change a rule** — a rule in only one place makes the two paths diverge.

**Server validation** (`proposal-validator.ts`) enforces JSON shape (e.g. auditor must include `weakest_member_uid`, `cited_utterance_uids`, `reason`) but not semantic quality — the system prompt carries the rubric.

## 4. Verify MCP auth

```bash
# Replace TOKEN with DOXA_MCP_TOKEN from mcp-tokens.local.env
curl -s -X POST "https://doxa-two.vercel.app/api/mcp/l3" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect a JSON-RPC result listing all debate MCP tools (`claim_review_batch`, `submit_membership_proposal`, `submit_viewpoint_proposal`, …).

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
- Manual seed: `scripts/seed-l3-bots.ts` (`DOXA_MCP_TOKEN=...`)
