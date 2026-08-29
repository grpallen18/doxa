# Question grain contract

One Question per **contested decision or disputed fact**, stated at the most general level at which the **same evidence and the same arguments** apply.

Prefer the entity-general form when swapping a named entity would not change the argument. Split only when the **decision criteria** differ — not when wording, timeframe, or a named actor differs.

This replaces the old mint instruction “prefer under-claim / keep the question narrow to what this one proposition answers.” A question shaped around a single sentence cannot densify.

## Admit vs mint

- **Admit** a proposition when it answers this decision (even if it names a different outlet, date, or person).
- **Mint** only from an intra-document contrast pair (objection/rebuttal) **or** a cross-document cluster of ≥ 2 unbound propositions. A singleton never founds a Question.

## Same (merge / admit)

| Too narrow | Registry grain |
|---|---|
| Should the US send more HIMARS to Ukraine this quarter? | Should the US continue military aid to Ukraine? |
| Did Trump's 2025 steel tariffs raise consumer prices? | Did the 2025 US steel tariffs raise consumer prices? |
| Is RFK Jr. wrong about measles vaccine risks? | Do measles vaccines cause serious harm at population scale? |

## Adjacent (do not merge)

| A | B | Why adjacent |
|---|---|---|
| Should the US continue military aid to Ukraine? | Will Ukraine win if aid continues? | Policy vs prediction |
| What is the primary cause of inflation in 2022? | What caused inflation in 2022? | Exclusive primary-cause vs open multi-cause |
| Should Harvard consider race in admissions? | Is affirmative action fair? | Specific policy lever vs moral framing |
| Should the US fund Ukraine reconstruction? | Should the US continue military aid to Ukraine? | Different spend / decision |

## Unrelated

Do not attach a proposition about sports, product launches, or a different country's analogous debate unless the arguments and evidence actually transfer.

## Answer-form statements

Each Question stores canonical **pro** and **con** answer statements (declarative). Retrieval matches proposition embeddings to those statements, not to the interrogative text.

Example:

- Question: `Should the US continue military aid to Ukraine?`
- Pro: `The United States should continue military aid to Ukraine.`
- Con: `The United States should not continue military aid to Ukraine.`
