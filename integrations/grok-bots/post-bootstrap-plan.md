# Post-bootstrap L3 plan (living)

Tracks cutover from mint-only bootstrap to full registry-first L3. Update this doc when ops decisions or pipeline behavior change.

**Last reviewed:** 2026-08-29

---

## Current posture

| Setting | Value |
|---------|--------|
| `L3_BOOTSTRAP` | `false` (manual cutover; not waiting for 30 projected questions) |
| Grok personas wired | **Curator only** (shared `grok` MCP token) |
| Curator Grok routine | membership → consolidate → **mint fill** (remaining batch capacity) |
| Spine cadence | `debate_pipeline` hourly (`:15`); `run_l3_curator` every 20m fallback |
| Publish path (editor / auditor) | **Edge workers only** (`run_l3_editor` `:35`, `run_l3_auditor` `:45`) — no Grok bots yet |

---

## Done

- [x] **`L3_BOOTSTRAP=false`** on edge functions (membership, consolidate, lead_requests enabled)
- [x] **Initial `debate_pipeline` kick** — bind, contrast seeds, apply decline backlog, enqueue full-mode reviews
- [x] **Curator Grok** — membership on ODNI + Iraq (both sides admitted); heavy mint decline churn; 1 mint submitted
- [x] **Mint approved in `#l3-approvals`** — “Have US consumer prices besides eggs become much lower since January 2025?”
- [x] **Run summaries (code)** — one Slack message per curator **session** (mint + membership + consolidate sections); **10-minute** lease rollup window (Vercel deploy pending)
- [x] **Curator Grok routine** aligned with edge worker claim order (membership → consolidate → mint)
- [x] **M2 deploy + cron** — `run_l3_editor` deployed; `l3-editor-hourly` scheduled
- [x] **M3 deploy + cron** — `run_l3_auditor` deployed (≥2 viewpoints gate); `l3-auditor-hourly` scheduled

---

## In flight (automatic — no manual pipeline runs)

These happen on cron unless blocked:

1. **`debate_pipeline`** (hourly `:15`) — apply membership + approved mint → qualify → apply viewpoints/audit → project
2. **`run_l3_editor`** (hourly `:35`) — viewpoint proposals for established controversies missing a side
3. **`run_l3_auditor`** (hourly `:45`) — audit pass/block when ≥2 viewpoints exist
4. **`run_l3_curator`** (every 20m) — drains queue if Grok is offline
5. **`enqueue_l3_reviews`** (inside pipeline) — dirty Questions, unbound clusters, lead_requests

**Do not** re-run `debate_pipeline` by hand unless debugging; hourly cron is the intended driver.

### Expected hourly timeline (steady state)

| Time | Function | Effect |
|------|----------|--------|
| `:15` | `debate_pipeline` | Apply proposals from prior hour; qualify; project |
| `:35` | `run_l3_editor` | Submit viewpoint proposals (4 buckets max default: 2 Q × 2 polarities) |
| `:45` | `run_l3_auditor` | Submit audit verdicts for controversies with viewpoints |
| *next* `:15` | `debate_pipeline` | Apply viewpoints + audit; flip to **`open`** if audit pass |

First live controversy lands **~2 hours** after membership applies and controversies establish (editor → apply → auditor → apply → project).

---

## Milestones

### M1 — Graph catches up

**Trigger:** next `debate_pipeline` after approved mint + submitted membership.

| Artifact | Expectation |
|----------|-------------|
| ODNI + Iraq Questions | **Established controversies** in Neo4j |
| Approved mint | New **Question** in Neo4j + `graph_questions` row |
| Postgres `graph_controversies` | Rows exist; status **`developing`** until M2–M3 |

### M2 — Viewpoints

**Status:** editor worker + Slack run summaries (deploy handlers + Vercel for `/api/slack/worker-run-summary`).

- Editor selects established controversies missing a viewpoint side (≥1 thesis @ 0.7+)
- **`#grok-ops` summary** after each editor cron run (no approval — auto-applies at `:15`)
- Proposals apply on the **next** `:15` pipeline

### M3 — Auditor pass → first live controversy

**Status:** auditor worker + Slack run summaries.

- Auditor runs when ≥2 viewpoints exist; **`#grok-ops` summary** shows pass/block + reason
- **No Slack approval** — verdicts auto-apply; **pass** enables **`open`** on next project
- **Block** holds controversy **`developing`** — review summary in `#grok-ops` (no reject button today)

### M4 — Steady-state curation

- Grok Curator: membership/consolidate first; mint fill on backlog (expect **low mint yield**)
- Mint still requires **`#l3-approvals`** human approve
- Declines apply automatically (`ops: []` → `no_op`)
- **`lead_requests`**: idle until Acquisition Grok or manual `submit_lead_candidate`

---

## Deferred / optional

| Item | Status | Notes |
|------|--------|-------|
| Deploy 10-minute summary window + worker summary routes | **Deferred** | Vercel deploy (`/api/slack/run-summary`, `/api/slack/worker-run-summary`) |
| Deploy editor + auditor handlers | **Done** | Includes Slack notify hook |
| Grok Editor / Auditor / Acquisition | **Not wired** | Edge workers cover editor + auditor |
| Stale viewpoint re-edit after membership churn | **Later** | Re-run editor when member set changes |
| Retire `detect_contrast_seeds` auto-mint | **Later** | See grok-bot-architecture retire checklist |
| Acquisition bot for `lead_requests` | **Optional** | Harmless backlog |

---

## Operational notes

### Slack run summaries

- One message per curator **session** (10-minute lease rollup)
- Sections: mint, membership, consolidate

### Mint queue volume

- High decline rate is **expected** (over-inclusive enqueue)
- Multiple mint claims per Grok session are normal (5 items per claim)

### Two-sided ≠ published

| Stage | Meaning |
|-------|---------|
| Two-sided (membership) | Both polarities have ANSWERS |
| Established | `qualify_controversies` overlay |
| Published (`open`) | Viewpoints + auditor pass + projection |

---

## Hourly cron map

| Cron | Function | Role |
|------|----------|------|
| `:15` | `debate_pipeline` | bind, apply, qualify, project |
| `*/20` | `run_l3_curator` | fallback curator |
| `:35` | `run_l3_editor` | viewpoint proposals |
| `:45` | `run_l3_auditor` | publish gate proposals |

Confirm schedules in Supabase (`schedule.sql` next to each step).

---

## Related

- [README.md](./README.md) — MCP wiring, bootstrap secret
- [l3-curator.md](../../doxa-agents/prompts/l3-curator.md) — curator rubric + MCP runbook
- [grok-bot-architecture.md](../../doxa-agents/docs/grok-bot-architecture.md) — long-term phases
