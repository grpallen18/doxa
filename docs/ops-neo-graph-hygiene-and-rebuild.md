# Ops: Neo graph hygiene and L3 rebuild

Playbooks for Aura Free headroom, wiping the debate overlay, pausing the public product, and SQL purge. Department table: [graph-hygiene README](../doxa-agents/departments/05-business-operations/graph-hygiene/README.md). Gold labels: [docs/gold/README.md](./gold/README.md).

These steps are **JWT-off** (`requireInternalAuth` + service-role Bearer). Deploy with `--no-verify-jwt` (see [deploy.md](../doxa-agents/docs/generated/deploy.md)). Neo-touching Edge functions need **`NEO4J_*` on the function**, not only in Next.js.

`wipe_l3_analytical` and `prune_oldest_documents` are **not** in `pipeline-admin-catalog.yaml`. They do not appear as Agent Flow Run buttons. Invoke Edge directly or use the local scripts.

## Which tool

| Goal | Tool | Keeps |
|------|------|-------|
| Nightly health | `graph_hygiene` | Everything except orphans / stale SQL the prune step deletes |
| Aura Free ~200k node cap | `prune_oldest_documents` (dry-run first) | Newer documents + gold allowlist |
| Reset L3 debate, keep atoms | `wipe_l3_analytical` `{ confirm: "WIPE_L3" }` | L0–L2 Utterance / Proposition / Argument |
| Pause public explore | `DEBATE_REBUILD_MODE=true` on Vercel / `.env.local` | All graph data |
| Wipe **Postgres** pipeline tables | `SELECT public.purge_engine_data();` | `sources`, `users`, `topics`, `pipeline_runs`, `domain_throttle` — **not Neo** |

`graph_hygiene` orchestrates only: integrity audit → prune orphans → entity alias candidates → projection reconcile. It does **not** wipe L3 or prune oldest documents.

## Playbook: Aura node cap

Aura Free hard-stops near **200 000** nodes. Default target is **170 000**.

1. Check Observability Neo counts (`/admin/observability`) or run `graph_integrity_audit`.
2. Dry-run (default — omit `dry_run` or set `true`):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/prune_oldest_documents" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. Commit only after inspecting the candidate list:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/prune_oldest_documents" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":false,"limit":50,"target_nodes":170000}'
```

Local (reads `docs/gold/prune-allowlist.json` and gold proposition uids from `cq-propositions.csv`):

```bash
npx tsx scripts/prune-oldest-documents.ts --dry-run
npx tsx scripts/prune-oldest-documents.ts --commit --limit 80 --target 170000
# or: npm run prune:oldest-documents -- --dry-run
```

| Body / flag | Default | Notes |
|-------------|---------|-------|
| `dry_run` | **true** (`dry_run !== false`) | Must send `false` to delete |
| `limit` | Edge 50 (1–200); local script 80 | Documents considered this pass |
| `target_nodes` | 170 000 (min 50 000, max 200 000) | Stop when graph is at or below this |
| `protect_gold_props` | true | Extra exclude via `gold_prop_uids` / CSV |
| `exclude_uids` | merged with bundled allowlist | Document uids |

Prune deletes an older-first **Document subgraph** (`deleteDocumentSubgraph`). Shared L3 overlays on other documents are kept. Gold Document uids in `docs/gold/prune-allowlist.json` are never selected.

## Playbook: wipe L3 (keep atoms)

Use when rebuilding Questions / Viewpoints / Controversies / Disputes without re-ingesting stories.

```bash
# Inspect counts only
curl -X POST "$SUPABASE_URL/functions/v1/wipe_l3_analytical" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"WIPE_L3","dry_run":true}'

