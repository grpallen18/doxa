# Graph controversies and the consumer publish gate

Operator runbook for **`/admin/graph-controversies`** and why Neo can show debates while `/home` is empty.

Projection writes `graph_controversies.status`. Explore reads **`open` only**. Do not hand-edit the column — re-run `project_debate_summaries` (or the hourly `debate_pipeline`).

Related: [admin-observability.md](./admin-observability.md) · [admin-l3-proposals-and-approval.md](./admin-l3-proposals-and-approval.md) · [admin-neo-explorer.md](./admin-neo-explorer.md) · [debate-pipeline README](../doxa-agents/departments/06-debate-engine/debate-pipeline/README.md) · [publishability.ts](../doxa-agents/lib/debate/publishability.ts)

## Intent

`project_debate_summaries` copies **established** Neo `Controversy` nodes into Postgres (`graph_controversies`, `graph_viewpoints`, evidence, questions). Two gates decide consumer visibility:

1. **Structural** — sides, sources, viewpoints (`evaluatePublishability`).
2. **Audit** — Neo `c.auditVerdict` must be `pass` the first time a row would become `open`.

Already-`open` rows skip the audit gate. A later `block` does **not** demote them. Structural failure or `existingStatus === "closed"` still takes them off the feed.

## Status matrix

| `status` | Meaning | Explore? |
|----------|---------|----------|
| `open` | Structurally complete and (if new) auditor-passed | Yes — `/home`, `/search`, `/c/[uid]` |
| `developing` | In Neo + Postgres, not publishable yet | No |
| `closed` | Historical chapter; projection preserves it | No |

`publish_block_reason` is set only while the row is held off the feed.

| Reason | Layer | Cause |
|--------|-------|--------|
| `insufficient_sides` | Structural | `sidesCount < 2` (Neo `INCLUDES` Viewpoint count) |
| `no_sources` | Structural | `sourceCount < 1` (distinct utterance `documentUid` via viewpoint → proposition) |
| `no_viewpoints` | Structural | Zero viewpoint rows in the same projection (`INCLUDES` → Viewpoint). Rare if `sidesCount` already passed — sides are counted in a separate Cypher |
| `audit_pending` | Audit | Structurally ok, first promotion, `auditVerdict` is null / `pending` / anything other than `pass` or `block` |
| `audit_blocked` | Audit | Structurally ok, first promotion, `auditVerdict === "block"` |
| `null` | — | Open, closed, or mid-write while an audit `pass` is being promoted |

Migration `207_graph_controversy_publish_gating.sql` documents the three structural reasons only. `audit_pending` / `audit_blocked` are written by the projection handler, not that CHECK comment.

Order: **closed** wins, then sides, then sources, then viewpoints. Closed rows get `publish_block_reason = null`.

## Who writes what

```text
qualify_controversies / editor  → Neo Controversy {status: 'established'}
run_l3_auditor (Grok or Edge)   → l3_proposals kind=audit (status submitted)
apply_l3_proposals              → Neo c.auditVerdict = pass | block
project_debate_summaries        → graph_controversies.status + publish_block_reason
explore + RLS                   → SELECT … WHERE status = 'open'
```

Isolation POST (service role / admin run-step):

```json
{ "controversy_uid": "ctr_…", "dry_run": true }
```

Empty `controversy_uid` projects every established controversy. `dry_run` skips writes.

Hourly `debate_pipeline` already ends with this step (`15 * * * *`, `{ "limit": 500, "skip_llm": true }`). Isolated re-project is enough after an auditor verdict lands.

## Audit path (not Slack)

`kind: "audit"` is **not** in `HUMAN_GATED_PROPOSAL_KINDS`. It starts as `submitted` and `apply_l3_proposals` writes Neo immediately. Slack `#l3-approvals` is for mint / leads only.

Live scheduler is Grok MCP. Edge `run_l3_auditor` cron is **off** — manual invoke only. The Edge picker requires `Controversy.status = 'established'`, `auditVerdict` null or `pending`, and **≥ 2 distinct viewpoint polarities** (limit default 8, clamp 1–20). Grok’s prompt is the same gate: `pass` publishes, `block` holds with `audit_blocked`.

## Admin UI

