# Admin: Analysis pipeline (L4)

Rebuildable overlay on an existing L3 graph: evidence checks, citations, controversy assessments, HELD_BY tracks, media-clip links, then Postgres projections for **Analyzed** UI and **`/people`**.

Department table: [analysis-pipeline README](../doxa-agents/departments/07-analysis-engine/analysis-pipeline/README.md). People details: [explore-people-profiles.md](./explore-people-profiles.md).

**No pg_cron.** Nothing in this department is scheduled. Invoke `analysis_pipeline` (or a single step) with service-role auth when you need a refresh.

## Intent vs debate

| | Debate (`debate_pipeline`) | Analysis (`analysis_pipeline`) |
|--|----------------------------|--------------------------------|
| Layer | L3 assembly (Questions, membership, viewpoints, disputes) | L4 overlay (checks, assessments, dossiers) |
| Writes L0–L2 atoms? | No | No — “Never rewrite L0–L1 utterance text” |
| Fills `graph_controversies`? | Yes (`project_debate_summaries`) | No |
| Fills `graph_people` / `graph_assessments`? | No | Yes |
| Cron | Hourly spine (Grok MCP for curator/editor/auditor) | **None** |
| Typical body | `{ limit, question_uid, dry_run }` | `{ limit, dry_run }` |

Run analysis **after** debates exist in Neo. Assessments on empty Questions are wasted. Person profiles need `Entity(kindHint=person)` plus debate links — empty `/people` is a missing **manual** `project_person_profiles` run, not a debate-projection miss.

## How to run

JWT-off. Deploy `analysis_pipeline` and each child with `--no-verify-jwt`. Needs `NEO4J_*` + `OPENAI_API_KEY` on the Edge functions (LLM steps).

```bash
curl -X POST "$SUPABASE_URL/functions/v1/analysis_pipeline" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":false,"limit":25}'
```

Orchestrator (`08-analysis-pipeline/handler.ts`) walks this list and **stops on first failure** (HTTP 500, `failed_at`):

1. `generate_evidence_check_candidates`
2. `run_evidence_checks`
3. `extract_citations`
4. `run_controversy_assessments`
5. `update_held_by_tracks`
6. `link_derived_media_clips`
7. `project_analysis_summaries`
8. `project_person_profiles`

`dry_run` is forwarded to every child. `limit` is forwarded only to the steps in `LIMIT_STEPS` (all of the above except `project_analysis_summaries`).

### Caps (orchestrator)

A large `limit` on the orchestrator cannot blow Edge idle timeout:

| Step | Cap |
|------|-----|
| `run_evidence_checks`, `run_controversy_assessments` | `min(limit, 25)` |
| `project_person_profiles` | `min(limit, 40)` |
| Other `LIMIT_STEPS` | `limit` as given (floored ≥ 1) |

Direct invoke of `project_person_profiles` defaults to **80** (handler `DEFAULT_LIMIT`). The orchestrator will never send more than 40. If `/people` is still thin after one orchestrator pass, invoke the projector alone.

## Step notes

| Deploy | What it writes | Isolation |
|--------|----------------|-----------|
| `generate_evidence_check_candidates` | Pending Decisions for Prop↔Segment | `limit`, `dry_run` |
| `run_evidence_checks` | LLM EvidenceCheck + Decision | `limit` (capped 25 in orchestrator) |
| `extract_citations` | Citation pointers (no verdict) | `limit` |
| `run_controversy_assessments` | Assessment + MethodRun | `controversy_uid`, `question_uid`, `limit` (capped 25) |
| `update_held_by_tracks` | Temporal Agent→Proposition | `limit` |
| `link_derived_media_clips` | Clip `DERIVED_FROM` parent asset | `limit` |
| `project_analysis_summaries` | Upsert Neo Assessments → `graph_assessments` | `dry_run` only (no `limit`) |
| `project_person_profiles` | Neo person entities → `graph_people` | `limit` (default 80 direct / 40 via orchestrator) |

Admin graph-controversies **Analyzed** labels read `graph_assessments`. Explore `/people` reads `graph_people`.

## Global vs Agent Flow Run

Analysis steps are `scope: global` in `pipeline-admin-catalog.yaml`. A story canvas **Run** still POSTs `{ story_id }` via `/api/admin/stories/[id]/run-step`. The analysis handlers ignore that field and run a batch. Use a direct Edge invoke when you want `limit` / `dry_run` / `controversy_uid`.

`wipe_l3_analytical` / `prune_oldest_documents` are not in this catalog. Do not expect them on the canvas.

## Pitfalls

- **No cron, empty Analyzed column:** run `analysis_pipeline` or `run_controversy_assessments` + `project_analysis_summaries`.
- **Empty `/people`:** run `project_person_profiles` (or the orchestrator). `project_debate_summaries` does not write `graph_people`.
- **Orchestrator 500 mid-chain:** later steps did not run. Read `failed_at` and retry from that deploy name.
- **Missing `NEO4J_*` on Edge:** projectors return 500; Explore stays empty even though Neo has people.
- **Expecting story isolation:** there is no `story_id` filter on these jobs.
