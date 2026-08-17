// Supabase Edge Function: project_debate_summaries.
// Upsert Neo Controversy/Viewpoint summaries + evidence excerpts into Supabase.
// Env: SUPABASE_*, NEO4J_*. Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { rankingScore } from "../../../../lib/debate/ranking.ts";

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function consumerQuestion(_topicKey: string, title: string | null, question: string | null): string {
  const q = question?.trim() ?? "";
  if (q && !q.startsWith("What are the competing views concerning")) return q;
  const t = title?.trim() ?? "";
  if (t && !t.startsWith("Controversy:") && !t.startsWith("What are the competing views concerning") && !t.startsWith("Untitled controversy")) {
    return t;
  }
  return t && !t.startsWith("What are the competing views concerning") ? t : "Untitled debate";
}

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
    question: string | null;
    summary: string;
    sidesCount: number;
    topicKey: string;
    sourceCount: number;
    issueUid: string | null;
    chapterIndex: number;
    chapterOf: string | null;
    status: string | null;
    supersededBy: string | null;
    closedAt: string | null;
    updatedAt: string | null;
  }>(
    `
    MATCH (c:Controversy)
    OPTIONAL MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)<-[:EXPRESSES]-(u:Utterance)
    WITH c, count(DISTINCT u.documentUid) AS sourceCount
    RETURN c.uid AS uid,
           coalesce(c.title, c.uid) AS title,
           c.question AS question,
           coalesce(c.summary, '') AS summary,
           coalesce(c.sidesCount, 0) AS sidesCount,
           coalesce(c.topicKey, '') AS topicKey,
           sourceCount,
           c.issueUid AS issueUid,
           coalesce(c.chapterIndex, 0) AS chapterIndex,
           c.chapterOf AS chapterOf,
           coalesce(c.status, 'open') AS status,
           c.supersededBy AS supersededBy,
           CASE WHEN c.closedAt IS NULL THEN null ELSE toString(c.closedAt) END AS closedAt,
           toString(c.updatedAt) AS updatedAt
    `
  );

  const viewpoints = await runCypher<{
    uid: string;
    controversyUid: string | null;
    label: string;
    summary: string;
    topicKey: string;
    memberCount: number;
    sampleProps: Array<{ uid: string; text: string }> | null;
  }>(
    `
    MATCH (v:Viewpoint)
    OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(v)
    OPTIONAL MATCH (v)-[:ADVANCES]->(p:Proposition)
    WITH v, c, p
    ORDER BY coalesce(p.text, p.normalizedText, '')
    WITH v, c,
         collect({
           uid: p.uid,
           text: coalesce(p.text, p.normalizedText, '')
         })[0..5] AS sampleProps
    RETURN v.uid AS uid,
           c.uid AS controversyUid,
           coalesce(v.label, v.uid) AS label,
           coalesce(v.summary, '') AS summary,
           coalesce(v.topicKey, '') AS topicKey,
           coalesce(v.memberCount, size(sampleProps), 0) AS memberCount,
           sampleProps
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

  const sharedClash = await runCypher<{
    controversyUid: string;
    shared: string[];
    clash: string[];
  }>(
    `
    MATCH (c:Controversy)
    OPTIONAL MATCH (c)-[:INCLUDES]->(va:Viewpoint)-[:ADVANCES]->(pa:Proposition)
          -[rAgree:RELATES_TO]->(pb:Proposition)<-[:ADVANCES]-(vb:Viewpoint)<-[:INCLUDES]-(c)
    WHERE va <> vb AND rAgree.kind IN ['compatible', 'qualify', 'broader', 'narrower']
    WITH c, collect(DISTINCT coalesce(pa.text, pa.normalizedText, '')) AS sharedRaw
    OPTIONAL MATCH (c)-[:INCLUDES]->(vc:Viewpoint)-[:ADVANCES]->(pc:Proposition)
          -[rOpp:RELATES_TO]->(pd:Proposition)<-[:ADVANCES]-(vd:Viewpoint)<-[:INCLUDES]-(c)
    WHERE vc <> vd AND rOpp.kind IN ['oppose']
    WITH c, sharedRaw,
         collect(DISTINCT coalesce(pc.text, pc.normalizedText, '') + ' ↔ ' + coalesce(pd.text, pd.normalizedText, '')) AS clashRaw
    RETURN c.uid AS controversyUid,
           [x IN sharedRaw WHERE x IS NOT NULL AND x <> ''][0..4] AS shared,
           [x IN clashRaw WHERE x IS NOT NULL AND x <> ''][0..4] AS clash
    `
  );

  const disputes = await runCypher<{
    controversyUid: string;
    bullets: string[];
  }>(
    `
    MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)
    OPTIONAL MATCH (d:Dispute)-[:CONCERNS]->(p)
    WITH c, collect(DISTINCT coalesce(d.summary, d.kind, d.uid, '')) AS bullets
    RETURN c.uid AS controversyUid,
           [x IN bullets WHERE x IS NOT NULL AND x <> ''][0..4] AS bullets
    `
  );

  const excerpts = await runCypher<{
    controversyUid: string;
    propositionUid: string;
    propositionText: string;
    utteranceUid: string;
    speakerName: string | null;
    documentUid: string;
    excerpt: string;
    publicationName: string | null;
    storyTitle: string | null;
    storyUrl: string | null;
  }>(
    `
    MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)<-[:EXPRESSES]-(u:Utterance)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})
    OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(pub:Publication)
    WITH c, p, u, a, seg, d, pub
    ORDER BY c.uid, p.uid, u.uid
    WITH c, p, collect({
      utteranceUid: u.uid,
      speakerName: coalesce(a.name, a.label, null),
      documentUid: u.documentUid,
      excerpt: coalesce(seg.text, u.text, ''),
      publicationName: coalesce(pub.name, null),
      storyTitle: coalesce(d.title, null),
      storyUrl: coalesce(d.url, null)
    })[0..2] AS utts
    WITH c, p, utts
    ORDER BY c.uid, p.uid
    WITH c, collect({ p: p, utts: utts })[0..8] AS propBags
    UNWIND propBags AS bag
    UNWIND bag.utts AS utt
    RETURN c.uid AS controversyUid,
           bag.p.uid AS propositionUid,
           coalesce(bag.p.text, bag.p.normalizedText, '') AS propositionText,
           utt.utteranceUid AS utteranceUid,
           utt.speakerName AS speakerName,
           utt.documentUid AS documentUid,
           utt.excerpt AS excerpt,
           utt.publicationName AS publicationName,
           utt.storyTitle AS storyTitle,
           utt.storyUrl AS storyUrl
    `
  );

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      controversies: controversies.length,
      viewpoints: viewpoints.length,
      evidence: evidence.length,
      excerpts: excerpts.length,
    });
  }

  const subjects = await runCypher<{
    controversyUid: string;
    entityUid: string;
    name: string;
    kindHint: string | null;
    weight: number;
    role: string;
  }>(
    `
    MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)
          <-[:EXPRESSES]-(u:Utterance)-[:MENTIONS]->(e:Entity)
    WHERE coalesce(c.status, 'open') = 'open'
    WITH c, e, count(DISTINCT u) AS mentions, count(DISTINCT p) AS props
    WHERE mentions >= 1
    WITH c, e, mentions, props,
         CASE WHEN coalesce(e.kindHint, '') = 'person' THEN 'person' ELSE 'subject' END AS role
    MERGE (e)-[s:SUBJECT_OF]->(c)
    SET s.weight = mentions,
        s.propCount = props,
        s.role = role,
        s.updatedAt = datetime()
    RETURN c.uid AS controversyUid,
           e.uid AS entityUid,
           coalesce(e.name, e.normalizedName, e.uid) AS name,
           e.kindHint AS kindHint,
           mentions AS weight,
           role
    `
  );

  await runCypher(
    `
    MATCH (e:Entity)-[s:SUBJECT_OF]->(c:Controversy)
    WHERE coalesce(c.status, 'open') <> 'open'
       OR NOT EXISTS {
      MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)
            <-[:EXPRESSES]-(:Utterance)-[:MENTIONS]->(e)
    }
    DELETE s
    `
  );

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  const sharedMap = new Map(sharedClash.map((r) => [r.controversyUid, r]));
  const disputeMap = new Map(disputes.map((r) => [r.controversyUid, r.bullets ?? []]));

  const ctrRows = controversies.map((c) => {
    const sc = sharedMap.get(c.uid);
    const question = consumerQuestion(c.topicKey, c.title, c.question);
    const sides = Number(c.sidesCount) || 0;
    const sources = Number(c.sourceCount) || 0;
    return {
      uid: c.uid,
      title: question,
      question,
      summary: c.summary?.startsWith("Multi-sided debate")
        ? `Multi-sided debate with ${sides} viewpoint${sides === 1 ? "" : "s"}.`
        : c.summary,
      sides_count: sides,
      source_count: sources,
      topic_key: c.topicKey,
      arena_uid: c.issueUid,
      chapter_index: Number(c.chapterIndex) || 0,
      chapter_of: c.chapterOf,
      status: c.status === "closed" ? "closed" : "open",
      superseded_by: c.supersededBy,
      closed_at: c.closedAt,
      ranking_score: rankingScore({
        sidesCount: sides,
        sourceCount: sources,
        updatedAt: c.updatedAt,
      }),
      shared_bullets: (sc?.shared ?? []).filter(Boolean).map((t) => truncate(t, 180)),
      clash_bullets: (sc?.clash ?? []).filter(Boolean).map((t) => truncate(t, 180)),
      dispute_bullets: (disputeMap.get(c.uid) ?? []).filter(Boolean).map((t) => truncate(t, 180)),
      updated_at: now,
    };
  });

  if (ctrRows.length) {
    const { error } = await supabase.from("graph_controversies").upsert(ctrRows, {
      onConflict: "uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  // Child tables FK to graph_controversies. Neo is read across several round
  // trips, so a concurrent rebuild can surface a controversy in a child query
  // that never made it into this pass's parent snapshot.
  const ctrUids = ctrRows.map((r) => r.uid);
  const projectedCtr = new Set(ctrUids);

  const subjectRows = subjects
    .filter((s) => s.controversyUid && s.entityUid && projectedCtr.has(s.controversyUid))
    .map((s) => ({
      controversy_uid: s.controversyUid,
      entity_uid: s.entityUid,
      name: s.name,
      kind_hint: s.kindHint,
      weight: Number(s.weight) || 0,
      role: s.role,
      updated_at: now,
    }));
  if (ctrRows.length && subjectRows.length === 0) {
    const { error: delEmpty } = await supabase
      .from("graph_controversy_subjects")
      .delete()
      .in("controversy_uid", ctrRows.map((r) => r.uid));
    if (delEmpty) return json({ error: delEmpty.message }, 500);
  } else if (subjectRows.length) {
    const { error } = await supabase.from("graph_controversy_subjects").upsert(subjectRows, {
      onConflict: "controversy_uid,entity_uid",
    });
    if (error) return json({ error: error.message }, 500);
    const keepKeys = new Set(subjectRows.map((s) => `${s.controversy_uid}|${s.entity_uid}`));
    const { data: existingSub, error: subSelErr } = await supabase
      .from("graph_controversy_subjects")
      .select("controversy_uid, entity_uid")
      .in("controversy_uid", ctrRows.map((r) => r.uid));
    if (subSelErr) return json({ error: subSelErr.message }, 500);
    for (const row of existingSub ?? []) {
      const key = `${row.controversy_uid}|${row.entity_uid}`;
      if (!keepKeys.has(key)) {
        const { error: delErr } = await supabase
          .from("graph_controversy_subjects")
          .delete()
          .eq("controversy_uid", row.controversy_uid)
          .eq("entity_uid", row.entity_uid);
        if (delErr) return json({ error: delErr.message }, 500);
      }
    }
  }

  const vpRows = viewpoints.map((v) => {
    const samples = (v.sampleProps ?? [])
      .filter((p) => p?.uid && p?.text)
      .map((p) => ({ uid: p.uid, text: truncate(p.text, 280) }));
    const lead = samples[0]?.text ?? "";
    const label =
      v.label?.startsWith("Viewpoint (") && lead
        ? truncate(lead, 96)
        : v.label;
    const summary =
      v.summary?.startsWith("Agree cluster") && lead
        ? `Agree cluster of ${v.memberCount} proposition${v.memberCount === 1 ? "" : "s"}: ${truncate(lead, 160)}`
        : v.summary;
    return {
      uid: v.uid,
      controversy_uid:
        v.controversyUid && projectedCtr.has(v.controversyUid) ? v.controversyUid : null,
      label,
      summary,
      thesis: lead || summary || label,
      topic_key: v.topicKey,
      member_count: Number(v.memberCount) || samples.length || 0,
      sample_propositions: samples,
      grounding_summary: samples.length
        ? `${samples.length} sample claim${samples.length === 1 ? "" : "s"} from source utterances`
        : null,
      updated_at: now,
    };
  });

  if (vpRows.length) {
    const { error } = await supabase.from("graph_viewpoints").upsert(vpRows, {
      onConflict: "uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  const evRows = evidence
    .filter((e) => e.controversyUid && e.documentUid && projectedCtr.has(e.controversyUid))
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

  // Replace evidence excerpts wholesale for projected controversies.
  if (ctrUids.length) {
    const { error: delExErr } = await supabase
      .from("graph_evidence_excerpts")
      .delete()
      .in("controversy_uid", ctrUids);
    if (delExErr) return json({ error: delExErr.message }, 500);
  }
  const excerptRows = excerpts
    .filter(
      (e) =>
        e.controversyUid &&
        e.propositionUid &&
        e.excerpt &&
        projectedCtr.has(e.controversyUid)
    )
    .map((e) => ({
      controversy_uid: e.controversyUid,
      proposition_uid: e.propositionUid,
      proposition_text: truncate(e.propositionText || "", 500),
      utterance_uid: e.utteranceUid,
      speaker_name: e.speakerName,
      document_uid: e.documentUid,
      excerpt: truncate(e.excerpt, 600),
      publication_name: e.publicationName,
      story_title: e.storyTitle,
      story_url: e.storyUrl,
      updated_at: now,
    }));
  if (excerptRows.length) {
    const { error } = await supabase.from("graph_evidence_excerpts").insert(excerptRows);
    if (error) return json({ error: error.message }, 500);
  }

  // Enrich story metadata from Postgres when Neo Document lacked title/url.
  const docUids = [...new Set(excerptRows.map((r) => r.document_uid).filter(Boolean))] as string[];
  if (docUids.length) {
    const { data: stories } = await supabase
      .from("stories")
      .select("story_id, title, url, sources(name)")
      .in("story_id", docUids);
    for (const s of stories ?? []) {
      const pub = Array.isArray(s.sources) ? s.sources[0]?.name : (s.sources as { name?: string } | null)?.name;
      await supabase
        .from("graph_evidence_excerpts")
        .update({
          story_title: s.title ?? null,
          story_url: s.url ?? null,
          publication_name: pub ?? null,
        })
        .eq("document_uid", s.story_id)
        .is("story_url", null);
    }
  }

  // Purge projection rows no longer present in Neo.
  const { data: existingCtr } = await supabase.from("graph_controversies").select("uid");
  const staleCtr = (existingCtr ?? [])
    .map((r) => r.uid as string)
    .filter((uid) => !ctrUids.includes(uid));
  if (staleCtr.length) {
    await supabase.from("graph_evidence_excerpts").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_controversy_evidence").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_viewpoints").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_topic_links").delete().in("controversy_uid", staleCtr);
    await supabase.from("graph_controversy_subjects").delete().in("controversy_uid", staleCtr);
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

  // Auto-link controversies to matching topics.
  const { error: linkErr } = await supabase.rpc("link_graph_controversies_to_topics");
  if (linkErr) return json({ error: linkErr.message }, 500);

  return json({
    ok: true,
    controversies: ctrRows.length,
    viewpoints: vpRows.length,
    evidence: evRows.length,
    excerpts: excerptRows.length,
    subjects: subjectRows.length,
  });
};
