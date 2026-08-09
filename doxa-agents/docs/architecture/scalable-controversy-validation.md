# Scalable controversy assembly — validation

**Status:** Phase 1 implemented (Issue buckets, stable uids, dirty rebuild, classify-every-10min schedule)  
**Steering:** [neo4j-graph-architecture.md](neo4j-graph-architecture.md)

## Cutover

1. Apply Issue constraints/indexes from [`services/graph-worker/neo4j/init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura.
2. Deploy JWT-off functions:
   ```bash
   supabase functions deploy generate_proposition_pair_candidates --no-verify-jwt
   supabase functions deploy classify_proposition_relationships --no-verify-jwt
   supabase functions deploy build_viewpoints --no-verify-jwt
   supabase functions deploy build_controversies --no-verify-jwt
   supabase functions deploy debate_pipeline --no-verify-jwt
   supabase functions deploy project_debate_summaries --no-verify-jwt
   ```
3. Run `02-classify-proposition-relationships/schedule.sql` in SQL Editor (`classify-proposition-relationships-every-10min`).
4. One-time: `POST debate_pipeline` with `{"force_full":true,"limit":50}` so every Issue gets stable `vp_` / `ctr_` ids and projections refresh.
5. Expect one night of projection churn (old fingerprint `ctr:…` / `vp:…` rows go stale and are deleted by `project_debate_summaries`).

## Checklist

- [ ] New pair candidates create `Issue` + `IN_ISSUE` (shared_entity → `issue:ent:…`, knn → `issue:sim:…`)
- [ ] Accepted classify sets `Issue.dirty = true`
- [ ] Without `force_full`, `build_viewpoints` / `build_controversies` only touch dirty Issues
- [ ] No global `MATCH (:Viewpoint) DETACH DELETE` / controversy wipe outside Issue scope
- [ ] Growing membership reuses same `vp_` / `ctr_` when Jaccard ≥ 0.5
- [ ] Hub URL `/admin/neo/hub/controversy/{uid}` and `/admin/graph-controversies/{uid}` survive membership growth
- [ ] Admin redirect accepts `ctr_` as well as legacy `ctr:`
- [ ] Classify 10‑min cron drains `pending` pair candidates over hours
- [ ] `npx tsx scripts/test-debate-stable-identity.ts` passes

## Orphan Assessment cleanup (after cutover)

Old fingerprint Controversies may be deleted while L4 `Assessment` / `Decision` nodes remain without `ABOUT` targets. Optional Aura cleanup:

```cypher
MATCH (a:Assessment)
WHERE a.targetKind = 'controversy'
  AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
DETACH DELETE a;

MATCH (d:Decision)
WHERE d.decisionType STARTS WITH 'assess'
  AND NOT EXISTS { MATCH (d)-[:ABOUT]->() }
DETACH DELETE d;
```

Postgres `graph_assessments` rows for deleted controversy uids are not FK-cascaded; delete manually if needed:

```sql
DELETE FROM public.graph_assessments a
WHERE a.target_kind = 'controversy'
  AND NOT EXISTS (
    SELECT 1 FROM public.graph_controversies c WHERE c.uid = a.target_uid
  );
```

## Projections / assessments

- `project_debate_summaries` upserts by Neo uid text PK — stable ids stop row churn after cutover.
- `run_controversy_assessments` keys `assess:controversy:{uid}` — stable controversy uids preserve skip/reuse.

## Phase 2 (deferred)

Time chapters, title pass, mega-merge guard, classify worker off Edge — see architecture controversy contract follow-ons.
