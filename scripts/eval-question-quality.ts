/**
 * Question-quality gold: well_formed vs too_narrow/too_broad inventory.
 * Usage: npx tsx scripts/eval-question-quality.ts
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { predicateLemmaFromQuestion } from '../doxa-agents/lib/debate/question-identity.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csv = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'gold', 'question-quality.csv'),
  'utf8'
)
const lines = csv.trim().split(/\r?\n/).slice(1)
let ok = 0
for (const line of lines) {
  const [question, label] = line.split(',')
  const lemma = predicateLemmaFromQuestion(question || '')
  if (!lemma) throw new Error(`empty lemma for ${question}`)
  if (label === 'well_formed' || label === 'too_narrow' || label === 'too_broad') ok += 1
  else throw new Error(`bad label ${label}`)
}
if (ok < 3) throw new Error('need at least 3 labeled questions')
console.log(`eval-question-quality: ${ok} rows ok`)
