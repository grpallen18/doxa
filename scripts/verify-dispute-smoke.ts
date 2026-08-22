import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'

loadDotenv({ path: path.join(process.cwd(), '.env.local') })

const qUid = 'cq:cbb48bf0ba767900dfab'

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
    { disableLosslessIntegers: true }
  )
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })
  try {
    const disputes = await session.run(
      `
      MATCH (q:Question {uid: $qUid})<-[:SURFACES_IN]-(d:Dispute)
      OPTIONAL MATCH (d)-[:CONCERNS]->(p:Proposition)
      RETURN d.uid AS uid, d.kind AS kind, d.detectionSource AS source,
             collect(DISTINCT p.uid) AS props
      `,
      { qUid }
    )
    console.log('Disputes:', JSON.stringify(disputes.records.map((r) => r.toObject()), null, 2))
    if (disputes.records.length === 0) process.exitCode = 1
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
