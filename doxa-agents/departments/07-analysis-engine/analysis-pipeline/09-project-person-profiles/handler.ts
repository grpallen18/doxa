// Supabase Edge Function: project_person_profiles.
// Upsert Neo Entity(kindHint=person) dossiers into Supabase graph_people.
// Env: SUPABASE_*, NEO4J_*. Body: { dry_run?: boolean, limit?: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 80;
const PUBLISHER_CAP = 8;
const DOC_CAP = 12;
const DEBATE_CAP = 12;
const CLAIM_CAP = 20;
const RELATED_CAP = 8;
const TOPIC_CAP = 8;
const EIDOS_NODE_CAP = 60;
const REMARK_CAP = 8;

type OfficeRow = { uid: string; name: string; title: string | null };
type PublisherRow = { publication_uid: string; name: string; doc_count: number };
type DocumentRow = {
  document_uid: string;
  story_title: string | null;
  publication_name: string | null;
  story_url: string | null;
  published_at: string | null;
  mention_count: number;
};
type ControversyRow = {
  uid: string;
  question: string | null;
  title: string | null;
  summary: string | null;
  sides_count: number;
  source_count: number;
  topic_key: string | null;
  updated_at: string | null;
};
type PropRow = { uid: string; text: string; controversy_uid: string | null };
type RelatedRow = { uid: string; name: string; kind_hint: string | null; co_mention_count: number };
type PulseRow = { bucket: string; doc_count: number };
type RemarkRow = { proposition_uid: string; text: string; agent_name: string };
type TopicRow = { key: string; label: string; debate_count: number };
type EidosNode = { id: string; label: string; kind: string; size: number };
type EidosEdge = { source: string; target: string };

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function fireRating(input: {
  debateCount: number;
  meanSides: number;
  distinctSources: number;
}): number {
  // Deterministic 1–5 from graph involvement (not an LLM judgment).
  let score = 1;
  score += Math.min(2, Math.floor(input.debateCount / 2));
  if (input.meanSides >= 3) score += 1;
  if (input.distinctSources >= 5) score += 1;
  return Math.max(1, Math.min(5, score));
}

