// Supabase Edge Function: build_viewpoints.
// Cluster theses inside (Question, polarity) via LLM key-point matching.
// Body: { dry_run?, limit?, question_uid?, controversy_uid?, force? }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { assignStableUids } from "../../../../lib/debate/stable-identity.ts";
import {
  clusterThesesIntoViewpoints,
  VIEWPOINT_SCHEMA_VERSION,
} from "../../../../lib/debate/viewpoint-cluster.ts";
import { ESTABLISH_MIN_CONFIDENCE } from "../../../../lib/debate/qualify-controversy.ts";

const DEFAULT_LIMIT = 15;
const PREMISE_CAP = 5;

type BucketRow = {
  questionUid: string;
  question: string;
  polarity: string;
  theses: Array<{ propUid: string; text: string }>;
  controversyUid: string | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);
  const questionUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";
  const controversyUid =
    typeof body.controversy_uid === "string" ? body.controversy_uid.trim() : "";

  const buckets = await runCypher<BucketRow>(
    `
    MATCH (q:Question)<-[a:ANSWERS]-(p:Proposition)
    WHERE ($questionUid = '' OR q.uid = $questionUid)
      AND coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'NONE'
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    WITH q, a.polarity AS polarity, collect(DISTINCT {
      propUid: p.uid,
      text: coalesce(p.text, p.normalizedText, '')
    }) AS theses
    WHERE size(theses) >= 2
    OPTIONAL MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q)
    WITH q, polarity, theses, head(collect(c.uid)) AS controversyUid
    WHERE $controversyUid = '' OR controversyUid = $controversyUid
    RETURN q.uid AS questionUid,
           q.question AS question,
           polarity,
           theses,
           controversyUid
    ORDER BY q.uid, polarity
    LIMIT $limit
    `,
    {
      questionUid,
      controversyUid,
      minConf: ESTABLISH_MIN_CONFIDENCE,
      limit: neoInt(limit),
    }
  );

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      bucket_count: buckets.length,
      thesis_total: buckets.reduce((s, b) => s + (b.theses?.length ?? 0), 0),
    });
  }

  await runCypher(
    `
    MATCH (v:Viewpoint)
    WHERE v.questionUid IS NOT NULL AND v.polarity IS NOT NULL
    WITH v
    MATCH (q:Question {uid: v.questionUid})<-[a:ANSWERS]-(p:Proposition)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity = v.polarity
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'NONE'
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    WITH v, count(DISTINCT p) AS thesisCount
    WHERE thesisCount < 2
    DETACH DELETE v
    `,
    { minConf: ESTABLISH_MIN_CONFIDENCE }
  );

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
  if (!apiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

  let viewpointsWritten = 0;
  let premisesLinked = 0;
  let reused = 0;
  const results: Array<{ questionUid: string; polarity: string; clusters: number }> = [];

  for (const bucket of buckets) {
    const theses = (bucket.theses ?? []).filter((t) => t.propUid && t.text?.trim());
    if (theses.length < 2) continue;

    const clusters = await clusterThesesIntoViewpoints(
      apiKey,
      { question: bucket.question, polarity: bucket.polarity, theses },
      model
    );
    if (!clusters.length) {
      await runCypher(
        `
        MATCH (v:Viewpoint {questionUid: $questionUid, polarity: $polarity})
        DETACH DELETE v
        `,
        { questionUid: bucket.questionUid, polarity: bucket.polarity }
      );
      continue;
    }

    const existing = await runCypher<{ uid: string; memberIds: string[] }>(
      `
      MATCH (v:Viewpoint {questionUid: $questionUid, polarity: $polarity})-[:ADVANCES]->(p:Proposition)
      RETURN v.uid AS uid, collect(DISTINCT p.uid) AS memberIds
      `,
      { questionUid: bucket.questionUid, polarity: bucket.polarity }
    );

    const assigned = assignStableUids(
      clusters.map((c) => ({
        memberIds: c.memberPropUids,
        topicKey: bucket.questionUid,
        edgeDecisionUids: [],
      })),
      existing,
      "vp"
    );

    const activeUids: string[] = [];
    const touchVpUids = [
      ...new Set([
        ...assigned.map((a) => a.uid),
        ...existing.map((e) => e.uid),
      ]),
    ];

    if (touchVpUids.length) {
      await runCypher(
        `
        UNWIND $uids AS uid
        MATCH (v:Viewpoint {uid: uid})-[r:ADVANCES]->()
        DELETE r
        `,
        { uids: touchVpUids }
      );
      await runCypher(
        `
        UNWIND $uids AS uid
        MATCH (:Proposition)-[r:SUPPORTS_VIEWPOINT]->(v:Viewpoint {uid: uid})
        DELETE r
        `,
        { uids: touchVpUids }
      );
    }

    for (let i = 0; i < assigned.length; i++) {
      const comp = assigned[i];
      const cluster = clusters[i];
      if (!cluster) continue;
      activeUids.push(comp.uid);
      if (comp.reused) reused += 1;

      const label =
        cluster.keyPoint.length > 96 ? `${cluster.keyPoint.slice(0, 93)}…` : cluster.keyPoint;

      await runCypher(
        `
        MERGE (v:Viewpoint {uid: $uid})
        SET v.keyPoint = $keyPoint,
            v.label = $label,
            v.summary = $summary,
            v.polarity = $polarity,
            v.questionUid = $questionUid,
            v.memberCount = $memberCount,
            v.schemaVersion = $schemaVersion,
            v.updatedAt = datetime(),
            v.createdAt = coalesce(v.createdAt, datetime())
        WITH v
        UNWIND $memberIds AS mid
        MATCH (p:Proposition {uid: mid})
        MERGE (v)-[:ADVANCES]->(p)
        `,
        {
          uid: comp.uid,
          keyPoint: cluster.keyPoint,
          label,
          summary: cluster.summary,
          polarity: bucket.polarity,
          questionUid: bucket.questionUid,
          memberCount: comp.memberIds.length,
          schemaVersion: VIEWPOINT_SCHEMA_VERSION,
          memberIds: comp.memberIds,
        }
      );

      if (bucket.controversyUid) {
        await runCypher(
          `
          MATCH (c:Controversy {uid: $controversyUid})
          MATCH (v:Viewpoint {uid: $vpUid})
          MERGE (c)-[:INCLUDES]->(v)
          `,
          { controversyUid: bucket.controversyUid, vpUid: comp.uid }
        );
      }

      viewpointsWritten += 1;
    }

    await runCypher(
      `
      MATCH (v:Viewpoint {questionUid: $questionUid, polarity: $polarity})
      WHERE NOT v.uid IN $activeUids
      DETACH DELETE v
      `,
      {
        questionUid: bucket.questionUid,
        polarity: bucket.polarity,
        activeUids: activeUids.length ? activeUids : ["__none__"],
      }
    );

    const premiseRows = await runCypher<{ vpUid: string; premiseUid: string }>(
      `
      UNWIND $vpUids AS vpUid
      MATCH (v:Viewpoint {uid: vpUid})-[:ADVANCES]->(thesis:Proposition)
      MATCH (thesis)<-[:EXPRESSES]-(u:Utterance)
      MATCH (premise:Proposition)<-[:EXPRESSES]-(u2:Utterance)
      WHERE u2.documentUid = u.documentUid
        AND premise <> thesis
        AND (
          EXISTS { MATCH (:Argument)-[:HAS_ROLE]->(premise) }
          OR coalesce(premise.debateRole, '') = 'premise'
        )
      WITH v, premise, count(DISTINCT u) AS weight
      ORDER BY v.uid, weight DESC
      WITH v, collect(DISTINCT premise.uid)[0..$cap] AS premiseUids
      UNWIND premiseUids AS pid
      RETURN v.uid AS vpUid, pid AS premiseUid
      `,
      { vpUids: activeUids, cap: neoInt(PREMISE_CAP) }
    );

    for (const row of premiseRows) {
      await runCypher(
        `
        MATCH (v:Viewpoint {uid: $vpUid})
        MATCH (p:Proposition {uid: $premiseUid})
        MERGE (p)-[:SUPPORTS_VIEWPOINT]->(v)
        `,
        { vpUid: row.vpUid, premiseUid: row.premiseUid }
      );
      premisesLinked += 1;
    }

    results.push({
      questionUid: bucket.questionUid,
      polarity: bucket.polarity,
      clusters: assigned.length,
    });
  }

  return json({
    ok: true,
    bucket_count: buckets.length,
    viewpoints_written: viewpointsWritten,
    premises_linked: premisesLinked,
    reused,
    buckets: results,
  });
};
