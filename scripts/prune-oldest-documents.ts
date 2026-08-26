/**
 * Older-first Document prune for Aura Free headroom.
 * Usage:
 *   npx tsx scripts/prune-oldest-documents.ts --dry-run
 *   npx tsx scripts/prune-oldest-documents.ts --limit 100 --target 170000
 *
 * Requires NEO4J_* in .env.local. Protects docs/gold/prune-allowlist.json and
 * Documents linked to gold proposition uids.
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver, type Session } from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

const PROPS_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv')
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'prune-allowlist.json')

function parseArgs(argv: string[]) {
  let dryRun = true
  let limit = 80
  let target = 170_000
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--commit') dryRun = false
    else if (a === '--dry-run') dryRun = true
    else if (a === '--limit' && argv[i + 1]) limit = Math.max(1, Number(argv[++i]) || 80)
    else if (a === '--target' && argv[i + 1]) target = Math.max(50_000, Number(argv[++i]) || 170_000)
  }
  return { dryRun, limit, target }
}

function parseCsvPropUids(text: string): string[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',')
  const idx = headers.indexOf('proposition_uid')
  if (idx < 0) return []
  const out: string[] = []
  for (const line of lines.slice(1)) {
    // crude CSV: first field is uid when no leading quote on whole row
    const m = line.match(/^(prop:[^,]+)/)
    if (m) out.push(m[1])
  }
  return out
}

function loadAllowlist(): string[] {
  if (!fs.existsSync(ALLOWLIST_PATH)) return []
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    document_uids?: string[]
  }
  return (raw.document_uids ?? []).filter((u) => typeof u === 'string' && u.trim())
}

async function deleteDocumentSubgraph(session: Session, documentUid: string) {
  const collect = await session.run(
    `
    MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:EXPRESSES]->(prop:Proposition)
    OPTIONAL MATCH (u)-[:MENTIONS]->(ent:Entity)
    OPTIONAL MATCH (ent)-[ra:REFERRED_AS {documentUid: $document_uid}]->(office:Entity)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(agent:Agent)
    OPTIONAL MATCH (agent)-[ara:REFERRED_AS {documentUid: $document_uid}]->(aoffice:Entity)
    RETURN collect(DISTINCT prop.uid) AS prop_uids,
           collect(DISTINCT ent.uid) + collect(DISTINCT office.uid)
             + collect(DISTINCT aoffice.uid) AS ent_uids
    `,
    { document_uid: documentUid }
  )
  const rec = collect.records[0]
  const propUids = ((rec?.get('prop_uids') as string[]) ?? []).filter(Boolean)
  const entUids = [
    ...new Set(((rec?.get('ent_uids') as string[]) ?? []).filter(Boolean)),
  ]

  await session.run(
    `MATCH (dec:Decision) WHERE dec.uid STARTS WITH $p DETACH DELETE dec`,
    { p: `${documentUid}:adec:` }
  )
  await session.run(
    `
    MATCH (arg:Argument {documentUid: $document_uid})
    OPTIONAL MATCH (arg)-[:DECIDED_BY]->(adec:Decision)
    DETACH DELETE adec, arg
    `,
    { document_uid: documentUid }
  )
  await session.run(
    `MATCH (dec:Decision) WHERE dec.uid STARTS WITH $p DETACH DELETE dec`,
    { p: `${documentUid}:pdec:` }
  )
  await session.run(
    `MATCH (dec:Decision) WHERE dec.uid STARTS WITH $p DETACH DELETE dec`,
    { p: `${documentUid}:edec:` }
  )
  await session.run(
    `MATCH ()-[r:REFERRED_AS {documentUid: $document_uid}]->() DELETE r`,
    { document_uid: documentUid }
  )
  await session.run(
    `
    MATCH (d:Document {uid: $document_uid})
    OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
    OPTIONAL MATCH (d)-[:HAS_ASSET]->(asset:MediaAsset)
    OPTIONAL MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:PRODUCED_BY]->(run:ExtractionRun)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision)
    OPTIONAL MATCH (agent:Agent)
    WHERE agent.uid STARTS WITH $agent_prefix
    WITH d,
         collect(DISTINCT seg) AS segs,
         collect(DISTINCT asset) AS assets,
         collect(DISTINCT u) AS utts,
         collect(DISTINCT run) AS runs,
         collect(DISTINCT dec) AS decs,
         collect(DISTINCT agent) AS agents
    FOREACH (n IN [x IN segs + assets + utts + runs + decs + agents WHERE x IS NOT NULL] |
      DETACH DELETE n)
    DETACH DELETE d
    `,
    { document_uid: documentUid, agent_prefix: `${documentUid}:agent:` }
  )
  if (propUids.length) {
    await session.run(
      `
      UNWIND $prop_uids AS puid
      MATCH (p:Proposition {uid: puid})
      WHERE NOT EXISTS { MATCH (:Utterance)-[:EXPRESSES]->(p) }
      OPTIONAL MATCH (p)<-[:DECIDED_BY]-(d:Decision)
      DETACH DELETE d, p
      `,
      { prop_uids: propUids }
    )
  }
  if (entUids.length) {
    await session.run(
      `
      UNWIND $ent_uids AS euid
      MATCH (e:Entity {uid: euid})
      WHERE NOT EXISTS { MATCH (:Utterance)-[:MENTIONS]->(e) }
        AND NOT EXISTS { MATCH (e)-[:REFERRED_AS]-() }
        AND NOT EXISTS { MATCH ()-[:REFERRED_AS]->(e) }
      DETACH DELETE e
      `,
      { ent_uids: entUids }
    )
  }
  await session.run(
    `
    MATCH (s:Story {story_id: $document_uid})
    OPTIONAL MATCH (s)-[*0..3]-(n)
    WHERE n:Chunk OR n:Assertion OR n:Event
       OR (n:Entity AND n.story_id = $document_uid)
       OR (n:Actor AND n.story_id = $document_uid)
    DETACH DELETE s, n
    `,
    { document_uid: documentUid }
  )
}

function n(v: unknown): number {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(v) || 0
}

async function main() {
  const { dryRun, limit, target } = parseArgs(process.argv)
  const uri = process.env.NEO4J_URI
  const user = process.env.NEO4J_USERNAME
  const password = process.env.NEO4J_PASSWORD
  const database = process.env.NEO4J_DATABASE || 'neo4j'
  if (!uri || !user || !password) {
    console.error('Missing NEO4J_* in .env.local')
    process.exit(1)
  }

  const exclude = new Set(loadAllowlist())
  const goldProps = fs.existsSync(PROPS_PATH)
    ? parseCsvPropUids(fs.readFileSync(PROPS_PATH, 'utf8'))
    : []

  const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  const session = driver.session({ database })
  try {
    if (goldProps.length) {
      const linked = await session.run(
        `
        UNWIND $props AS puid
        MATCH (u:Utterance)-[:EXPRESSES]->(:Proposition {uid: puid})
        WHERE u.documentUid IS NOT NULL
        RETURN DISTINCT u.documentUid AS documentUid
        `,
        { props: goldProps.slice(0, 500) }
      )
      for (const r of linked.records) {
        const id = r.get('documentUid') as string
        if (id) exclude.add(id)
      }
    }

    const sizeBefore = n(
      (await session.run(`OPTIONAL MATCH (n) RETURN count(n) AS c`)).records[0]?.get('c')
    )
    console.log(
      JSON.stringify(
        {
          dry_run: dryRun,
          graph_nodes: sizeBefore,
          target,
          exclude_count: exclude.size,
          gold_props: goldProps.length,
        },
        null,
        2
      )
    )

    if (sizeBefore <= target) {
      console.log('Already at or below target; nothing to prune.')
      return
    }

    const candidates = await session.run(
      `
      MATCH (d:Document)
      WHERE size($exclude) = 0 OR NOT d.uid IN $exclude
      OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
      OPTIONAL MATCH (u:Utterance {documentUid: d.uid})
      OPTIONAL MATCH (arg:Argument {documentUid: d.uid})
      WITH d, 1 + count(DISTINCT seg) + count(DISTINCT u) + count(DISTINCT arg) AS localNodes
      RETURN d.uid AS uid,
             toString(coalesce(d.publishedAt, '')) AS publishedAt,
             localNodes
      ORDER BY coalesce(d.publishedAt, d.createdAt, datetime('1970-01-01')) ASC
      LIMIT $limit
      `,
      {
        exclude: [...exclude],
        limit: neo4j.int(limit),
      }
    )

    const rows = candidates.records.map((r) => ({
      uid: r.get('uid') as string,
      publishedAt: r.get('publishedAt') as string,
      localNodes: n(r.get('localNodes')),
    }))
    const estimated = rows.reduce((s, r) => s + r.localNodes, 0)
    console.log(
      JSON.stringify(
        {
          candidate_count: rows.length,
          estimated_local_nodes: estimated,
          sample: rows.slice(0, 8),
        },
        null,
        2
      )
    )

    if (dryRun) {
      console.log('Dry run only. Re-run with --commit to delete.')
      return
    }

    let deleted = 0
    for (const row of rows) {
      await deleteDocumentSubgraph(session, row.uid)
      deleted += 1
      const now = n(
        (await session.run(`OPTIONAL MATCH (n) RETURN count(n) AS c`)).records[0]?.get(
          'c'
        )
      )
      console.log(`deleted ${row.uid} → nodes=${now}`)
      if (now <= target) break
    }

    const sizeAfter = n(
      (await session.run(`OPTIONAL MATCH (n) RETURN count(n) AS c`)).records[0]?.get('c')
    )
    console.log(JSON.stringify({ deleted, graph_nodes_after: sizeAfter }, null, 2))
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
