/**
 * Assign/merge Arena (Issue) membership for an accepted proposition pair.
 * Entity affinity is not used as the uid; oversized merges are refused.
 */

import { runCypher } from "../neo4j/session.ts";
import {
  ARENA_SCHEMA_VERSION,
  ARENA_UID_PREFIX,
  LEGACY_ISSUE_PREFIX,
  MAX_ARENA_PROPS,
  arenaUidForPair,
  isLegacyIssueUid,
} from "./issue-assignment.ts";

export type ArenaAssignment = {
  issueUid: string;
  mergedFrom: string[];
  created: boolean;
};

type PairArenaRow = { prop: string; arena: string | null; size: number };

type PairArenas = {
  arenasA: string[];
  arenasB: string[];
  sizes: Map<string, number>;
};

/**
 * Arena membership + sizes for both propositions in one round trip. Edge CPU
 * budget is the binding constraint here, so per-pair queries stay batched.
 */
async function loadPairArenas(a: string, b: string): Promise<PairArenas> {
  const rows = await runCypher<PairArenaRow>(
    `
    UNWIND $uids AS uid
    MATCH (p:Proposition {uid: uid})
    OPTIONAL MATCH (p)-[:IN_ISSUE]->(i:Issue)
    WHERE i.uid STARTS WITH $prefix
    OPTIONAL MATCH (i)<-[:IN_ISSUE]-(q:Proposition)
    RETURN p.uid AS prop, i.uid AS arena, count(DISTINCT q) AS size
    `,
    { uids: a === b ? [a] : [a, b], prefix: ARENA_UID_PREFIX }
  );
  const arenasA: string[] = [];
  const arenasB: string[] = [];
  const sizes = new Map<string, number>();
  for (const row of rows) {
    if (!row.arena) continue;
    sizes.set(row.arena, Number(row.size) || 0);
    if (row.prop === a && !arenasA.includes(row.arena)) arenasA.push(row.arena);
    if (row.prop === b && !arenasB.includes(row.arena)) arenasB.push(row.arena);
  }
  arenasA.sort();
  arenasB.sort();
  return { arenasA, arenasB, sizes };
}

/** Ensure the Arena, attach both props, and strip legacy `issue:` membership. */
async function attachPair(issueUid: string, a: string, b: string, topicKey: string): Promise<void> {
  await runCypher(
    `
    MERGE (iss:Issue {uid: $issueUid})
    ON CREATE SET
      iss.topicKey = $topicKey,
      iss.createdAt = datetime()
    // Preserve the original dirty timestamp so the rebuild queue stays FIFO.
    SET iss.dirtiedAt = CASE
          WHEN coalesce(iss.dirty, false) THEN coalesce(iss.dirtiedAt, datetime())
          ELSE datetime() END
    SET iss.dirty = true,
        iss.topicKey = coalesce(iss.topicKey, $topicKey),
        iss.schemaVersion = $schemaVersion,
        iss.updatedAt = datetime()
    WITH iss
    UNWIND $propUids AS uid
    MATCH (p:Proposition {uid: uid})
    MERGE (p)-[:IN_ISSUE]->(iss)
    WITH DISTINCT p
    OPTIONAL MATCH (p)-[legacy:IN_ISSUE]->(old:Issue)
    WHERE old.uid STARTS WITH $legacyPrefix AND old.uid <> $issueUid
    DELETE legacy
    `,
    {
      issueUid,
      propUids: a === b ? [a] : [a, b],
      topicKey,
      schemaVersion: ARENA_SCHEMA_VERSION,
      legacyPrefix: LEGACY_ISSUE_PREFIX,
    }
  );
}

async function combinedArenaSize(left: string, right: string): Promise<number> {
  const rows = await runCypher<{ n: number }>(
    `
    MATCH (p:Proposition)-[:IN_ISSUE]->(i:Issue)
    WHERE i.uid IN $uids
    RETURN count(DISTINCT p) AS n
    `,
    { uids: [left, right] }
  );
  return Number(rows[0]?.n) || 0;
}

