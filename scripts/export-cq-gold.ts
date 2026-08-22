/**
 * Export thesis-like propositions for the CQ gold worksheet.
 * Loads NEO4J_* from .env.local. Writes docs/gold/*.csv + README.
 *
 * Usage: npx tsx scripts/export-cq-gold.ts
 */

import { config as loadDotenv } from 'dotenv'
import fs from 'fs'
import path from 'path'
import neo4j, { type Driver } from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'gold')

loadDotenv({ path: path.join(REPO_ROOT, '.env.local') })

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function joinList(values: unknown): string {
  if (!Array.isArray(values)) return ''
  return values
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join('|')
}

const QUESTION_PAIRS: Array<{
  question_a: string
  question_b: string
  label: string
  notes: string
}> = [
  {
    question_a: 'Should the United States continue military aid to Ukraine?',
    question_b: 'Should NATO admit Ukraine as a member?',
    label: '',
    notes: 'adjacent geopolitics; different decisions',
  },
  {
    question_a: 'Should the United States continue military aid to Ukraine?',
    question_b: 'Should Washington keep sending weapons to Kyiv?',
    label: '',
    notes: 'paraphrase of same policy CQ',
  },
  {
    question_a: 'Should the United States continue military aid to Ukraine?',
    question_b: 'Who should finance Ukraine reconstruction?',
    label: '',
    notes: 'related entities; different question',
  },
  {
    question_a: 'What caused the post-pandemic increase in U.S. inflation?',
    question_b: 'What was the primary cause of post-pandemic U.S. inflation?',
    label: '',
    notes: 'compatible vs exclusive framing',
  },
  {
    question_a: 'Did fiscal stimulus materially contribute to inflation?',
    question_b: 'Did supply-chain disruption materially contribute to inflation?',
    label: '',
    notes: 'compatible causal answers if exclusivity=compatible',
  },
  {
    question_a: 'Was the 2021 Afghanistan withdrawal handled competently?',
    question_b: 'Should the United States have withdrawn from Afghanistan in 2021?',
    label: '',
    notes: 'quality vs policy',
  },
  {
    question_a: 'Should abortion access remain a federal constitutional right?',
    question_b: 'What gestational limit should abortion law use?',
    label: '',
    notes: 'adjacent reproductive-policy questions',
  },
  {
    question_a: 'Will tariffs raise consumer prices?',
    question_b: 'Should the United States raise tariffs on Chinese goods?',
    label: '',
    notes: 'predictive vs policy',
  },
  {
    question_a: 'Is affirmative action fair?',
    question_b: 'Should universities consider race in admissions?',
    label: '',
    notes: 'normative vs policy near-miss',
  },
  {
    question_a: 'Who bears primary responsibility for the federal budget deficit?',
    question_b: 'Should Congress cut discretionary spending?',
    label: '',
    notes: 'attribution vs policy',
  },
]

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'
  if (!uri || !username || !password) {
    throw new Error('Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in .env.local')
  }

  const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })

  try {
    const result = await session.run(
      `
      MATCH (p:Proposition)
      OPTIONAL MATCH (u:Utterance)-[:EXPRESSES]->(p)
      OPTIONAL MATCH (a:Argument)-[hr:HAS_ROLE]->(p)
      WITH p,
           collect(DISTINCT u.speechAct) AS acts,
           collect(DISTINCT hr.role) AS roles
      WHERE any(x IN acts WHERE x IN ['prescription','judgment','allegation','prediction'])
         OR any(r IN roles WHERE r IN ['conclusion','objection','rebuttal','prediction'])
      RETURN p.uid AS proposition_uid,
             coalesce(p.text, p.normalizedText, '') AS text,
             acts,
             roles
      ORDER BY p.uid
      LIMIT 300
      `
    )

    fs.mkdirSync(OUT_DIR, { recursive: true })

    const propHeader = [
      'proposition_uid',
      'text',
      'speech_acts',
      'has_roles',
      'debate_role',
      'question',
      'question_type',
      'exclusivity',
      'polarity',
      'key_point',
      'notes',
    ].join(',')

    const propRows = result.records.map((rec) => {
      const uid = String(rec.get('proposition_uid') ?? '')
      const text = String(rec.get('text') ?? '').replace(/\s+/g, ' ').trim()
      const acts = joinList(rec.get('acts'))
      const roles = joinList(rec.get('roles'))
      return [
        csvEscape(uid),
        csvEscape(text),
        csvEscape(acts),
        csvEscape(roles),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(',')
    })

    fs.writeFileSync(
      path.join(OUT_DIR, 'cq-propositions.csv'),
      [propHeader, ...propRows].join('\n') + '\n',
      'utf8'
    )

    const pairHeader = 'question_a,question_b,label,notes'
    const pairRows = QUESTION_PAIRS.map((p) =>
      [csvEscape(p.question_a), csvEscape(p.question_b), csvEscape(p.label), csvEscape(p.notes)].join(
        ','
      )
    )
    fs.writeFileSync(
      path.join(OUT_DIR, 'cq-question-pairs.csv'),
      [pairHeader, ...pairRows].join('\n') + '\n',
      'utf8'
    )

    const readme = `# CQ gold worksheet

Labeled atoms for the L3 Question-first overhaul. **Do not** grade old Controversies.

Steering: [Doxa Architecture Overhaul Plan](../Doxa%20Architecture%20Overhaul%20Plan.md).

## Files

| File | Purpose |
|------|---------|
| \`cq-propositions.csv\` | Thesis-like propositions from Neo (\`speechAct\` / \`HAS_ROLE\` filter), up to 300 rows |
| \`cq-question-pairs.csv\` | Hand-seeded near-miss question pairs for retrieve/mint evaluation |

## Label \`cq-propositions.csv\`

| Column | Values |
|--------|--------|
| \`debate_role\` | \`thesis\` / \`premise\` / \`background\` |
| \`question\` | Interrogative this proposition answers, or \`none\` |
| \`question_type\` | \`policy\` / \`factual\` / \`causal\` / \`definitional\` |
| \`exclusivity\` | \`exclusive\` / \`compatible\` / \`unknown\` (for the question) |
| \`polarity\` | \`FAVOR\` / \`AGAINST\` / \`QUALIFY\` / \`AFFIRMS\` / \`DENIES\` / \`UNCERTAIN\` / \`NONE\` |
| \`key_point\` | Short recurring reason, or blank if premise-only |
| \`notes\` | Free text (near-miss pointers, etc.) |

## Label \`cq-question-pairs.csv\`

| Column | Values |
|--------|--------|
| \`label\` | \`same\` / \`adjacent\` / \`unrelated\` |

Seed the live Question registry from **canonical questions you write here**, not from legacy \`name_controversies\` captions.

## Regenerating

\`\`\`bash
npx tsx scripts/export-cq-gold.ts
\`\`\`

Requires \`NEO4J_*\` in \`.env.local\`. Re-export overwrites CSVs; copy labeled files aside first.
`

    fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme, 'utf8')

    console.log(`Wrote ${propRows.length} propositions and ${pairRows.length} question pairs to ${OUT_DIR}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
