// Supabase Edge Function: build_agreement_clusters.
// Hard-union same_family/agree edges; soft-attach qualify/broader/narrower.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { UnionFind } from "../../../../lib/topology/controversy-assembly.ts";
import { isCoreUnion, isSoftAttach, type PositionRelationshipKind } from "../../../../lib/topology/relationship-taxonomy.ts";
import { corsHeaders, json, sha256Hex } from "../../../../lib/topology/invoke-step.ts";

const MIN_AGREEMENT_SIZE = 2;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    /* defaults */
  }
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: relRows } = await supabase
    .from("position_relationships")
    .select("position_a_id, position_b_id, relationship_kind");

  const { data: posTopics } = await supabase
    .from("canonical_positions")
    .select("canonical_position_id, primary_topic_id")
    .not("primary_topic_id", "is", null);

  const topicByPos = new Map<string, string>();
  for (const r of posTopics ?? []) {
    topicByPos.set(r.canonical_position_id as string, r.primary_topic_id as string);
  }

  const uf = new UnionFind();
  const softAttachments: Array<{ positionId: string; anchorId: string; kind: PositionRelationshipKind }> = [];

  for (const r of relRows ?? []) {
    const a = r.position_a_id as string;
    const b = r.position_b_id as string;
    const kind = r.relationship_kind as PositionRelationshipKind;
    const ta = topicByPos.get(a);
    const tb = topicByPos.get(b);
    if (!ta || !tb || ta !== tb) continue;

    if (isCoreUnion(kind)) {
      uf.union(a, b);
    } else if (isSoftAttach(kind)) {
      softAttachments.push({ positionId: a, anchorId: b, kind });
      softAttachments.push({ positionId: b, anchorId: a, kind });
    }
  }

  const components = uf.getComponents();
  const agreementClusters: Array<{
    topic_id: string;
    core_position_ids: string[];
    attached_position_ids: string[];
    fingerprint: string;
  }> = [];

  for (const [, members] of components) {
    const core = [...new Set(members)];
    if (core.length < MIN_AGREEMENT_SIZE) continue;
    const topicId = topicByPos.get(core[0]);
    if (!topicId) continue;

    const coreSet = new Set(core);
    const attached = new Set<string>();
    for (const att of softAttachments) {
      if (coreSet.has(att.anchorId) && !coreSet.has(att.positionId)) {
        attached.add(att.positionId);
      }
    }

    const sortedCore = [...core].sort();
    const fingerprint = await sha256Hex(sortedCore.join("|"));
    agreementClusters.push({
      topic_id: topicId,
      core_position_ids: sortedCore,
      attached_position_ids: [...attached].sort(),
      fingerprint,
    });
  }

  if (dryRun) {
    return json({ ok: true, agreement_clusters: agreementClusters.length, dry_run: true });
  }

  const pClusters = agreementClusters.map((c) => ({
    fingerprint: c.fingerprint,
    topic_id: c.topic_id,
    core_position_ids: c.core_position_ids,
    attached_position_ids: c.attached_position_ids,
    canonical_position_ids: c.core_position_ids,
  }));

  const { error: agreeErr } = await supabase.rpc("upsert_agreement_clusters_batch", {
    p_clusters: pClusters,
  });
  if (agreeErr) {
    console.error("[build_agreement_clusters] upsert error:", agreeErr.message);
    return json({ error: agreeErr.message }, 500);
  }

  const { error: centroidErr } = await supabase.rpc("compute_agreement_centroids");
  if (centroidErr) {
    console.warn("[build_agreement_clusters] centroid error:", centroidErr.message);
  }

  return json({ ok: true, agreement_clusters: agreementClusters.length });
};