function deltaPct(last30: number, prior30: number): number {
  if (prior30 <= 0) return last30 > 0 ? 100 : 0;
  return Math.round(((last30 - prior30) / prior30) * 1000) / 10;
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
  const limit = clampInt(body.limit, 1, 200, DEFAULT_LIMIT);

  try {
    const people = await runCypher<{
      uid: string;
      name: string;
      normalizedName: string;
      mentionCount: number;
    }>(
      `
      MATCH (e:Entity)
      WHERE coalesce(e.kindHint, '') = 'person'
      OPTIONAL MATCH (u:Utterance)-[:MENTIONS]->(e)
      WITH e, count(DISTINCT u) AS mentionCount
      WHERE mentionCount > 0
      RETURN e.uid AS uid,
             coalesce(e.name, e.normalizedName, e.uid) AS name,
             coalesce(e.normalizedName, toLower(coalesce(e.name, '')), '') AS normalizedName,
             mentionCount
      ORDER BY mentionCount DESC
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, people: people.length, limit });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    const activeUids: string[] = [];

    for (const person of people) {
      if (!person.uid) continue;
      activeUids.push(person.uid);

      const [offices, coverage, publishers, documents, debates, props, related, pulse, remarks, totals] =
        await Promise.all([
          runCypher<{ uid: string; name: string; title: string | null }>(
            `
            MATCH (e:Entity {uid: $uid})-[r:REFERRED_AS]->(o:Entity)
            WHERE coalesce(o.kindHint, '') = 'office'
            RETURN o.uid AS uid,
                   coalesce(o.name, o.normalizedName, o.uid) AS name,
                   coalesce(r.title, o.name, null) AS title
            ORDER BY coalesce(toString(r.updatedAt), toString(r.createdAt), '') DESC
            LIMIT 6
            `,
            { uid: person.uid }
          ),
          runCypher<{ last30: number; prior30: number }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            WHERE u.documentUid IS NOT NULL
            OPTIONAL MATCH (d:Document {uid: u.documentUid})
            WITH DISTINCT u.documentUid AS docUid,
                 CASE
                   WHEN coalesce(d.publishedAt, u.createdAt) IS NULL THEN null
                   ELSE toString(coalesce(d.publishedAt, u.createdAt))
                 END AS tsStr
            WITH docUid, tsStr,
                 toString(datetime() - duration('P30D')) AS cut30,
                 toString(datetime() - duration('P60D')) AS cut60
            RETURN
              count(DISTINCT CASE WHEN tsStr IS NOT NULL AND tsStr >= cut30 THEN docUid END) AS last30,
              count(DISTINCT CASE WHEN tsStr IS NOT NULL AND tsStr >= cut60 AND tsStr < cut30 THEN docUid END) AS prior30
            `,
            { uid: person.uid }
          ),
          runCypher<{ publicationUid: string; name: string; docCount: number }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            WHERE u.documentUid IS NOT NULL
            MATCH (d:Document {uid: u.documentUid})-[:PUBLISHED_BY]->(p:Publication)
            WITH p, count(DISTINCT d) AS docCount
            RETURN p.uid AS publicationUid,
                   coalesce(p.name, p.uid) AS name,
                   docCount
            ORDER BY docCount DESC
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(PUBLISHER_CAP) }
          ),
          runCypher<{
            documentUid: string;
            title: string | null;
            publicationName: string | null;
            url: string | null;
            publishedAt: string | null;
            mentionCount: number;
          }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            WHERE u.documentUid IS NOT NULL
            MATCH (d:Document {uid: u.documentUid})
            OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
            WITH d, p, count(DISTINCT u) AS mentionCount
            RETURN d.uid AS documentUid,
                   coalesce(d.title, null) AS title,
                   coalesce(p.name, null) AS publicationName,
                   coalesce(d.url, null) AS url,
                   CASE WHEN d.publishedAt IS NULL THEN null ELSE toString(d.publishedAt) END AS publishedAt,
                   mentionCount
            ORDER BY coalesce(toString(d.publishedAt), '') DESC, mentionCount DESC
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(DOC_CAP) }
          ),
          runCypher<{
            uid: string;
            question: string | null;
            title: string | null;
            summary: string | null;
            sidesCount: number;
            sourceCount: number;
            topicKey: string | null;
            updatedAt: string | null;
          }>(
            `
            MATCH (e:Entity {uid: $uid})-[s:SUBJECT_OF]->(q:Question)
            MATCH (c:Controversy {status: 'established'})-[:ABOUT]->(q)
            OPTIONAL MATCH (c)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(:Proposition)<-[:EXPRESSES]-(u:Utterance)
            WITH c, q, s, count(DISTINCT u.documentUid) AS sourceCount
            RETURN c.uid AS uid,
                   q.question AS question,
                   coalesce(q.question, c.title, c.uid) AS title,
                   coalesce(c.summary, '') AS summary,
                   coalesce(c.sidesCount, 0) AS sidesCount,
                   sourceCount,
                   coalesce(c.topicKey, '') AS topicKey,
                   CASE WHEN c.updatedAt IS NULL THEN null ELSE toString(c.updatedAt) END AS updatedAt
            ORDER BY coalesce(s.weight, 0) DESC, coalesce(toString(c.updatedAt), '') DESC
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(DEBATE_CAP) }
          ),
          runCypher<{ uid: string; text: string; controversyUid: string | null }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            MATCH (u)-[:EXPRESSES]->(p:Proposition)
            OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p)
            WITH p, collect(DISTINCT c.uid)[0] AS controversyUid
            RETURN p.uid AS uid,
                   coalesce(p.text, p.normalizedText, '') AS text,
                   controversyUid
            ORDER BY CASE WHEN controversyUid IS NULL THEN 1 ELSE 0 END,
                     coalesce(p.text, p.normalizedText, '')
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(CLAIM_CAP) }
          ),
          runCypher<{ uid: string; name: string; kindHint: string | null; coCount: number }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            MATCH (u)-[:MENTIONS]->(other:Entity)
            WHERE other.uid <> e.uid AND coalesce(other.kindHint, '') = 'person'
            WITH other, count(DISTINCT u) AS coCount
            RETURN other.uid AS uid,
                   coalesce(other.name, other.normalizedName, other.uid) AS name,
                   other.kindHint AS kindHint,
                   coCount
            ORDER BY coCount DESC
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(RELATED_CAP) }
          ),
          runCypher<{ bucket: string; docCount: number }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            WHERE u.documentUid IS NOT NULL
            OPTIONAL MATCH (d:Document {uid: u.documentUid})
            WITH DISTINCT u.documentUid AS docUid,
                 CASE
                   WHEN coalesce(d.publishedAt, u.createdAt) IS NULL THEN null
                   ELSE substring(toString(coalesce(d.publishedAt, u.createdAt)), 0, 7)
                 END AS bucket
            WHERE bucket IS NOT NULL
            WITH bucket, count(DISTINCT docUid) AS docCount
            RETURN bucket, docCount
            ORDER BY bucket DESC
            LIMIT 12
            `,
            { uid: person.uid }
          ),
          runCypher<{ propositionUid: string; text: string; agentName: string }>(
            `
            MATCH (e:Entity {uid: $uid})
            WITH e, toLower(coalesce(e.normalizedName, e.name, '')) AS norm
            WHERE norm <> ''
            MATCH (a:Agent)
            WHERE toLower(coalesce(a.normalizedName, a.name, '')) = norm
            OPTIONAL MATCH (a)-[:HELD_BY]->(hp:Proposition)
            OPTIONAL MATCH (u:Utterance)-[:ASSERTED_BY]->(a)
            OPTIONAL MATCH (u)-[:EXPRESSES]->(ep:Proposition)
            WITH a, collect(DISTINCT hp) + collect(DISTINCT ep) AS props
            UNWIND props AS p
            WITH a, p
            WHERE p IS NOT NULL
            RETURN DISTINCT p.uid AS propositionUid,
                   coalesce(p.text, p.normalizedText, '') AS text,
                   coalesce(a.name, a.normalizedName, 'Speaker') AS agentName
            LIMIT $cap
            `,
            { uid: person.uid, cap: neoInt(REMARK_CAP) }
          ),
          runCypher<{
            debateCount: number;
            claimCount: number;
            documentCount: number;
            publisherCount: number;
            meanSides: number;
          }>(
            `
            MATCH (u:Utterance)-[:MENTIONS]->(e:Entity {uid: $uid})
            OPTIONAL MATCH (u)-[:EXPRESSES]->(p:Proposition)
            OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(:Viewpoint)-[:ADVANCES]->(p)
            OPTIONAL MATCH (d:Document {uid: u.documentUid})-[:PUBLISHED_BY]->(pub:Publication)
            RETURN count(DISTINCT c.uid) AS debateCount,
                   count(DISTINCT p.uid) AS claimCount,
                   count(DISTINCT u.documentUid) AS documentCount,
                   count(DISTINCT pub.uid) AS publisherCount,
                   avg(CASE WHEN c IS NULL THEN null ELSE coalesce(c.sidesCount, 0.0) END) AS meanSides
            `,
            { uid: person.uid }
          ),
        ]);

      // Enrich document titles/urls from Postgres when Neo Document lacks them.
      const docUids = documents.map((d) => d.documentUid).filter(Boolean);
      const storyMeta = new Map<string, { title: string | null; url: string | null; source: string | null }>();
      if (docUids.length) {
        const { data: stories } = await supabase
          .from("stories")
          .select("story_id, title, url, sources(name)")
          .in("story_id", docUids);
        for (const s of stories ?? []) {
          const src = s.sources as { name?: string } | { name?: string }[] | null;
          const sourceName = Array.isArray(src) ? src[0]?.name ?? null : src?.name ?? null;
          storyMeta.set(s.story_id as string, {
            title: (s.title as string | null) ?? null,
            url: (s.url as string | null) ?? null,
            source: sourceName,
          });
        }
      }

      // Hydrate controversy cards from projection when available.
      const ctrUids = debates.map((d) => d.uid).filter(Boolean);
      const ctrMeta = new Map<string, ControversyRow>();
      if (ctrUids.length) {
        const { data: ctrRows } = await supabase
          .from("graph_controversies")
          .select("uid, title, question, summary, sides_count, source_count, topic_key, updated_at")
          .in("uid", ctrUids);
        for (const r of ctrRows ?? []) {
          ctrMeta.set(r.uid as string, {
            uid: r.uid as string,
            question: (r.question as string | null) ?? null,
            title: (r.title as string | null) ?? null,
            summary: (r.summary as string | null) ?? null,
            sides_count: Number(r.sides_count) || 0,
            source_count: Number(r.source_count) || 0,
            topic_key: (r.topic_key as string | null) ?? null,
            updated_at: (r.updated_at as string | null) ?? null,
          });
        }
      }

      const officeRows: OfficeRow[] = offices.map((o) => ({
        uid: o.uid,
        name: o.name,
        title: o.title,
      }));

      const publisherRows: PublisherRow[] = publishers.map((p) => ({
        publication_uid: p.publicationUid,
        name: p.name,
        doc_count: Number(p.docCount) || 0,
      }));

      const documentRows: DocumentRow[] = documents.map((d) => {
        const meta = storyMeta.get(d.documentUid);
        return {
          document_uid: d.documentUid,
          story_title: meta?.title || d.title,
          publication_name: meta?.source || d.publicationName,
          story_url: meta?.url || d.url,
          published_at: d.publishedAt,
          mention_count: Number(d.mentionCount) || 0,
        };
      });

      const controversyRows: ControversyRow[] = debates.map((d) => {
        const meta = ctrMeta.get(d.uid);
        return {
          uid: d.uid,
          question: meta?.question || d.question || d.title,
          title: meta?.title || d.title,
          summary: meta?.summary ?? d.summary,
          sides_count: meta?.sides_count ?? Number(d.sidesCount) ?? 0,
          source_count: meta?.source_count ?? Number(d.sourceCount) ?? 0,
          topic_key: meta?.topic_key || d.topicKey || null,
          updated_at: meta?.updated_at || d.updatedAt,
        };
      });

      const propRows: PropRow[] = props
        .filter((p) => p.uid && p.text?.trim())
        .map((p) => ({
          uid: p.uid,
          text: truncate(p.text, 320),
          controversy_uid: p.controversyUid,
        }));

      const relatedRows: RelatedRow[] = related.map((r) => ({
        uid: r.uid,
        name: r.name,
        kind_hint: r.kindHint,
        co_mention_count: Number(r.coCount) || 0,
      }));

      const pulseRows: PulseRow[] = pulse
        .map((p) => ({ bucket: p.bucket, doc_count: Number(p.docCount) || 0 }))
        .reverse();

      const remarkRows: RemarkRow[] = remarks
        .filter((r) => r.propositionUid && r.text?.trim())
        .map((r) => ({
          proposition_uid: r.propositionUid,
          text: truncate(r.text, 280),
          agent_name: r.agentName,
        }));

      const topicMap = new Map<string, number>();
      for (const c of controversyRows) {
        const key = (c.topic_key || "").trim();
        if (!key) continue;
        topicMap.set(key, (topicMap.get(key) || 0) + 1);
      }
      const topicRows: TopicRow[] = [...topicMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOPIC_CAP)
        .map(([key, debate_count]) => ({
          key,
          label: key.replace(/^sim:/, "").trim() || key,
          debate_count,
        }));

      const cov = coverage[0] ?? { last30: 0, prior30: 0 };
      const last30 = Number(cov.last30) || 0;
      const prior30 = Number(cov.prior30) || 0;
      const tot = totals[0];
      const debateCount = Number(tot?.debateCount) || controversyRows.length;
      const claimCount = Number(tot?.claimCount) || propRows.length;
      const documentCount = Number(tot?.documentCount) || documentRows.length;
      const publisherCount = Number(tot?.publisherCount) || publisherRows.length;
      const meanSides = Number(tot?.meanSides) || (
        controversyRows.length === 0
          ? 0
          : controversyRows.reduce((s, c) => s + c.sides_count, 0) / controversyRows.length
      );
      const sourceSum = controversyRows.reduce((s, c) => s + c.source_count, 0);

      const stats = {
        coverage_30d: last30,
        coverage_prior_30d: prior30,
        delta_pct: deltaPct(last30, prior30),
        fire_rating: fireRating({
          debateCount,
          meanSides,
          distinctSources: Math.max(documentCount, sourceSum),
        }),
        claim_count: claimCount,
        debate_count: debateCount,
        mention_count: Number(person.mentionCount) || 0,
        publisher_count: publisherCount,
        document_count: documentCount,
      };

      // Eidos ego snapshot (person + debates + top pubs + related people)
      const eidosNodes: EidosNode[] = [
        {
          id: `person:${person.uid}`,
          label: truncate(person.name, 48),
          kind: "person",
          size: 14,
        },
      ];
      const eidosEdges: EidosEdge[] = [];
      const addNode = (n: EidosNode) => {
        if (eidosNodes.length >= EIDOS_NODE_CAP) return false;
        if (eidosNodes.some((x) => x.id === n.id)) return true;
        eidosNodes.push(n);
        return true;
      };
      for (const c of controversyRows.slice(0, 10)) {
        const id = `controversy:${c.uid}`;
        if (!addNode({ id, label: truncate(c.question || c.title || c.uid, 40), kind: "controversy", size: 8 })) break;
        eidosEdges.push({ source: `person:${person.uid}`, target: id });
      }
      for (const p of publisherRows.slice(0, 6)) {
        const id = `publication:${p.publication_uid}`;
        if (!addNode({ id, label: truncate(p.name, 36), kind: "publication", size: 7 })) break;
        eidosEdges.push({ source: `person:${person.uid}`, target: id });
      }
      for (const r of relatedRows.slice(0, 8)) {
        const id = `person:${r.uid}`;
        if (!addNode({ id, label: truncate(r.name, 36), kind: "person", size: 6 })) break;
        eidosEdges.push({ source: `person:${person.uid}`, target: id });
      }

      rows.push({
        uid: person.uid,
        name: person.name,
        normalized_name: person.normalizedName || person.name.toLowerCase(),
        offices: officeRows,
        stats,
        publishers: publisherRows,
        recent_documents: documentRows,
        controversies: controversyRows,
        sample_propositions: propRows,
        related_people: relatedRows,
        pulse: pulseRows,
        attributed_remarks: remarkRows,
        eidos: { nodes: eidosNodes, edges: eidosEdges },
        topics: topicRows,
        updated_at: now,
      });
    }

    if (rows.length) {
      const { error } = await supabase.from("graph_people").upsert(rows, { onConflict: "uid" });
      if (error) return json({ error: error.message }, 500);
    }

    // Drop projected people with no Entity, not person, or zero remaining mentions.
    const existingUids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from("graph_people")
        .select("uid")
        .range(from, from + 999);
      if (!page?.length) break;
      for (const r of page) existingUids.push(r.uid as string);
      if (page.length < 1000) break;
    }
    const candidates = existingUids.filter((uid) => !activeUids.includes(uid));
    const stale: string[] = [];
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500);
      const keepRows = await runCypher<{ uid: string }>(
        `
        UNWIND $uids AS uid
        MATCH (e:Entity {uid: uid})
        WHERE coalesce(e.kindHint, '') = 'person'
        OPTIONAL MATCH (u:Utterance)-[:MENTIONS]->(e)
        WITH e, count(u) AS mentions
        WHERE mentions > 0
        RETURN e.uid AS uid
        `,
        { uids: chunk }
      );
      const keep = new Set(keepRows.map((r) => r.uid));
      for (const uid of chunk) {
        if (!keep.has(uid)) stale.push(uid);
      }
    }
    if (stale.length) {
      const { error: delErr } = await supabase.from("graph_people").delete().in("uid", stale);
      if (delErr) return json({ error: delErr.message }, 500);
    }

    return json({ ok: true, people: rows.length, limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[project_person_profiles]", message);
    return json({ error: message }, 500);
  }
};
