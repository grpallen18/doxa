/**
 * Phase 5 consolidation: cluster live Questions by blockingKey + cosine; enqueue merge work.
 * Usage: npx tsx scripts/consolidate-q1-questions.ts
 */

import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { cosineSimilarity } from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  if (!uri) throw new Error('Missing NEO4J_*')
  const driver = neo4j.driver(
    uri,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
    { disableLosslessIntegers: true }
  )
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })
  const res = await session.run(`
    MATCH (q:Question)
    OPTIONAL MATCH (:Proposition)-[:ANSWERS]->(q)
    WITH q, count(*) AS n
    RETURN q.uid AS uid, q.question AS question, q.blockingKey AS blockingKey,
           q.embedding AS embedding, n AS members
  `)
  await session.close()
  await driver.close()

  type Q = {
    uid: string
    question: string
    blockingKey: string | null
    embedding: number[]
    members: number
  }
  const questions: Q[] = res.records.map((r) => ({
    uid: String(r.get('uid')),
    question: String(r.get('question') ?? ''),
    blockingKey: r.get('blockingKey') as string | null,
    embedding: (r.get('embedding') as number[]) ?? [],
    members: Number(r.get('members') ?? 0),
  }))
  const q1 = questions.filter((q) => q.members <= 1)
  const clusters: string[][] = []
  const used = new Set<string>()
  for (const a of q1) {
    if (used.has(a.uid)) continue
    const group = [a.uid]
    used.add(a.uid)
    for (const b of q1) {
      if (used.has(b.uid)) continue
      const sameKey = Boolean(a.blockingKey && a.blockingKey === b.blockingKey)
      const cos = cosineSimilarity(a.embedding, b.embedding)
      if (sameKey || cos >= 0.72) {
        group.push(b.uid)
        used.add(b.uid)
      }
    }
    if (group.length >= 2) clusters.push(group)
  }

  console.log(
    JSON.stringify(
      {
        questions: questions.length,
        q1: q1.length,
        merge_clusters: clusters.length,
        fragmentation_index:
          questions.length && questions.reduce((s, q) => s + q.members, 0)
            ? questions.length / Math.max(1, questions.reduce((s, q) => s + q.members, 0))
            : 0,
        corpus_asymmetry_share:
          q1.length && clusters.length
            ? (q1.length - clusters.reduce((s, g) => s + g.length, 0)) / q1.length
            : q1.length
              ? 1
              : 0,
      },
      null,
      2
    )
  )

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('No supabase key — metrics only')
    return
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  let enqueued = 0
  for (const group of clusters) {
    const { error } = await supabase.from('l3_review_queue').insert({
      kind: 'consolidate',
      question_uid: group[0],
      priority: 90,
      dirty_reason: 'q1_merge_cluster',
      payload: { question_uids: group },
    })
    if (!error) enqueued += 1
  }
  console.log(`enqueued ${enqueued} consolidate items`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
