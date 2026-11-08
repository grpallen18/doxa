# Admin: Agent records & prompt store

Operator page for one **catalog** pipeline step: `/admin/agents/[stepId]`. Profile copy, run history, and (when `prompt_kind: llm`) versioned system prompts live here.

There is **no** `/admin/agents` index. Open a record from Agent Flow: click the step title in the inspector (`components/admin/workflow-canvas/workflow-canvas-inspector.tsx`) or the agent icon on a story hub.

Related: [admin-story-extraction-review.md](./admin-story-extraction-review.md) · [pipeline-catalog.md](../doxa-agents/docs/generated/pipeline-catalog.md) · [pipeline-admin-catalog.yaml](../doxa-agents/ops/pipeline-admin-catalog.yaml)

---

## What is live today

| Surface | Status |
|---------|--------|
| Agent record (header, performance, workstation, run log) | **Live** for every step in the generated catalog |
| Display name / job title / bio overrides | **Live** (`admin_agent_display_names`) — used on the record and on the canvas |
| Prompt editor, version activate, schema sync, prompt audit | **Built**, but **hidden** — every overlay step currently defaults to `prompt_kind: none` |
| Edge `loadActivePrompt()` (`doxa-agents/lib/agent-prompts.ts`) | **Unused** — no handler imports it. Saving a prompt in admin would not change ingest/graph/debate/analysis until a handler loads the slot |
| Graph-worker utterance/proposition/argument prompts | **Not this store** — Python constants in `services/graph-worker/app/schema.py` (deploy the worker to change them) |
| Grok L3 curator / editor / auditor | **Not this store** — markdown in `doxa-agents/prompts/` plus MCP tools |

Claims extract/QA handlers that the original spec targeted (`extract-story-claims`, etc.) are **not** in the admin catalog. `getAgentDetail()` 404s any `stepId` missing from `lib/admin/generated/pipeline-catalog.ts`, so leftover `agent_prompt_slots` rows from old migrations are not editable in the UI.

---

## Agent record (`/admin/agents/[stepId]`)

`GET /api/admin/agents/[stepId]` (admin session). Page: `app/admin/agents/[stepId]/page.tsx`.

| Section | What it shows |
|---------|----------------|
| Header | Editable display name, job title, bio; last runtime / outcome; next cron (or `—` if the manifest step is inactive) |
| Performance & quality | Success/fail counts over the last 50 sampled runs, average duration, recent errors |
| Workstation | Catalog metadata: deploy name, stage, scope, `promptKind`, isolation params, timeout |
| Run log | Paginated runs (embed 10; `/runs` view-all 100) |
| Operating instructions | Only if `promptKind` is `llm` or `embeddings` (today: never, on catalog steps) |
| Prompt audit trail | Only if `promptKind` is `llm` |

Icons: `review-pending-stories` uses the person glyph; scrape uses the worker (orange) accent; other steps use the bot glyph.

Defaults for name / title / bio come from `lib/admin/agent-profile-copy.ts` (a few ingestion/graph/debate steps have custom copy; others get `"${stage} Pipeline Agent"`). Saving an override that matches the default **clears** the DB row.

### Profile API

`PATCH /api/admin/agents/[stepId]` with any of `displayName`, `jobTitle`, `bio` (`string` or `null` to revert that field).

| Field | Max length |
|-------|------------|
| `displayName`, `jobTitle` | 120 |
| `bio` | 500 |

Empty-after-trim is rejected. Canvas labels read `GET /api/admin/agents/display-names` (`display_name` only).

### Runs

`GET /api/admin/agents/[stepId]/runs` prefers `story_step_runs` for catalog steps; if that table is empty it falls back to `pipeline_runs` keyed by `deploy_name`. Stale scrape “looping” rows after a later terminal outcome are filtered out (`filterMisorderedStepRunRows`).

---

## Prompt store (built contract)

Postgres: slots + immutable versions + active pointer. Schema: `supabase/migrations/149_agent_prompt_store.sql` and `152_agent_prompt_response_schema.sql`.

```text
Admin UI  →  /api/admin/agents/[stepId]/prompt*
              →  agent_prompt_slots.active_version_id
              →  agent_prompt_versions (append-only)

Handler   →  loadActivePrompt(supabase, stepId)   # 60s isolate cache
              →  pipeline_runs.prompt_version_id   # intended provenance; unused today
```

Admin APIs require `requireAdmin()`. Writes go through the Next.js service client. RLS on prompt tables is service-role only.

### Catalog overlay: `prompt_kind`

