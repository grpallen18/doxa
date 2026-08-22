/**
 * Conservative post-edits on labeled cq-propositions.csv before human review.
 * Usage: npx tsx scripts/fixup-cq-gold-labels.ts
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PATH = path.join(__dirname, '..', 'docs', 'gold', 'cq-propositions.csv')

type Row = Record<string, string>

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

function toBackground(r: Row, note: string) {
  r.debate_role = 'background'
  r.question = 'none'
  r.question_type = ''
  r.exclusivity = ''
  r.polarity = ''
  r.key_point = ''
  r.notes = note
}

function main() {
  const { headers, rows } = parseCsv(fs.readFileSync(PATH, 'utf8'))
  let changed = 0

  for (const r of rows) {
    const t = r.text || ''
    const q = r.question || ''

    // Condolences / greetings are not contested questions.
    if (
      /wish(es)? him a fast|saddened by|fast and successful recovery|described the family as beautiful/i.test(
        t
      )
    ) {
      toBackground(r, 'cleanup: well-wish / personal color')
      changed++
      continue
    }

    // Product / company capability blurbs labeled as theses.
    if (
      r.debate_role === 'thesis' &&
      (/provides a direct, licensed|connects events within each claim|new plans make switching wireless|Federato Claims|Truth API/i.test(
        t
      ) ||
        /^What does .+ provide\?/i.test(q) ||
        /^How does .+ connect/i.test(q))
    ) {
      toBackground(r, 'cleanup: product/capability blurb')
      changed++
      continue
    }

    // Pure process / filing predictions.
    if (
      r.debate_role === 'thesis' &&
      (/Form 8-K filing|will include the full text of/i.test(t) ||
        /examining the matter|will look into the matter/i.test(t))
    ) {
      toBackground(r, 'cleanup: process note')
      changed++
      continue
    }

    // Thin "how long could X continue" with no substance.
    if (
      r.debate_role === 'thesis' &&
      /^How long could the matter continue\?/i.test(q)
    ) {
      toBackground(r, 'cleanup: empty duration prediction')
      changed++
      continue
    }

    // Vaccinate children — keep thesis but fix question if weak.
    if (/Parents should vaccinate their children against measles/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Should parents vaccinate their children against measles?'
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'FAVOR'
      r.key_point = 'Vaccinate children against measles'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // Vote for X — tighten question.
    if (/People should vote for Mike Rogers/i.test(t)) {
      r.question = 'Should voters elect Mike Rogers?'
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'FAVOR'
      r.key_point = 'Elect Mike Rogers'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // H-1B freeze — ensure thesis.
    if (/No Texas public school employees should work under H-1B/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Should Texas ban H-1B visas for public school employees?'
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'FAVOR'
      r.key_point = 'Ban school H-1B visas'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // ICC targeting — thesis.
    if (/ICC's ability to target American nationals/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = "Should the ICC be able to target U.S. nationals?"
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'AGAINST'
      r.key_point = 'End ICC targeting of Americans'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // Interest rates / inflation.
    if (/Interest rates must be raised to address inflation/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Should the Federal Reserve raise interest rates to fight inflation?'
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'FAVOR'
      r.key_point = 'Raise rates against entrenched inflation'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // Medicare for all.
    if (/El-Sayed supports establishing Medicare for all/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Should the United States establish Medicare for all?'
      r.question_type = 'policy'
      r.exclusivity = 'exclusive'
      r.polarity = 'FAVOR'
      r.key_point = 'Establish Medicare for all'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }

    // AI control.
    if (/maintain control of artificial intelligence simply by outthinking/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Can humanity maintain control of advanced AI by outthinking it?'
      r.question_type = 'factual'
      r.exclusivity = 'exclusive'
      r.polarity = 'DENIES'
      r.key_point = 'Outthinking AI will not retain control'
      r.notes = 'cleanup: factual not policy'
      changed++
      continue
    }

    // COVID vax benefits.
    if (/benefits of COVID-19 vaccination outweigh its risks/i.test(t)) {
      r.debate_role = 'thesis'
      r.question = 'Do the benefits of COVID-19 vaccination outweigh the risks for pregnant women?'
      r.question_type = 'factual'
      r.exclusivity = 'exclusive'
      r.polarity = 'AFFIRMS'
      r.key_point = 'Benefits outweigh risks'
      r.notes = 'cleanup: tightened question'
      changed++
      continue
    }
  }

  fs.writeFileSync(PATH, toCsv(headers, rows), 'utf8')
  const thesis = rows.filter((r) => r.debate_role === 'thesis').length
  const premise = rows.filter((r) => r.debate_role === 'premise').length
  const background = rows.filter((r) => r.debate_role === 'background').length
  const withQ = rows.filter((r) => r.question && r.question !== 'none').length
  console.log(`cleanup changed=${changed}`)
  console.log(`roles: thesis=${thesis} premise=${premise} background=${background} with_question=${withQ}`)
}

main()
