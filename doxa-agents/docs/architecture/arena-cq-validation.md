# Arena / contested-question grain — validation

**Status:** Implemented in handlers (schema 2.4.0). Aura + Edge deploy + `force_full` cutover are user-owned.  
**Steering:** [neo4j-graph-architecture.md](neo4j-graph-architecture.md)

## Dual axes

- **Controversy** = one contested question (CQ), titled from member theses — not `What are the competing views concerning {entity}?`
- **Arena** = Neo `Issue` node with uid `arena:{hash}` — assembly scope, size-capped
- **Person/topic browse** = `SUBJECT_OF` / `graph_controversy_subjects` — not Arena identity

## Cutover

1. Deploy JWT-off debate functions including `name_controversies` (see [generated/deploy.md](../generated/deploy.md)).
2. Apply migration `204_graph_controversy_subjects.sql`.
3. Re-run [`init_constraints.cypher`](../../../services/graph-worker/neo4j/init_constraints.cypher) on Aura (indexes only; `Issue.uid` constraint unchanged).
4. One-time: `POST debate_pipeline` with `{"force_full":true,"limit":50}`.
5. Expect uid churn: legacy `issue:ent:` / `issue:sim:` membership is stripped; Jaccard reuses `vp_` / `ctr_` where overlap ≥ 0.5.

## Checklist

- [ ] Pair candidates do **not** MERGE `IN_ISSUE` onto `issue:ent:{entityUid}`
- [ ] Accepted classify calls `assignArenaForPair` (`arena:` uids, size cap)
- [ ] `shared_entity` remains a blocking reason on pair Decisions only
- [ ] `assembleComponents` + `splitOversizedComponents` cap controversy sides / viewpoint props
- [ ] `name_controversies` writes Decision `controversy_title` and CQ `question`
- [ ] `(Entity)-[:SUBJECT_OF]->(Controversy)` projected to `graph_controversy_subjects`
- [ ] Same person yields multiple **differently worded** questions
- [ ] No Arena above `MAX_ARENA_PROPS` without a refused merge / sibling Arena
- [ ] `npx tsx scripts/test-debate-stable-identity.ts` passes
- [ ] `npx tsx scripts/test-debate-arena-assembly.ts` passes

## Time chapters

- [ ] Predecessor = **best Jaccard** among existing controversies in this Arena (even when score &lt; 0.5) — never “newest controversy in Arena”
- [ ] Evidence times snapshotted **before** `INCLUDES` delete; `Document.publishedAt` ISO strings parsed safely (no `.epochMillis` on strings)
- [ ] Fork only when predecessor score ∈ (0, 0.5) **and** evidence gap ≥ `CHAPTER_GAP_DAYS` (90)
- [ ] Below-threshold overlap with gap &lt; 90d **soft-reuses** the predecessor uid (same era; no orphan prune)
- [ ] Closed prior retained (`status=closed`, `supersededBy`, `closedAt`); not `DETACH DELETE`d
- [ ] No dangling `chapterOf` (target uid always exists)
- [ ] Home/trending lists filter `status = 'open'`; closed chapters remain reachable by `/c/{uid}`
- [ ] Apply migration `205_graph_controversy_chapter_status.sql` before projecting chapter status

## Success metrics

| Signal | Pass |
|--------|------|
| CQ titles | Distinct questions; no entity template as identity |
| Size caps | Split Decision / sibling Arena when over cap |
| Hub URLs | `/c/{ctr_uid}` stable when membership grows slowly (Jaccard ≥ 0.5) |
| Person hub | Lists CQs via `SUBJECT_OF` weight, not one Trump bucket |