# Wipe Neo L3; optionally truncate Postgres projections / queues
curl -X POST "$SUPABASE_URL/functions/v1/wipe_l3_analytical" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"WIPE_L3","dry_run":false,"truncate_sql":true}'
```

Local equivalent: `npx tsx scripts/wipe-l3.ts` (needs `NEO4J_*` + `SUPABASE_*` in `.env.local`).

| Body | Effect |
|------|--------|
| Missing `confirm: "WIPE_L3"` | **400** — refuse |
| `dry_run: true` | Returns `{ before }` only |
| `truncate_sql: true` | Also deletes Postgres `graph_controversies`, `graph_viewpoints`, `graph_questions`, `l3_proposals`, `l3_review_queue`, `l3_runs`, Slack/approval tables, … (needs `SUPABASE_*` on the function) |

**Deletes (Neo):** `:Question`, `:Viewpoint`, `:Controversy`, `:Dispute`, leftover Arena `:Issue` (`uid` starts with `arena:` / `issue:`), L3 `Decision` types, Assessments targeting controversy/viewpoint/question, plus `ANSWERS` / `CANDIDATE_FOR` / `RELATES_TO` / `IN_ISSUE` / `SUBJECT_OF`. Question↔Question `VARIANT_OF` goes away with the Question nodes.

**Keeps:** Utterance / Proposition / Argument counts. HTTP **500** if those counts change (`atoms_preserved: false`). Proposition↔Proposition `VARIANT_OF` (L2 identity) is **not** deleted.

After wipe: seed gold if needed (`npx tsx scripts/seed-question-registry.ts`), then `debate_pipeline` / Grok L3. Set **`DEBATE_REBUILD_MODE=true`** on the Next.js app while Explore would otherwise show empty or half-built debates.

## Playbook: pause public debate (`DEBATE_REBUILD_MODE`)

`lib/debate-rebuild.ts` — exact string `true`.

| Surface | Behavior |
|---------|----------|
| `/home` | Maintenance banner; empty lists |
| `GET /api/explore/home` | `{ maintenance, controversies: [], topics: [] }` |
| `GET /api/explore/inventory` | Guidance message |
| `GET /api/explore/controversies/[uid]` | **503** `{ maintenance: true }` |
| `GET /api/explore/search` | `{ maintenance: true, results: [] }` |

Admin Observability, Stories, Neo, and L3 consoles keep working. Unset or any value other than `true` resumes the product.

Suggested order for a rebuild window:

1. Set `DEBATE_REBUILD_MODE=true` on Vercel and redeploy.
2. Dry-run then wipe L3 (`truncate_sql: true` if projections must match).
3. Re-seed gold / run `debate_pipeline` / Grok curator-editor-auditor.
4. Run `project_debate_summaries` (inside the orchestrator) until `graph_controversies.status = open`.
5. Unset rebuild mode.

## Playbook: SQL engine purge

```sql
SELECT public.purge_engine_data();
```

Generated from `doxa-agents/ops/purge-engine-tables.yaml` — [purge-engine.md](../doxa-agents/docs/generated/purge-engine.md). Truncates `stories`, `graph_*` projections, L3 queues, `graph_processing_jobs`, … **Does not touch Neo4j.** After a SQL-only purge, Aura still has Documents; after a Neo wipe, Postgres projections can still show old rows until `truncate_sql` or this function.

## Pitfalls

- **Forgot `NEO4J_*` on Edge:** wipe/prune/hygiene return 500 “Neo4j not configured”.
- **`graph_hygiene` ≠ wipe:** running the orchestrator will not clear Questions.
- **Prune without dry-run:** default is dry-run; sending `"dry_run": false` is required to delete. Local script needs `--commit`.
- **Gold documents disappear:** add their uids to `docs/gold/prune-allowlist.json` (copied to `doxa-agents/lib/neo4j/prune-allowlist.json` for Edge). Refresh the allowlist before a large prune.
- **Explore empty after wipe, rebuild flag off:** users hit 404/empty home. Keep `DEBATE_REBUILD_MODE=true` until projections are `open`.
- **`purge_engine_data()` then surprise re-ingest:** it deletes `stories`. Neo Documents for those URLs can remain until prune/wipe.
