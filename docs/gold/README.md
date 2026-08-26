# CQ gold worksheet

Labeled atoms for the L3 Question-first overhaul. **Do not** grade old Controversies.

Steering: [Doxa Architecture Overhaul Plan](../Doxa%20Architecture%20Overhaul%20Plan.md).

**Status:** Labels **approved** for Session 2 seed and eval (2026-08-21). Seed with `npx tsx scripts/seed-question-registry.ts`; evaluate with `npx tsx scripts/eval-question-gold.ts`.

## Files

| File | Purpose |
|------|---------|
| `cq-propositions.csv` | Thesis-like propositions from Neo (`speechAct` / `HAS_ROLE` filter), up to 300 rows |
| `cq-question-pairs.csv` | Hand-seeded near-miss question pairs for retrieve/mint evaluation |

## Label `cq-propositions.csv`

| Column | Values |
|--------|--------|
| `debate_role` | `thesis` / `premise` / `background` |
| `question` | Interrogative this proposition answers, or `none` |
| `question_type` | `policy` / `factual` / `causal` / `definitional` — **definitional rows feed Dispute detection** (Session 5) |
| `exclusivity` | `exclusive` / `compatible` / `unknown` (for the question) |
| `polarity` | `FAVOR` / `AGAINST` / `QUALIFY` / `AFFIRMS` / `DENIES` / `UNCERTAIN` / `NONE` |
| `key_point` | Short recurring reason, or blank if premise-only — **eval contract for Viewpoint clustering** (Session 4) |
| `notes` | Free text (`cleanup:…` = automated fix; edit freely) |

## Label `cq-question-pairs.csv`

| Column | Values |
|--------|--------|
| `label` | `same` / `adjacent` / `unrelated` |

Seed the live Question registry from **canonical questions you write here**, not from legacy `name_controversies` captions.

**Prune allowlist:** [`prune-allowlist.json`](prune-allowlist.json) — Document uids protected from older-first prune. Gold proposition Documents are also auto-protected by `scripts/prune-oldest-documents.ts`.

**L3 verify fixtures:** [`l3-verify-fixtures.json`](l3-verify-fixtures.json) — shared Questions + opposing prop uids for `npm run verify:l3`.

## Review tips

- Prefer **background** when the line is a product blurb, sports schedule, condolence, or empty process note.
- Prefer **premise** when the line is evidence, not a side.
- Prefer a **specific contested question** over “What happened?” / “What does X provide?”
- Policy polarity uses `FAVOR`/`AGAINST`; factual uses `AFFIRMS`/`DENIES`.

## Regenerating

```bash
npx tsx scripts/export-cq-gold.ts          # overwrites unlabeled export
npx tsx scripts/label-cq-gold.ts           # LLM draft (needs OPENAI_API_KEY)
npx tsx scripts/cleanup-cq-gold-labels.ts  # light rule cleanups
npx tsx scripts/seed-question-registry.ts  # embed + MERGE :Question from approved gold
npx tsx scripts/eval-question-gold.ts      # near-miss + attach bar
```

Requires `NEO4J_*` + `OPENAI_API_KEY` in `.env.local`. Copy labeled files aside before re-export.