Set on the **step** in `doxa-agents/ops/pipeline-admin-catalog.yaml`. Codegen (`npm run agents:pipeline-catalog`) copies it into `lib/admin/generated/pipeline-catalog.ts`. Omitted → `none`.

| `prompt_kind` | Record page |
|---------------|-------------|
| `none` (default) | No Operating instructions section |
| `embeddings` | “Uses embedding API only.” (no editor) |
| `llm` | Editable system prompt, versions, schema sync, audit |

`npm run agents:validate` **warns** (does not fail) if `prompt_kind: llm` has no entry in `doxa-agents/ops/agent-prompt-seeds.yaml`. That file is currently `seeds: {}` — bootstrap text belongs in a SQL migration, not a runtime YAML load. There is **no** `npm run agents:seed-prompts` script.

### Prompt APIs

| Method | Path | Body / query | Behavior |
|--------|------|--------------|----------|
| `GET` | `/api/admin/agents/[stepId]/prompt` | optional `?versionId=` | Slot + last 50 versions, or one version’s text |
| `POST` | `/api/admin/agents/[stepId]/prompt` | `{ systemPrompt, changeNote?, activate? }` | New version. `activate` defaults **true** (UI always sends true) |
| `POST` | `/api/admin/agents/[stepId]/prompt/activate` | `{ versionId }` | Point `active_version_id` at an existing version |
| `POST` | `/api/admin/agents/[stepId]/prompt/sync-schema` | none | Parse the **active** prompt’s OUTPUT JSON example → `response_json_schema` |
| `GET` | `/api/admin/agents/[stepId]/prompt/audit` | `limit` / `offset` / `view=all` | `admin_pipeline_actions` for that `step_id` |

**Save constraints** (`lib/admin/agent-prompt-store.ts`):

- Trimmed `systemPrompt` required; max **65536** characters
- SHA-256 of the trimmed text vs the active version → **409** `"No changes from active version"`
- Missing slot is created on first save (`step_id`, catalog `deployName` / `label`)
- Versions are never deleted. Rollback = activate an older `version_id` (audit type `prompt_version_rollback` when `version_number` goes down)

UI copy: the new version “takes effect on the next agent run (within ~60s)” — that is the **intended** isolate cache TTL in `loadActivePrompt`. It is not true for catalog steps today because handlers do not call the loader.

### Response schema sync

When a prompt has an OUTPUT JSON example that disagrees with the enforced schema (DB override, else the code default in `lib/admin/agent-prompt-schema-match.ts`), the UI shows an amber banner and can POST `sync-schema`.

Sync writes `agent_prompt_slots.response_json_schema` and logs `prompt_schema_synced`. The only code-default spec still listed is **`validate-chunk-claims`** — a deleted claims-QA step, not a catalog id. For a new `llm` step, ship a matching entry in `ENFORCED_OUTPUT_SPECS` **or** rely on the first successful sync.

Run-step (`POST /api/admin/stories/[id]/run-step`) also checks this mismatch **only if** `promptKind === 'llm'`. Today that branch never runs.

---

## Cut over a future LLM catalog step

Do this in order. Do not skip the handler change — admin Save alone is a no-op.

1. Add `prompt_kind: llm` (and optional `user_payload_doc`) on the step in `pipeline-admin-catalog.yaml`.
2. `npm run agents:refresh` (do not hand-edit `pipeline-catalog.ts`).
3. Insert `agent_prompt_slots` + version 1 in a migration (or paste v1 in the UI after overlay ships).
4. In `handler.ts`: `const prompt = await loadActivePrompt(supabase, "<step-id>")` and set `pipeline_runs.prompt_version_id`. **No silent fallback** to a code constant — missing slot/active version throws.
5. Deploy the Edge function (`supabase functions deploy <deploy_name>`; add `--no-verify-jwt` if that function is JWT-off).
6. Subsequent prompt edits do **not** need a redeploy (once step 4 is live).

User payload builders stay in handler code. The admin page only shows `user_payload_doc` read-only.

---

## Pitfalls

- **Editing a prompt does not change Grok or the graph-worker.** Those prompts are files + deploys.
- **Catalog `isolation_params` default to `[story_id]`** even on `scope: global` stages (codegen). That column in `pipeline-catalog.md` is not an invoke contract for debate/analysis. See [pipeline-test-params.md](../doxa-agents/docs/pipeline-test-params.md).
- **Approve QA** on Agent Flow is a leftover no-op (`workflow-canvas-page.tsx`). It is not a prompt or QA override.
- Prompt text is admin-only (same sensitivity as handler source). Do not expose these APIs to non-admin roles.
