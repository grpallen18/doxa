/**
 * Smoke tests for Jaccard stable-identity matching.
 * Run: npx tsx scripts/test-debate-stable-identity.ts
 */

import {
  assignStableUids,
  jaccard,
  STABLE_IDENTITY_JACCARD,
} from "../doxa-agents/lib/debate/stable-identity.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(jaccard(["a", "b"], ["a", "b"]) === 1, "identical sets");
assert(jaccard(["a", "b"], ["a", "c"]) === 1 / 3, "one shared of three union");
assert(jaccard([], []) === 1, "empty");

const assigned = assignStableUids(
  [
    { memberIds: ["p1", "p2", "p3"], topicKey: "t" },
    { memberIds: ["x"], topicKey: "t" },
  ],
  [{ uid: "vp_old", memberIds: ["p1", "p2", "p9"] }],
  "vp",
  STABLE_IDENTITY_JACCARD
);

assert(assigned[0].reused && assigned[0].uid === "vp_old", "jaccard reuse");
assert(!assigned[1].reused && assigned[1].uid.startsWith("vp_"), "new opaque uid");

console.log("ok: stable-identity");
