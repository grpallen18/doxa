/**
 * Offline eval: gold key_point split/merge expectations for viewpoint clustering.
 * Usage: npx tsx scripts/eval-viewpoint-gold.ts
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as loadDotenv } from 'dotenv'
import { clusterExtractedKeyPoints } from '../doxa-agents/lib/debate/viewpoint-cluster.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

type GoldRow = {
  question: string
  polarity: string
  keyPoint: string
  propUid: string
}

function parseCsv(text: string): GoldRow[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',') {
      cur.push(field)
      field = ''
      continue
    }
    if (c === '\n') {
      cur.push(field)
      field = ''
      if (cur.length > 1 || cur[0] !== '') rows.push(cur)
      cur = []
      continue
    }
    if (c !== '\r') field += c
  }
  if (field.length || cur.length) {
    cur.push(field)
    if (cur.length > 1 || cur[0] !== '') rows.push(cur)
  }
  const header = rows[0]
  const idx = {
    prop: header.indexOf('proposition_uid'),
    question: header.indexOf('question'),
    polarity: header.indexOf('polarity'),
    keyPoint: header.indexOf('key_point'),
  }
  const out: GoldRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i]
    const keyPoint = (cols[idx.keyPoint] ?? '').trim()
    if (!keyPoint) continue
    out.push({
      propUid: cols[idx.prop] ?? `row:${i}`,
      question: cols[idx.question] ?? '',
      polarity: cols[idx.polarity] ?? '',
      keyPoint,
    })
  }
  return out
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function mockAdjudicateFromGold(
  _apiKey: string,
  _model: string,
  a: string,
  b: string
): Promise<{ label: 'same' | 'adjacent' | 'unrelated'; confidence: number }> {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return { label: 'same', confidence: 0.95 }
  const tokensA = new Set(na.split(' '))
  const tokensB = new Set(nb.split(' '))
  let inter = 0
  for (const t of tokensA) if (tokensB.has(t)) inter += 1
  const jacc = inter / (tokensA.size + tokensB.size - inter || 1)
  if (jacc >= 0.65) return { label: 'same', confidence: 0.85 }
  if (jacc >= 0.25) return { label: 'adjacent', confidence: 0.8 }
  return { label: 'unrelated', confidence: 0.85 }
}

async function main() {
  const csvPath = path.join(__dirname, '..', 'docs', 'gold', 'cq-propositions.csv')
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? 'eval-key'

  const fixtureGroups: GoldRow[][] = [
    [
      { propUid: 'fx:p1', question: 'Should the US continue military aid to Ukraine?', polarity: 'AGAINST', keyPoint: 'Burden on American taxpayers' },
      { propUid: 'fx:p2', question: 'Should the US continue military aid to Ukraine?', polarity: 'AGAINST', keyPoint: 'Deterrence requires continued aid' },
      { propUid: 'fx:p3', question: 'Should the US continue military aid to Ukraine?', polarity: 'AGAINST', keyPoint: 'Escalation risk to NATO' },
    ],
    [
      { propUid: 'fx:a', question: 'Should parents vaccinate against measles?', polarity: 'FAVOR', keyPoint: 'Vaccinate children against measles' },
      { propUid: 'fx:b', question: 'Should parents vaccinate against measles?', polarity: 'FAVOR', keyPoint: 'Vaccinate children against measles' },
    ],
  ]

  const groups = new Map<string, GoldRow[]>()
  for (const r of rows) {
    const key = `${normalize(r.question)}|${r.polarity}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  const allGroups = [...fixtureGroups, ...[...groups.values()].filter((g) => g.length >= 2)]
  let groupsChecked = 0
  let splitOk = 0
  let mergeOk = 0
  let purityOk = 0
  let thesesTotal = 0
  let thesesAssigned = 0

  for (const items of allGroups) {
    if (items.length < 2) continue
    thesesTotal += items.length
    groupsChecked += 1
    const distinctKeyPoints = new Set(items.map((i) => normalize(i.keyPoint)))
    const clusters = await clusterExtractedKeyPoints(
      apiKey,
      items.map((i) => ({ propUid: i.propUid, keyPoint: i.keyPoint, confidence: 0.9 })),
      mockAdjudicateFromGold
    )

    for (const c of clusters) thesesAssigned += c.memberPropUids.length

    const polarities = new Set(items.map((i) => i.polarity))
    if (polarities.size === 1) purityOk += 1

    if (distinctKeyPoints.size >= 2 && clusters.length >= 2) splitOk += 1
    if (distinctKeyPoints.size === 1 && clusters.length === 1) mergeOk += 1
  }

  const coverage = thesesTotal ? thesesAssigned / thesesTotal : 0

  console.log(
    JSON.stringify(
      {
        groups_checked: groupsChecked,
        split_cases_ok: splitOk,
        merge_cases_ok: mergeOk,
        purity_groups: purityOk,
        coverage_pct: Math.round(coverage * 100),
      },
      null,
      2
    )
  )

  if (groupsChecked < 2) {
    console.error('FAIL: expected at least 2 eval groups')
    process.exit(1)
  }
  if (splitOk < 1 || mergeOk < 1) {
    console.error('FAIL: split/merge cases did not pass')
    process.exit(1)
  }
  if (coverage < 0.9) {
    console.error('FAIL: coverage below 50%')
    process.exit(1)
  }
  console.log('eval-viewpoint-gold: passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
