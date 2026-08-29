// Supabase Edge Function: project_debate_summaries.
// Question-first projection of established Controversies + Viewpoints → Supabase.
// Env: SUPABASE_*, NEO4J_*. Body: { dry_run?: boolean, controversy_uid?: string }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import { rankingScore } from "../../../../lib/debate/ranking.ts";
import { evaluatePublishability, isPublishable } from "../../../../lib/debate/publishability.ts";

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;

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
  const controversyUid =
    typeof body.controversy_uid === "string" ? body.controversy_uid.trim() : "";
  const cypherParams = { controversyUid };

  const controversies = await runCypher<{
    uid: string;
    question: string;
    summary: string;
    sidesCount: number;
    topicKey: string;
    sourceCount: number;
    questionUid: string;
    updatedAt: string | null;
    auditVerdict: string | null;
    sharedBullets: string[] | null;
    clashBullets: string[] | null;
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q:Question)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
    OPTIONAL MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)<-[:EXPRESSES]-(u:Utterance)
    WITH c, q, count(DISTINCT u.documentUid) AS sourceCount
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    WITH c, q, sourceCount, count(DISTINCT v) AS sidesCount
    RETURN c.uid AS uid,
           coalesce(q.question, c.question, c.uid) AS question,
           coalesce(c.summary, '') AS summary,
           sidesCount,
           coalesce(c.topicKey, q.uid, '') AS topicKey,
           sourceCount,
           q.uid AS questionUid,
           toString(c.updatedAt) AS updatedAt,
           c.auditVerdict AS auditVerdict,
           c.sharedBullets AS sharedBullets,
           c.clashBullets AS clashBullets
    `,
    cypherParams
  );

  const viewpoints = await runCypher<{
    uid: string;
    controversyUid: string | null;
    label: string;
    summary: string;
    keyPoint: string | null;
    polarity: string | null;
    topicKey: string;
    memberCount: number;
    sampleProps: Array<{ uid: string; text: string }> | null;
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:INCLUDES]->(v:Viewpoint)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
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
           coalesce(v.label, v.keyPoint, v.uid) AS label,
           coalesce(v.summary, v.keyPoint, '') AS summary,
           v.keyPoint AS keyPoint,
           v.polarity AS polarity,
           coalesce(v.topicKey, v.questionUid, '') AS topicKey,
           coalesce(v.memberCount, size(sampleProps), 0) AS memberCount,
           sampleProps
    `,
    cypherParams
  );

  const evidence = await runCypher<{
    controversyUid: string;
    documentUid: string;
    utteranceCount: number;
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)<-[:EXPRESSES]-(u:Utterance)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
    RETURN c.uid AS controversyUid,
           u.documentUid AS documentUid,
           count(DISTINCT u) AS utteranceCount
    `,
    cypherParams
  );

  const keyPointBullets = await runCypher<{
    controversyUid: string;
    bullets: string[];
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:INCLUDES]->(v:Viewpoint)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
    WITH c, collect(DISTINCT coalesce(v.keyPoint, v.label, '')) AS bullets
    RETURN c.uid AS controversyUid,
           [x IN bullets WHERE x IS NOT NULL AND x <> ''][0..6] AS bullets
    `,
    cypherParams
  );

  const disputes = await runCypher<{
    controversyUid: string;
    bullets: string[];
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q:Question)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
    OPTIONAL MATCH (q)<-[:SURFACES_IN]-(d:Dispute)
    OPTIONAL MATCH (d)-[:CONCERNS]->(p:Proposition)<-[:ADVANCES]-(:Viewpoint)<-[:INCLUDES]-(c)
    WITH c, collect(DISTINCT coalesce(d.summary, d.kind, d.uid, '')) AS bullets
    RETURN c.uid AS controversyUid,
           [x IN bullets WHERE x IS NOT NULL AND x <> ''][0..4] AS bullets
    `,
    cypherParams
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
    MATCH (c:Controversy {status: 'established'})-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)<-[:EXPRESSES]-(u:Utterance)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
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
    `,
    cypherParams
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
    questionUid: string;
    entityUid: string;
    name: string;
    kindHint: string | null;
    weight: number;
    role: string;
  }>(
    `
    MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q:Question)
    WHERE $controversyUid = '' OR c.uid = $controversyUid
    MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p:Proposition)<-[:EXPRESSES]-(u:Utterance)-[:MENTIONS]->(e:Entity)
    WITH c, q, e, count(DISTINCT u) AS mentions, count(DISTINCT p) AS props
    WHERE mentions >= 1
    WITH c, q, e, mentions, props,
         CASE WHEN coalesce(e.kindHint, '') = 'person' THEN 'person' ELSE 'subject' END AS role
    MERGE (e)-[s:SUBJECT_OF]->(q)
    SET s.weight = mentions,
        s.propCount = props,
        s.role = role,
        s.updatedAt = datetime()
    RETURN c.uid AS controversyUid,
           q.uid AS questionUid,
           e.uid AS entityUid,
           coalesce(e.name, e.normalizedName, e.uid) AS name,
           e.kindHint AS kindHint,
           mentions AS weight,
           role
    `,
    cypherParams
  );

  await runCypher(
    `
    MATCH (e:Entity)-[s:SUBJECT_OF]->(q:Question)
    WHERE ($controversyUid = '' OR EXISTS {
      MATCH (c:Controversy {uid: $controversyUid, status: 'established'})-[:ABOUT]->(q)
    })
    AND NOT EXISTS {
      MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q)
      WHERE $controversyUid = '' OR c.uid = $controversyUid
      MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)
            <-[:EXPRESSES]-(:Utterance)-[:MENTIONS]->(e)
    }
    DELETE s
    `,
    cypherParams
  );

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const ctrUidsForStatus = controversies.map((c) => c.uid);
  const existingStatusByUid = new Map<string, string>();
  const STATUS_CHUNK = 100;
  for (let i = 0; i < ctrUidsForStatus.length; i += STATUS_CHUNK) {
    const chunk = ctrUidsForStatus.slice(i, i + STATUS_CHUNK);
    const { data: existingStatusRows, error: statusFetchErr } = await supabase
      .from("graph_controversies")
      .select("uid, status")
      .in("uid", chunk)
      .limit(STATUS_CHUNK);
    if (statusFetchErr) return json({ error: statusFetchErr.message }, 500);
    for (const row of existingStatusRows ?? []) {
      if (row.uid && row.status) existingStatusByUid.set(row.uid as string, row.status as string);
    }
  }

  const viewpointCountByCtr = new Map<string, number>();
  for (const v of viewpoints) {
    if (!v.controversyUid) continue;
    viewpointCountByCtr.set(
      v.controversyUid,
      (viewpointCountByCtr.get(v.controversyUid) ?? 0) + 1
    );
  }

  const now = new Date().toISOString();
  const kpMap = new Map(keyPointBullets.map((r) => [r.controversyUid, r.bullets ?? []]));
  const disputeMap = new Map(disputes.map((r) => [r.controversyUid, r.bullets ?? []]));

  const pendingOpenMeta = new Map<
    string,
    { sides: number; sources: number; updatedAt: string | null }
  >();

  const ctrRows = controversies.map((c) => {
    const question = (c.question ?? "").trim() || "Untitled debate";
    const sides = Number(c.sidesCount) || 0;
    const sources = Number(c.sourceCount) || 0;
    const viewpointCount = viewpointCountByCtr.get(c.uid) ?? 0;
    const existingStatus = existingStatusByUid.get(c.uid);
    const publish = evaluatePublishability({
      sidesCount: sides,
      sourceCount: sources,
      viewpointCount,
      existingStatus,
    });
    const bullets = (kpMap.get(c.uid) ?? []).filter(Boolean).map((t) => truncate(t, 180));
    const publishable = isPublishable(publish);
    const alreadyOpen = existingStatus === "open";
    const auditPass = c.auditVerdict === "pass";
    const needsAuditGate = publishable && !alreadyOpen;
    if (needsAuditGate && auditPass) {
      pendingOpenMeta.set(c.uid, { sides, sources, updatedAt: c.updatedAt });
    }
    return {
      uid: c.uid,
      title: question,
      question,
      summary: c.summary?.trim()
        ? c.summary
        : `Multi-sided debate with ${sides} viewpoint${sides === 1 ? "" : "s"}.`,
      sides_count: sides,
      source_count: sources,
      topic_key: c.topicKey || c.questionUid,
      arena_uid: null,
      chapter_index: 0,
      chapter_of: null,
      status: needsAuditGate ? "developing" : publish.status,
      publish_block_reason: needsAuditGate
        ? auditPass
          ? null
          : c.auditVerdict === "block"
            ? "audit_blocked"
            : "audit_pending"
        : publish.publishBlockReason,
      superseded_by: null,
      closed_at: null,
      ranking_score:
        publishable && alreadyOpen
          ? rankingScore({
              sidesCount: sides,
              sourceCount: sources,
              updatedAt: c.updatedAt,
            })
          : 0,
      shared_bullets: (c.sharedBullets?.length ? c.sharedBullets : bullets).slice(0, 4),
      clash_bullets: (c.clashBullets ?? []).slice(0, 6),
      dispute_bullets: (disputeMap.get(c.uid) ?? []).filter(Boolean).map((t) => truncate(t, 180)),
      updated_at: now,
    };
  });

  const ctrRowsForDb = ctrRows;

  if (ctrRowsForDb.length) {
    const { error } = await supabase.from("graph_controversies").upsert(ctrRowsForDb, {
      onConflict: "uid",
    });
    if (error) return json({ error: error.message }, 500);
  }

  const ctrUids = ctrRowsForDb.map((r) => r.uid);
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
  if (ctrRowsForDb.length && subjectRows.length === 0) {
    const { error: delEmpty } = await supabase
      .from("graph_controversy_subjects")
      .delete()
      .in("controversy_uid", ctrRowsForDb.map((r) => r.uid));
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
      .in("controversy_uid", ctrRowsForDb.map((r) => r.uid));
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
    const keyPoint = v.keyPoint?.trim() ?? "";
    const label = keyPoint || v.label || (lead ? truncate(lead, 96) : v.uid);
    const summary = v.summary?.trim() || keyPoint || label;
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

  const { data: existingCtr } = controversyUid
    ? { data: null }
    : await supabase.from("graph_controversies").select("uid");
  const staleCtr = controversyUid
    ? []
    : (existingCtr ?? [])
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
  const { data: existingVp } = controversyUid
    ? await supabase
        .from("graph_viewpoints")
        .select("uid")
        .eq("controversy_uid", controversyUid)
    : await supabase.from("graph_viewpoints").select("uid");
  const staleVp = (existingVp ?? [])
    .map((r) => r.uid as string)
    .filter((uid) => !vpUids.includes(uid));
  if (staleVp.length) {
    await supabase.from("graph_viewpoints").delete().in("uid", staleVp);
  }

  if (!controversyUid && evRows.length === 0) {
    await supabase.from("graph_controversy_evidence").delete().neq("document_uid", "");
  } else if (ctrUids.length) {
    const keepKeys = new Set(
      evRows.map((e) => `${e.controversy_uid}|${e.document_uid}`)
    );
    const { data: existingEv } = await supabase
      .from("graph_controversy_evidence")
      .select("controversy_uid, document_uid")
      .in("controversy_uid", ctrUids);
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

  const openRows = ctrRowsForDb
    .filter((r) => pendingOpenMeta.has(r.uid))
    .map((row) => {
      const meta = pendingOpenMeta.get(row.uid)!;
      return {
        ...row,
        status: "open",
        publish_block_reason: null,
        ranking_score: rankingScore({
          sidesCount: meta.sides,
          sourceCount: meta.sources,
          updatedAt: meta.updatedAt,
        }),
      };
    });
  if (openRows.length) {
    const { error: openErr } = await supabase.from("graph_controversies").upsert(openRows, {
      onConflict: "uid",
    });
    if (openErr) return json({ error: openErr.message }, 500);
  }

  const { error: linkErr } = await supabase.rpc("link_graph_controversies_to_topics");
  if (linkErr) return json({ error: linkErr.message }, 500);

  const questionRows = await runCypher<{
    uid: string;
    question: string;
    questionType: string | null;
    exclusivity: string | null;
    status: string | null;
    memberCount: number;
    candidateCount: number;
    speakerCount: number;
    publicationCount: number;
    controversyUid: string | null;
    blockingKey: string | null;
    lastReviewed: string | null;
    expected: string | null;
  }>(
    `
    MATCH (q:Question)
    WHERE $controversyUid = '' OR EXISTS {
      MATCH (c:Controversy {uid: $controversyUid})-[:ABOUT]->(q)
    }
    OPTIONAL MATCH (p:Proposition)-[:ANSWERS]->(q)
    OPTIONAL MATCH (cand:Proposition)-[:CANDIDATE_FOR]->(q)
    OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)-[:ASSERTED_BY]->(ag:Agent)
    OPTIONAL MATCH (u)-[:GROUNDED_IN]->(:Segment)
    OPTIONAL MATCH (d:Document {uid: u.documentUid})-[:PUBLISHED_BY]->(pub:Publication)
    OPTIONAL MATCH (ctr:Controversy)-[:ABOUT]->(q)
    RETURN q.uid AS uid,
           q.question AS question,
           q.questionType AS questionType,
           q.answerExclusivity AS exclusivity,
           q.status AS status,
           count(DISTINCT p) AS memberCount,
           count(DISTINCT cand) AS candidateCount,
           count(DISTINCT ag) AS speakerCount,
           count(DISTINCT pub) AS publicationCount,
           head(collect(ctr.uid)) AS controversyUid,
           q.blockingKey AS blockingKey,
           toString(q.lastReviewedAt) AS lastReviewed,
           q.expectedCounterThesis AS expected
    `,
    cypherParams
  );

  if (questionRows.length) {
    const { error: qErr } = await supabase.from("graph_questions").upsert(
      questionRows.map((q) => ({
        uid: q.uid,
        question: q.question,
        question_type: q.questionType,
        exclusivity: q.exclusivity,
        status: q.status === "established" ? "established" : "developing",
        member_count: Number(q.memberCount) || 0,
        candidate_count: Number(q.candidateCount) || 0,
        speaker_count: Number(q.speakerCount) || 0,
        publication_count: Number(q.publicationCount) || 0,
        controversy_uid: q.controversyUid,
        blocking_key: q.blockingKey,
        last_reviewed_at: q.lastReviewed,
        expected_counter_thesis: q.expected,
        updated_at: now,
      })),
      { onConflict: "uid" }
    );
    if (qErr) return json({ error: qErr.message }, 500);
  }

  return json({
    ok: true,
    controversies: ctrRowsForDb.length,
    open: openRows.length,
    viewpoints: vpRows.length,
    evidence: evRows.length,
    excerpts: excerptRows.length,
    subjects: subjectRows.length,
    questions: questionRows.length,
  });
};
