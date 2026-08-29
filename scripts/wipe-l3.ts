/**
 * Phase 0: wipe L3 in Neo4j and truncate debate projection / curator tables.
 * Usage: npx tsx scripts/wipe-l3.ts
 *
 * Requires NEO4J_* and SUPABASE_* in .env.local.
 */

import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

const L3_DECISION_TYPES = [
  'proposition_pair_candidate',
  'proposition_relationship',
  'controversy_title',
  'controversy_qualify',
  'dispute',
  'question_mint',
  'question_match',
  'question_answer',
  'question_link',
  'l3_membership',
  'l3_viewpoint',
  'l3_audit',
  'l3_mint',
  'l3_merge',
  'l3_retype',
]

async function count(session: neo4j.Session, cypher: string): Promise<number> {
  const res = await session.run(cypher)
  return Number(res.records[0]?.get('n') ?? 0)
}

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'
  if (!uri || !username || !password) {
    throw new Error('Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD')
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })

  try {
    const before = {
      propositions: await count(session, 'MATCH (n:Proposition) RETURN count(n) AS n'),
      utterances: await count(session, 'MATCH (n:Utterance) RETURN count(n) AS n'),
      arguments: await count(session, 'MATCH (n:Argument) RETURN count(n) AS n'),
      questions: await count(session, 'MATCH (n:Question) RETURN count(n) AS n'),
      controversies: await count(session, 'MATCH (n:Controversy) RETURN count(n) AS n'),
    }
    console.log('before', before)

    await session.run(`
      MATCH (n)
      WHERE n:Viewpoint OR n:Controversy OR n:Dispute OR n:Question
         OR (n:Issue AND (n.uid STARTS WITH 'arena:' OR n.uid STARTS WITH 'issue:'))
      DETACH DELETE n
    `)
    await session.run('MATCH ()-[r:ANSWERS]->() DELETE r')
    await session.run('MATCH ()-[r:CANDIDATE_FOR]->() DELETE r')
    await session.run('MATCH ()-[r:RELATES_TO]->() DELETE r')
    await session.run('MATCH ()-[r:IN_ISSUE]->() DELETE r')
    await session.run('MATCH ()-[r:SUBJECT_OF]->() DELETE r')
    // Only Question↔Question VARIANT_OF is L3 and it is already removed by the
    // DETACH DELETE of Question nodes above. Never delete all VARIANT_OF —
    // Proposition↔Proposition VARIANT_OF is L0–L2 claim identity to preserve.
    await session.run('MATCH (:Question)-[r:VARIANT_OF]-() DELETE r')
    await session.run(
      `
      MATCH (d:Decision)
      WHERE d.decisionType IN $types
      DETACH DELETE d
      `,
      { types: L3_DECISION_TYPES }
    )
    await session.run(`
      MATCH (a:Assessment)
      WHERE a.targetKind IN ['controversy', 'viewpoint', 'question']
      DETACH DELETE a
    `)

    const after = {
      propositions: await count(session, 'MATCH (n:Proposition) RETURN count(n) AS n'),
      utterances: await count(session, 'MATCH (n:Utterance) RETURN count(n) AS n'),
      arguments: await count(session, 'MATCH (n:Argument) RETURN count(n) AS n'),
      questions: await count(session, 'MATCH (n:Question) RETURN count(n) AS n'),
      controversies: await count(session, 'MATCH (n:Controversy) RETURN count(n) AS n'),
    }
    console.log('after', after)
    if (
      after.propositions !== before.propositions ||
      after.utterances !== before.utterances ||
      after.arguments !== before.arguments
    ) {
      throw new Error('L0–L2 atom counts changed')
    }
  } finally {
    await session.close()
    await driver.close()
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.log('Skipping SQL truncate (missing SUPABASE url/key)')
    return
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const tables = [
    'graph_controversy_subjects',
    'graph_evidence_excerpts',
    'graph_topic_links',
    'graph_controversy_evidence',
    'graph_viewpoints',
    'graph_controversies',
  ]
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().not('uid', 'is', null)
    if (error) {
      const { error: alt } = await supabase.from(table).delete().gte('updated_at', '1970-01-01')
      if (alt) console.log(`skip ${table}: ${alt.message}`)
      else console.log(`cleared ${table}`)
    } else {
      console.log(`cleared ${table}`)
    }
  }
  console.log('wipe-l3: done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
