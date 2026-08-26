// Supabase Edge Function: prune_oldest_documents.
// Older-first Document subgraph prune for Aura Free headroom.
// Body: { dry_run?, limit?, target_nodes?, protect_gold_props? }
// Reuses deleteDocumentSubgraph (shared L3 overlays kept).

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { deleteDocumentSubgraph } from "../../../../lib/neo4j/delete-document-subgraph.ts";
import pruneAllowlist from "../../../../lib/neo4j/prune-allowlist.json" with { type: "json" };

const DEFAULT_LIMIT = 50;
const DEFAULT_TARGET_NODES = 170_000;
const AURA_FREE_NODE_CAP = 200_000;

type DocRow = {
  uid: string;
  publishedAt: string | null;
  createdAt: string | null;
  localNodes: number;
};

function loadBundledAllowlist(): Set<string> {
  const uids = new Set<string>();
  const raw = pruneAllowlist as { document_uids?: string[] };
  for (const u of raw.document_uids ?? []) {
    if (typeof u === "string" && u.trim()) uids.add(u.trim());
  }
  return uids;
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    /* defaults */
  }

  const dryRun = body.dry_run !== false; // default true — require dry_run:false to commit
  const limit = clampInt(body.limit, 1, 200, DEFAULT_LIMIT);
  const targetNodes = clampInt(body.target_nodes, 50_000, AURA_FREE_NODE_CAP, DEFAULT_TARGET_NODES);
  const protectGoldProps = body.protect_gold_props !== false;

  const exclude = loadBundledAllowlist();
  if (Array.isArray(body.exclude_uids)) {
    for (const u of body.exclude_uids) {
      if (typeof u === "string" && u.trim()) exclude.add(u.trim());
    }
  }

  if (protectGoldProps && Array.isArray(body.gold_prop_uids)) {
    const props = (body.gold_prop_uids as unknown[])
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .slice(0, 500);
    if (props.length) {
      const linked = await runCypher<{ documentUid: string }>(
        `
        UNWIND $props AS puid
        MATCH (u:Utterance)-[:EXPRESSES]->(p:Proposition {uid: puid})
        WHERE u.documentUid IS NOT NULL
        RETURN DISTINCT u.documentUid AS documentUid
        `,
        { props }
      );
      for (const row of linked) {
        if (row.documentUid) exclude.add(row.documentUid);
      }
    }
  }

  const sizeRows = await runCypher<{ graphNodes: number }>(
    `OPTIONAL MATCH (n) RETURN count(n) AS graphNodes`
  );
  const graphNodes = Number(sizeRows[0]?.graphNodes ?? 0);

  if (graphNodes <= targetNodes) {
    return json({
      ok: true,
      dry_run: dryRun,
      skipped: true,
      reason: "already_at_or_below_target",
      graph_nodes: graphNodes,
      target_nodes: targetNodes,
      exclude_count: exclude.size,
    });
  }

  const excludeList = [...exclude];
  const candidates = await runCypher<DocRow>(
    `
    MATCH (d:Document)
    WHERE size($exclude) = 0 OR NOT d.uid IN $exclude
    OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
    OPTIONAL MATCH (u:Utterance {documentUid: d.uid})
    OPTIONAL MATCH (arg:Argument {documentUid: d.uid})
    WITH d,
         1 + count(DISTINCT seg) + count(DISTINCT u) + count(DISTINCT arg) AS localNodes
    RETURN d.uid AS uid,
           toString(coalesce(d.publishedAt, '')) AS publishedAt,
           toString(coalesce(d.createdAt, '')) AS createdAt,
           localNodes
    ORDER BY coalesce(d.publishedAt, d.createdAt, datetime('1970-01-01')) ASC
    LIMIT $limit
    `,
    { exclude: excludeList, limit: neoInt(limit) }
  );

  const estimatedFree = candidates.reduce((s, c) => s + (Number(c.localNodes) || 0), 0);

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      graph_nodes: graphNodes,
      target_nodes: targetNodes,
      candidate_count: candidates.length,
      estimated_local_nodes: estimatedFree,
      exclude_count: exclude.size,
      sample: candidates.slice(0, 10).map((c) => ({
        uid: c.uid,
        publishedAt: c.publishedAt,
        localNodes: c.localNodes,
      })),
    });
  }

  let deleted = 0;
  const deletedUids: string[] = [];
  for (const doc of candidates) {
    if (!doc.uid) continue;
    await deleteDocumentSubgraph(doc.uid);
    deleted += 1;
    deletedUids.push(doc.uid);

    const after = await runCypher<{ graphNodes: number }>(
      `OPTIONAL MATCH (n) RETURN count(n) AS graphNodes`
    );
    const nodesNow = Number(after[0]?.graphNodes ?? 0);
    if (nodesNow <= targetNodes) break;
  }

  const finalSize = await runCypher<{ graphNodes: number }>(
    `OPTIONAL MATCH (n) RETURN count(n) AS graphNodes`
  );

  return json({
    ok: true,
    dry_run: false,
    deleted,
    deleted_uids: deletedUids,
    graph_nodes_before: graphNodes,
    graph_nodes_after: Number(finalSize[0]?.graphNodes ?? 0),
    target_nodes: targetNodes,
    exclude_count: exclude.size,
  });
};
