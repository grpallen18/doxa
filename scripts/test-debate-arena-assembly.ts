/**
 * Arena uid + mega-merge split smoke tests.
 * Run: npx tsx scripts/test-debate-arena-assembly.ts
 */

import {
  ARENA_UID_PREFIX,
  arenaUidForPair,
  isLegacyIssueUid,
  resolveArenaUid,
} from "../doxa-agents/lib/debate/issue-assignment.ts";
import {
  assembleComponents,
  splitOversizedComponents,
  type RelEdge,
} from "../doxa-agents/lib/debate/assembly.ts";
import { rankingScore } from "../doxa-agents/lib/debate/ranking.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(!isLegacyIssueUid("arena:abc"), "arena not legacy");
assert(isLegacyIssueUid("issue:ent:foo"), "entity issue is legacy");
assert(arenaUidForPair("b", "a") === arenaUidForPair("a", "b"), "pair uid commutative");
assert(arenaUidForPair("a", "b").startsWith(ARENA_UID_PREFIX), "arena prefix");
assert(
  resolveArenaUid({ entityUid: "ent:trump" } as { topicKey?: string }).startsWith(ARENA_UID_PREFIX),
  "resolve ignores missing pair"
);
assert(
  resolveArenaUid({ a: "p1", b: "p2" }) === arenaUidForPair("p1", "p2"),
  "pair seed"
);

const edges: RelEdge[] = [
  { a: "v1", b: "v2", kind: "oppose", decisionUid: "d1", topicKey: "t" },
  { a: "v2", b: "v3", kind: "oppose", decisionUid: "d2", topicKey: "t" },
  { a: "v3", b: "v4", kind: "oppose", decisionUid: "d3", topicKey: "t" },
  { a: "v4", b: "v5", kind: "oppose", decisionUid: "d4", topicKey: "t" },
];
const comps = assembleComponents(edges, (k) => k === "oppose");
assert(comps.length === 1 && comps[0].memberIds.length === 5, "one component of 5");
const split = splitOversizedComponents(comps, edges, 3);
assert(split.length >= 2, "mega-merge split");
assert(split.every((c) => c.memberIds.length <= 3), "parts respect cap");

const fresh = rankingScore({
  sidesCount: 3,
  sourceCount: 10,
  updatedAt: new Date(),
});
const stale = rankingScore({
  sidesCount: 3,
  sourceCount: 10,
  updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
});
assert(fresh > stale, "decay lowers old debates");

console.log("ok: arena-assembly");