async function mergeArenaInto(winnerUid: string, loserUid: string, topicKey: string): Promise<void> {
  if (winnerUid === loserUid) return;
  await runCypher(
    `
    MATCH (loser:Issue {uid: $loserUid})
    MATCH (winner:Issue {uid: $winnerUid})
    OPTIONAL MATCH (p:Proposition)-[r:IN_ISSUE]->(loser)
    WITH loser, winner, collect(DISTINCT p) AS props, collect(DISTINCT r) AS rels
    FOREACH (rel IN rels | DELETE rel)
    FOREACH (p IN props | MERGE (p)-[:IN_ISSUE]->(winner))
    WITH loser, winner, props
    // NULL placeholder keeps one row alive when the loser Arena had no props.
    UNWIND (CASE WHEN size(props) = 0 THEN [NULL] ELSE props END) AS moved
    OPTIONAL MATCH (moved)-[legacy:IN_ISSUE]->(old:Issue)
    WHERE old.uid STARTS WITH $legacyPrefix
    DELETE legacy
    WITH DISTINCT loser, winner
    OPTIONAL MATCH (v:Viewpoint {issueUid: loser.uid})
    SET v.issueUid = winner.uid, v.updatedAt = datetime()
    WITH DISTINCT loser, winner
    OPTIONAL MATCH (c:Controversy {issueUid: loser.uid})
    SET c.issueUid = winner.uid, c.updatedAt = datetime()
    // Inherit the oldest pending dirty timestamp so a merge cannot send
    // already-queued rebuild work to the back of the FIFO queue.
    WITH DISTINCT loser, winner,
         CASE WHEN coalesce(winner.dirty, false)
              THEN coalesce(winner.dirtiedAt, datetime()) END AS winnerDirtiedAt,
         CASE WHEN coalesce(loser.dirty, false)
              THEN coalesce(loser.dirtiedAt, datetime()) END AS loserDirtiedAt
    SET winner.dirtiedAt = CASE
          WHEN winnerDirtiedAt IS NULL AND loserDirtiedAt IS NULL THEN datetime()
          WHEN winnerDirtiedAt IS NULL THEN loserDirtiedAt
          WHEN loserDirtiedAt IS NULL THEN winnerDirtiedAt
          WHEN loserDirtiedAt < winnerDirtiedAt THEN loserDirtiedAt
          ELSE winnerDirtiedAt END
    SET winner.dirty = true,
        winner.topicKey = coalesce(winner.topicKey, $topicKey),
        winner.updatedAt = datetime()
    WITH loser
    WHERE NOT EXISTS { MATCH (loser)<-[:IN_ISSUE]-() }
    DETACH DELETE loser
    `,
    { winnerUid, loserUid, topicKey, legacyPrefix: LEGACY_ISSUE_PREFIX }
  );
}

/**
 * Place both propositions into a size-capped Arena and mark it dirty.
 * Returns the Arena uid used for this pair.
 */
export async function assignArenaForPair(input: {
  a: string;
  b: string;
  topicKey: string;
}): Promise<ArenaAssignment> {
  const { arenasA, arenasB, sizes } = await loadPairArenas(input.a, input.b);
  const smallest = (uids: string[]): string | undefined =>
    [...uids].sort((x, y) => (sizes.get(x) ?? 0) - (sizes.get(y) ?? 0))[0];
  const underCap = (uid: string) => (sizes.get(uid) ?? 0) < MAX_ARENA_PROPS;

  // Already together — reuse the smallest shared Arena.
  const shared = arenasA.filter((u) => arenasB.includes(u));
  if (shared.length) {
    const issueUid = smallest(shared)!;
    await attachPair(issueUid, input.a, input.b, input.topicKey);
    return { issueUid, mergedFrom: [], created: false };
  }

  // Both sides placed — merge when the union fits under the cap.
  if (arenasA.length && arenasB.length) {
    const left = smallest(arenasA)!;
    const right = smallest(arenasB)!;
    const sizeA = sizes.get(left) ?? 0;
    const sizeB = sizes.get(right) ?? 0;
    const winner = sizeA >= sizeB ? left : right;
    const loser = sizeA >= sizeB ? right : left;
    const combined = await combinedArenaSize(left, right);
    if (combined <= MAX_ARENA_PROPS) {
      await mergeArenaInto(winner, loser, input.topicKey);
      await attachPair(winner, input.a, input.b, input.topicKey);
      return { issueUid: winner, mergedFrom: [loser], created: false };
    }
    // Mega-merge guard: keep both Arenas; seed a sibling so this accepted
    // RELATES_TO is still visible to Arena-scoped assembly.
    const sibling = arenaUidForPair(input.a, input.b);
    await attachPair(sibling, input.a, input.b, input.topicKey);
    return { issueUid: sibling, mergedFrom: [], created: true };
  }

  // One side placed — join its smallest under-cap Arena rather than minting a
  // new one, which would strand the pair away from its existing neighbours.
  const placed = arenasA.length ? arenasA : arenasB;
  if (placed.length) {
    const target = smallest(placed.filter(underCap));
    if (target) {
      await attachPair(target, input.a, input.b, input.topicKey);
      return { issueUid: target, mergedFrom: [], created: false };
    }
  }

  // Nothing joinable — seed a fresh Arena for the pair.
  const issueUid = arenaUidForPair(input.a, input.b);
  await attachPair(issueUid, input.a, input.b, input.topicKey);
  return { issueUid, mergedFrom: [], created: true };
}

export function isLegacyIssue(uid: string): boolean {
  return isLegacyIssueUid(uid);
}
