// Supabase Edge Function: project_debate_summaries.
// Upsert Neo Controversy/Viewpoint summaries into Supabase projection tables.
// Env: SUPABASE_*, NEO4J_*. Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);

  const controversies = await runCypher<{
    uid: string;
    title: string;
    summary: string;
    sidesCount: number;
    topicKey: string;
  }>(
    `
    MATCH (c:Controversy)
    RETURN c.uid AS uid,
           coalesce(c.title, c.uid) AS title,
           coalesce(c.summary, '') AS summary,
           coalesce(c.sidesCount, 0) AS sidesCount,
           coalesce(c.topicKey, '') AS topicKey
    `
  );

  const viewpoints = await runCypher<{
    uid: string;
    controversyUid: string | null;
    label: string;
    summary: string;
    topicKey: string;
    memberCount: number;
  }>(
    `
    MATCH (v:Viewpoint)
    OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(v)
    RETURN v.uid AS uid,
           c.uid AS controversyUid,
           coalesce(v.label, v.uid) AS label,
           coalesce(v.summary, '') AS summary,
           coalesce(v.topicKey, '') AS topicKey,
           coalesce(v.memberCount, 0) AS memberCount
    `
  );

  const evidence = await runCypher<{
    controversyUid: string;
    documentUid: string;
    utteranceCount: number;
  }>(
    `
    MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)<-[:EXPRESSES]-(u:Utterance)
    RETURN c.uid AS controversyUid,
           u.documentUid AS documentUid,
           count(DISTINCT u) AS utteranceCount
    `
  );

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      controversies: controversies.length,
      viewpoints: viewpoints.length,
      evidence: evidence.length,
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  const ctrRows = controversies.map((c) => ({
    uid: c.uid,
    title: c.title,
    summary: c.summary,
    sides_count: Number(c.sidesCount) || 0,
    topic_key: c.topicKey,
    updated_at: now,
  }));

  if (ctrRows.length) {
    const { error } = await supabase.from("graph_controversies").upsert(ctrRows, {
      onConflict: "uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  const vpRows = viewpoints.map((v) => ({
    uid: v.uid,
    controversy_uid: v.controversyUid,
    label: v.label,
    summary: v.summary,
    topic_key: v.topicKey,
    member_count: Number(v.memberCount) || 0,
    updated_at: now,
  }));

  if (vpRows.length) {
    const { error } = await supabase.from("graph_viewpoints").upsert(vpRows, {
      onConflict: "uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  const evRows = evidence
    .filter((e) => e.controversyUid && e.documentUid)
    .map((e) => ({
      controversy_uid: e.controversyUid,
      document_uid: e.documentUid,
      utterance_count: Number(e.utteranceCount) || 0,
      updated_at: now,
    }));

  if (evRows.length) {
    const { error } = await supabase.from("graph_controversy_evidence").upsert(evRows, {
      onConflict: "controversy_uid,document_uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  // Purge projection rows no longer present in Neo.
  const ctrUids = ctrRows.map((r) => r.uid);
  const { data: existingCtr } = await supabase.from("graph_controversies").select("uid");
  const staleCtr = (existingCtr ?? [])
    .map((r) => r.uid as string)
    .filter((uid) => !ctrUids.includes(uid));
  if (staleCtr.length) {
    await supabase.from("graph_controversy_evidence").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_viewpoints").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_controversies").delete().in("uid", staleCtr);
  }

  const vpUids = vpRows.map((r) => r.uid);
  const { data: existingVp } = await supabase.from("graph_viewpoints").select("uid");
  const staleVp = (existingVp ?? [])
    .map((r) => r.uid as string)
    .filter((uid) => !vpUids.includes(uid));
  if (staleVp.length) {
    await supabase.from("graph_viewpoints").delete().in("uid", staleVp);
  }

  if (evRows.length === 0) {
    await supabase.from("graph_controversy_evidence").delete().neq("document_uid", "");
  } else {
    const keepKeys = new Set(
      evRows.map((e) => `${e.controversy_uid}|${e.document_uid}`)
    );
    const { data: existingEv } = await supabase
      .from("graph_controversy_evidence")
      .select("controversy_uid, document_uid");
    for (const row of existingEv ?? []) {
      const key = `${row.controversy_uid}|${row.document_uid}`;
      if (!keepKeys.has(key)) {
        await supabase
          .from("graph_controversy_evidence")
          .delete()
          .eq("controversy_uid", row.controversy_uid)
          .eq("document_uid", row.document_uid);
      }
    }
  }

  return json({
    ok: true,
    controversies: ctrRows.length,
    viewpoints: vpRows.length,
    evidence: evRows.length,
  });
};
