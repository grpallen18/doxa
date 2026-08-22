/**
 * Unit checks for viewpoint key-point clustering (offline, no LLM).
 * Usage: npx tsx scripts/test-viewpoint-cluster.ts
 */

import { config as loadDotenv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { clusterExtractedKeyPoints } from '../doxa-agents/lib/debate/viewpoint-cluster.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

async function mockAdjudicate(
  _apiKey: string,
  _model: string,
  a: string,
  b: string
): Promise<{ label: 'same' | 'adjacent' | 'unrelated'; confidence: number }> {
  const na = a.toLowerCase()
  const nb = b.toLowerCase()
  if (na === nb || (na.includes('vaccinat') && nb.includes('vaccinat'))) {
    return { label: 'same', confidence: 0.9 }
  }
  if (
    (na.includes('burden') && nb.includes('deterrence')) ||
    (na.includes('deterrence') && nb.includes('burden'))
  ) {
    return { label: 'adjacent', confidence: 0.85 }
  }
  return { label: 'unrelated', confidence: 0.8 }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? 'test-key'

  const ukraine = await clusterExtractedKeyPoints(
    apiKey,
    [
      { propUid: 'p1', keyPoint: 'Burden on American taxpayers', confidence: 0.9 },
      { propUid: 'p2', keyPoint: 'Deterrence requires continued aid', confidence: 0.88 },
      { propUid: 'p3', keyPoint: 'Escalation risk to NATO', confidence: 0.87 },
    ],
    mockAdjudicate
  )
  assert(ukraine.length >= 2, `Ukraine-style split expected ≥2 clusters, got ${ukraine.length}`)

  const paraphrase = await clusterExtractedKeyPoints(
    apiKey,
    [
      { propUid: 'a', keyPoint: 'Vaccinate children against measles', confidence: 0.9 },
      { propUid: 'b', keyPoint: 'Vaccinate children against measles', confidence: 0.88 },
    ],
    mockAdjudicate
  )
  assert(paraphrase.length === 1, `Paraphrase FAVOR expected 1 cluster, got ${paraphrase.length}`)
  assert(
    paraphrase[0].memberPropUids.length === 2,
    'Paraphrase cluster should include both theses'
  )

  console.log('test-viewpoint-cluster: all checks passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