Nav: Admin Center → **Debate**. Client pages; APIs use `requireAdmin()` + service-role client (bypasses consumer RLS).

| Route | Behavior |
|-------|----------|
| `GET /api/admin/graph-controversies?status=` | `all` (default) / `open` / `developing` / `closed`. Newest 100. |
| `GET /api/admin/graph-controversies/[uid]` | Row + viewpoints + evidence documents + `graph_assessments` |
| `/admin/graph-controversies` | Status tabs; shows `publish_block_reason` next to the badge |
| `/admin/graph-controversies/[uid]` | Detail; **Open in Neo** → `/admin/neo/union?focus=controversy:{uid}` |
| `/admin/controversies`, `/admin/positions` | Redirect here |

The page does not apply proposals or flip status. L3 membership stays on `/admin/l3-proposals`. Assessments on the detail page are L4 (`analysis_pipeline`) — they do not open the debate.

## Explore + RLS

`lib/explore/queries.ts` filters `.eq('status', 'open')` for trending and search. Home orders by `ranking_score` then `updated_at`.

Score (`doxa-agents/lib/debate/ranking.ts`): `sides * ln(1 + sources) * exp(-ageDays / 45)`. Developing / closed rows are stored with `ranking_score = 0`.

Migration 207 RLS: `anon` and `authenticated` can `SELECT` `graph_controversies` (and child viewpoint / evidence / topic-link / subject tables) only when `status = 'open'`.

`GET /api/explore/inventory` uses the **session** client, so `controversies` is an **open-only** count. Use the admin list (Developing tab) or Observability funnel for held rows.

`DEBATE_REBUILD_MODE=true` empties home/search/inventory regardless of status. See [ops-neo-graph-hygiene-and-rebuild.md](./ops-neo-graph-hygiene-and-rebuild.md).

## Observability gap

`/admin/observability` **Publish blocked** sums only `insufficient_sides` + `no_sources` + `no_viewpoints` (`lib/admin/observability-pipeline-counts.ts`). `audit_pending` and `audit_blocked` increment **developing** but **not** that tile. Check the Debate Developing tab before assuming the funnel is clean.

## Operator checklist (empty `/home`)

1. Rebuild flag off? (`DEBATE_REBUILD_MODE`)
2. Neo has `Controversy {status: 'established'}`? Union explorer — [admin-neo-explorer.md](./admin-neo-explorer.md)
3. Projection ran? Hourly orchestrator or `POST project_debate_summaries`
4. Admin Debate → **Developing**: read `publish_block_reason`
5. Structural reason → editor / qualify / graph-worker evidence, then re-project
6. `audit_pending` → Grok auditor (or invoke `run_l3_auditor`) then `apply_l3_proposals`, then re-project
7. `audit_blocked` → fix membership / question grain, clear or replace `auditVerdict` via a new audit proposal, then re-project
8. Open in admin but missing on home → session RLS or rebuild mode, not a projection miss

## Constraints

- Projection Cypher only matches `Controversy {status: 'established'}`. Draft / candidate overlays never reach Postgres.
- First-open audit `pass` writes `developing` then immediately upserts `open` in the same handler — operators should not see the intermediate row unless they query mid-invoke.
- Topic hubs need `link_graph_controversies_to_topics()` (projection calls it) **and** `TOPIC_HUB_DENSITY_BAR` (currently **1**) plus topic status `published` / `stable` / `under_review`.
- Admin list cap is **100**. Older developing rows drop off the default All tab.

## Pitfalls

- **Inventory looks empty, Debate list is full.** Inventory + explore are open-only. Developing rows are working as designed.
- **Funnel “Publish blocked” is 0, home is still empty.** Held rows may be `audit_pending` / `audit_blocked`.
- **Re-running the auditor after publish does nothing to the feed.** Already-`open` skips the audit gate.
- **Slack Approve will not publish a debate.** Audit is `submitted`, not `pending_approval`.
- **Hand-updating `status` in SQL.** Next projection overwrites it from Neo + the two gates.
- **`graph_hygiene` / wipe / prune** are not this gate. Wipe needs `{ confirm: "WIPE_L3" }` — [ops-neo-graph-hygiene-and-rebuild.md](./ops-neo-graph-hygiene-and-rebuild.md).
