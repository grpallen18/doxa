# Cross-story Neo explorer — validation checklist

**Historical.** The live explorer is `/admin/neo/union` (3D) with `?focus=kind:uid`. Per-story and hub Sigma routes **redirect**. Node cap is **25 000**, not 400. Passage highlight lives only in the unmounted 2D stack.

Current operator runbook: [docs/admin-neo-explorer.md](../../../docs/admin-neo-explorer.md).

**Status:** Implemented (Admin UI + server Neo reads)  
**Steering:** [neo4j-graph-architecture.md](neo4j-graph-architecture.md)

Cross-story Neo is **hub-centered**, not a dump of every Document. Primary hub: Controversy. Secondary: Proposition / Entity.

## Preconditions

- At least one Controversy with evidence from **≥2** Documents (run `debate_pipeline` after multiple stories succeed on Graph)
- Admin session; `NEO4J_*` configured on the Next.js server
- Story Neo still works for a single `story_id`

## Checklist

- [ ] From `/admin/graph-controversies/[uid]`, **Open in Neo** navigates to `/admin/neo/hub/controversy/{uid}`
- [ ] Hub Sigma graph shows Controversy → Viewpoint → Proposition → Utterance → Document (filters may hide some kinds)
- [ ] Shared Propositions bridge multiple Document nodes (not N isolated story dumps)
- [ ] Selecting an Utterance loads that Document’s `content_clean` in the passage panel and highlights the span
- [ ] Document chip switcher changes the passage source without leaving the hub
- [ ] **Open story Neo** (header or node detail) lands on `/admin/neo/{documentUid}` with Reprocess intact
- [ ] Truncation surfaces when Cypher caps or Graphology 400-node cap apply (`truncated` in chrome)
- [ ] Proposition hub `/admin/neo/hub/proposition/{uid}` and Entity hub `/admin/neo/hub/entity/{uid}` load (ER/debug)
- [ ] Browser network panel shows only same-origin `/api/admin/neo/...` — **no Aura credentials** in the client
- [ ] **Story union** `/admin/neo/union`: auto-loads all succeeded stories; Refresh; Stories dropdown; passage follows selected utterance’s document

## Non-goals (do not fail checklist)

- Global Agent merge across documents
- Dump-all / corpus-wide force layout
- Editing Decisions from the explorer

## Unit smoke

```bash
npx tsx scripts/test-neo-graphology-adapter.ts
```
