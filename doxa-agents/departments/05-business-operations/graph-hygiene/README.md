# Graph hygiene

Neo4j + projection maintenance: integrity audit, orphan prune, entity alias quarantine, projection reconcile.

Does not silently merge Entities/Propositions. Alias candidates stay `pending` until a Decision-backed merge.

| Step | Folder | Deploy | Notes |
|------|--------|--------|-------|
| graph-integrity-audit | [01-graph-integrity-audit](01-graph-integrity-audit/) | `graph_integrity_audit` | Counts + invariant failures |
| prune-orphans | [02-prune-orphans](02-prune-orphans/) | `prune_orphans` | Orphan Assessments/Decisions, stale SQL |
| entity-alias-candidates | [03-entity-alias-candidates](03-entity-alias-candidates/) | `entity_alias_candidates` | Near-duplicate Entity queue |
| projection-reconcile | [04-projection-reconcile](04-projection-reconcile/) | `projection_reconcile` | Neo vs `graph_*` |
| graph-hygiene | [05-graph-hygiene](05-graph-hygiene/) | `graph_hygiene` | Orchestrator |
| wipe-l3-analytical | [06-wipe-l3-analytical](06-wipe-l3-analytical/) | `wipe_l3_analytical` | One-shot L3 wipe (keep L0–L2); body `{ "confirm": "WIPE_L3" }` |
| label-cq-gold-batch | [07-label-cq-gold-batch](07-label-cq-gold-batch/) | `label_cq_gold_batch` | Draft-label gold worksheet rows (ops); body `{ "rows": [...] }` |
| seed-question-registry | [08-seed-question-registry](08-seed-question-registry/) | `seed_question_registry` | Optional Edge upsert; prefer `npx tsx scripts/seed-question-registry.ts` locally |
| prune-oldest-documents | [09-prune-oldest-documents](09-prune-oldest-documents/) | `prune_oldest_documents` | Older-first Document subgraph prune for Aura Free; default `dry_run: true`; local: `npx tsx scripts/prune-oldest-documents.ts` |

JWT-off (`requireInternalAuth`). Not in `activation.yaml` until scheduled. Every Neo-touching step needs **`NEO4J_*` on the Edge function** (not listed in generated `secrets.md` today — set them yourself).

## When to run

| Goal | Invoke |
|------|--------|
| Nightly health | `graph_hygiene` orchestrator (audit → prune orphans → alias candidates → projection reconcile) |
| Aura Free node cap (~200k) | `prune_oldest_documents` first with default `dry_run: true`, then `{ "dry_run": false }` |
| Reset debate overlay, keep atoms | `wipe_l3_analytical` |
| Rebuild people / assessments | `analysis_pipeline` (separate department; no cron) |

Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

## wipe-l3-analytical

Deletes Neo `:Question` / `:Viewpoint` / `:Controversy` / `:Dispute` / leftover Arena `:Issue`, L3 `Decision` types, and controversy/viewpoint/question `Assessment`s. **Keeps** Utterance / Proposition / Argument counts — HTTP **500** if those change.

```json
{ "confirm": "WIPE_L3", "dry_run": true, "truncate_sql": false }
```

- Missing `confirm: "WIPE_L3"` → **400**
- `dry_run: true` returns `{ before }` only
- `truncate_sql: true` also deletes Postgres projection / L3 queue tables (`graph_controversies`, `graph_viewpoints`, `graph_questions`, `l3_proposals`, `l3_review_queue`, `l3_runs`, …). Needs `SUPABASE_URL` + service role on the function.

Does **not** delete Proposition↔Proposition `VARIANT_OF` (L2 identity).

## prune-oldest-documents

Older-first Document subgraph delete for Aura headroom. Reuses `deleteDocumentSubgraph` (L3 overlays kept).

| Body | Default |
|------|---------|
| `dry_run` | **true** (`dry_run !== false`) |
| `limit` | 50 (clamp 1–200) |
| `target_nodes` | 170 000 (Aura Free cap 200 000) |
| `protect_gold_props` | true |
| `exclude_uids` | merged with `lib/neo4j/prune-allowlist.json` |

Local: `npx tsx scripts/prune-oldest-documents.ts`.
