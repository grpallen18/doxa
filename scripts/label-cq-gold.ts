/**
 * Label docs/gold/cq-propositions.csv via Edge label_cq_gold_batch.
 * Usage: npx tsx scripts/label-cq-gold.ts
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const IN_PATH = path.join(REPO_ROOT, 'docs', 'gold', 'cq-propositions.csv')
const OUT_PATH = IN_PATH
const BATCH = 15

loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

type Row = Record<string, string>
type Label = {
  proposition_uid: string
  debate_role: string
  question: string
  question_type: string
  exclusivity: string
  polarity: string
  key_point: string
  notes: string
}

function parseCsv(text: string): { headers: string[]; rows: Row[] } {
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
    if (c === '\r') continue
    field += c
  }
  if (field.length || cur.length) {
    cur.push(field)
    rows.push(cur)
  }
  const headers = rows[0]
  const body = rows.slice(1).map((cells) => {
    const obj: Row = {}
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = cells[i] ?? ''
    return obj
  })
  return { headers, rows: body }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsv(headers: string[], rows: Row[]): string {
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h] ?? '')).join(','))
  }
  return lines.join('\n') + '\n'
}

function normalize(l: Label, fallbackUid: string): Label {
  const role = ['thesis', 'premise', 'background'].includes(l.debate_role)
    ? l.debate_role
    : 'background'
  let question = (l.question || 'none').trim()
  if (!question) question = 'none'
  if (question !== 'none' && !question.endsWith('?')) question = `${question}?`
  const qType =
    question === 'none'
      ? ''
      : ['policy', 'factual', 'causal', 'definitional'].includes(l.question_type)
        ? l.question_type
        : 'factual'
  const exclusivity =
    question === 'none'
      ? ''
      : ['exclusive', 'compatible', 'unknown'].includes(l.exclusivity)
        ? l.exclusivity
        : 'unknown'
  const allowed = new Set([
    'FAVOR',
    'AGAINST',
    'QUALIFY',
    'AFFIRMS',
    'DENIES',
    'UNCERTAIN',
    'NONE',
    '',
  ])
  let polarity = allowed.has(l.polarity) ? l.polarity : 'NONE'
  if (question === 'none' && role === 'background') polarity = ''
  if (question === 'none' && role === 'premise') polarity = 'NONE'
  return {
    proposition_uid: l.proposition_uid || fallbackUid,
    debate_role: role,
    question,
    question_type: qType,
    exclusivity,
    polarity,
    key_point: role === 'thesis' ? String(l.key_point || '').slice(0, 120) : '',
    notes: String(l.notes || '').slice(0, 200),
  }
}

async function labelBatch(
  rows: Row[],
  url: string,
  key: string
): Promise<Label[]> {
  const payload = {
    rows: rows.map((r) => ({
      proposition_uid: r.proposition_uid,
      text: r.text,
      speech_acts: r.speech_acts,
      has_roles: r.has_roles,
    })),
  }
  const resp = await fetch(`${url}/functions/v1/label_cq_gold_batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = (await resp.json()) as {
    ok?: boolean
    labels?: Label[]
    error?: string
  }
  if (!resp.ok || !data.ok) {
    throw new Error(`label batch failed: ${resp.status} ${data.error ?? JSON.stringify(data)}`)
  }
  const byUid = new Map((data.labels ?? []).map((l) => [l.proposition_uid, l]))
  const list = data.labels ?? []
  return rows.map((r, idx) => {
    const l = byUid.get(r.proposition_uid) ?? list[idx]
    if (!l) {
      return normalize(
        {
          proposition_uid: r.proposition_uid,
          debate_role: 'background',
          question: 'none',
          question_type: '',
          exclusivity: '',
          polarity: '',
          key_point: '',
          notes: 'label_miss',
        },
        r.proposition_uid
      )
    }
    return normalize({ ...l, proposition_uid: r.proposition_uid }, r.proposition_uid)
  })
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

  const { headers, rows } = parseCsv(fs.readFileSync(IN_PATH, 'utf8'))
  console.log(`Labeling ${rows.length} rows via Edge, batch=${BATCH}`)

  const out: Row[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const n = Math.floor(i / BATCH) + 1
    const total = Math.ceil(rows.length / BATCH)
    process.stdout.write(`batch ${n}/${total}… `)
    let labels: Label[]
    try {
      labels = await labelBatch(batch, url, key)
    } catch (err) {
      console.error('\nretry once…', err)
      await new Promise((r) => setTimeout(r, 2500))
      labels = await labelBatch(batch, url, key)
    }
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j]
      const l = labels[j]
      out.push({
        ...r,
        debate_role: l.debate_role,
        question: l.question,
        question_type: l.question_type,
        exclusivity: l.exclusivity,
        polarity: l.polarity,
        key_point: l.key_point,
        notes: l.notes,
      })
    }
    console.log('ok')
  }

  fs.writeFileSync(OUT_PATH, toCsv(headers, out), 'utf8')
  const thesis = out.filter((r) => r.debate_role === 'thesis').length
  const premise = out.filter((r) => r.debate_role === 'premise').length
  const background = out.filter((r) => r.debate_role === 'background').length
  const withQ = out.filter((r) => r.question && r.question !== 'none').length
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`roles: thesis=${thesis} premise=${premise} background=${background} with_question=${withQ}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
