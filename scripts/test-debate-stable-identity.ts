/**
 * Smoke tests for Jaccard stable-identity matching + time-chapter predecessors.
 * Run: npx tsx scripts/test-debate-stable-identity.ts
 */

import {
  assignStableUids,
  jaccard,
  STABLE_IDENTITY_JACCARD,
} from "../doxa-agents/lib/debate/stable-identity.ts";
import {
  evidenceGapDays,
  shouldForkTimeChapter,
} from "../doxa-agents/lib/debate/evidence-time.ts";
import { CHAPTER_GAP_DAYS } from "../doxa-agents/lib/debate/issue-assignment.ts";

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
assert(!assigned[0].predecessorUid, "reuse has no predecessor");
assert(!assigned[1].reused && assigned[1].uid.startsWith("vp_"), "new opaque uid");
assert(!assigned[1].predecessorUid, "zero overlap → no predecessor");

// Partial overlap below 0.5 → fresh uid + predecessor handoff
const miss = assignStableUids(
  [{ memberIds: ["a", "b", "c", "d"], topicKey: "t" }],
  [{ uid: "ctr_prior", memberIds: ["a", "z"] }],
  "ctr"
);
assert(!miss[0].reused && miss[0].uid.startsWith("ctr_"), "below-threshold gets new uid");
assert(miss[0].predecessorUid === "ctr_prior", "partial overlap returns predecessor");
assert(
  typeof miss[0].predecessorScore === "number" &&
    miss[0].predecessorScore! > 0 &&
    miss[0].predecessorScore! < STABLE_IDENTITY_JACCARD,
  "predecessor score in (0, 0.5)"
);

// When absolute best match was reused by another component, do not attach #2.
const contested = assignStableUids(
  [
    { memberIds: ["a", "b", "c"], topicKey: "t" }, // jaccard vs ctr_main = 1 → reuse
    { memberIds: ["a", "b", "x", "y"], topicKey: "t" }, // best is ctr_main (0.5) but taken; ctr_other weaker
  ],
  [
    { uid: "ctr_main", memberIds: ["a", "b", "c"] },
    { uid: "ctr_other", memberIds: ["x", "z"] },
  ],
  "ctr"
);
assert(contested[0].reused && contested[0].uid === "ctr_main", "first reuses best");
assert(!contested[1].reused, "second does not soft-claim taken uid");
assert(
  !contested[1].predecessorUid,
  "no second-best predecessor when absolute best was reused"
);

const day = 24 * 60 * 60 * 1000;
const t0 = Date.parse("2015-01-01T00:00:00.000Z");
const t1 = t0 + CHAPTER_GAP_DAYS * day;
assert(evidenceGapDays(t1, t0) === CHAPTER_GAP_DAYS, "gap days exact");
assert(evidenceGapDays(0, t0) === 0, "missing new evidence → no gap");
assert(evidenceGapDays(t1, 0) === 0, "missing prior evidence → no gap");

assert(
  shouldForkTimeChapter({
    predecessorUid: "ctr_prior",
    predecessorScore: 0.2,
    newEvidenceMs: t1,
    predecessorEvidenceMs: t0,
  }),
  "fork when score in (0,0.5) and gap >= 90d"
);
assert(
  !shouldForkTimeChapter({
    predecessorUid: "ctr_prior",
    predecessorScore: 0.2,
    newEvidenceMs: t0 + 30 * day,
    predecessorEvidenceMs: t0,
  }),
  "no fork when gap < 90d"
);
assert(
  !shouldForkTimeChapter({
    predecessorUid: null,
    predecessorScore: 0.2,
    newEvidenceMs: t1,
    predecessorEvidenceMs: t0,
  }),
  "no fork without predecessor"
);
assert(
  !shouldForkTimeChapter({
    predecessorUid: "ctr_prior",
    predecessorScore: 0,
    newEvidenceMs: t1,
    predecessorEvidenceMs: t0,
  }),
  "no fork at score 0"
);
assert(
  !shouldForkTimeChapter({
    predecessorUid: "ctr_prior",
    predecessorScore: 0.5,
    newEvidenceMs: t1,
    predecessorEvidenceMs: t0,
  }),
  "no fork at reuse threshold"
);

// Soft-reuse policy: below-threshold + short gap → keep prior uid (tested via fork=false).
assert(
  !shouldForkTimeChapter({
    predecessorUid: "ctr_prior",
    predecessorScore: 0.2,
    newEvidenceMs: t0 + (CHAPTER_GAP_DAYS - 1) * day,
    predecessorEvidenceMs: t0,
  }),
  "soft-reuse path: gap just under 90d does not fork"
);

console.log("ok: stable-identity + time-chapters");
