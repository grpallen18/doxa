PROJECT: Doxa
TYPE: Consumer political literacy web app
GOAL: Reduce political fragmentation by structuring disagreement and letting communities
calibrate narratives through validation rather than authority.

========================================
SUPABASE CREDENTIALS
========================================
VITE_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S

Note: For Next.js, these will be prefixed with NEXT_PUBLIC_ instead of VITE_

========================================
CORE PHILOSOPHY
========================================
Doxa is NOT a news outlet.
Doxa is NOT a single source of truth.

It is a meta-news platform whose credibility comes from:
- Standardized structure
- Transparent sourcing
- Community validation of REPRESENTATION (not agreement)

We start with existing media narratives and iteratively calibrate them
using real people’s feedback to make them reliable again.

Trust is procedural, not institutional.

========================================
CORE UNIT: DOXA TOPIC
========================================
A Doxa topic answers ONE narrowly scoped political question.

Examples:
- “Are undocumented immigrants eligible for welfare programs?”
- “What happened during the Minneapolis ICE protest?”
- “What does CBP mean by an ‘encounter’?”

NOT:
- “Immigration”
- “The border crisis”

Each topic must be:
- Narrow
- Concrete
- Reusable
- Linkable to many other nodes

========================================
MULTI-PERSPECTIVE MODEL
========================================
An SBS node may contain MORE THAN TWO perspectives.

Perspectives are NOT hardcoded.
They emerge from user clustering over time.

Examples of potential perspectives:
- Conservative
- Libertarian
- Neoconservative
- Progressive
- Democratic Socialist
- Socialist
- Nationalist
- Populist
- etc.

Viewpoints are:
- Derived from user behavior + surveys
- Dynamic and revisable
- Topic-specific (a user may align differently per issue)

========================================
DOXA TOPIC STRUCTURE (FLEXIBLE, BUT STRICT)
========================================
Every Doxa topic contains:

1. Question (clear, neutral, narrow)
2. Viewpoint Sections (N viewpoints)
   For EACH perspective:
   - Core claim
   - Key arguments
   - What this perspective emphasizes or deprioritizes
3. Shared Facts / Definitions
   - Metrics, dates, legal definitions
   - Measurement caveats
4. Sources
   - Curated, ideology-aligned sources per perspective
   - Primary documents preferred when applicable

AI MAY summarize and normalize.
AI MUST NOT invent arguments.

========================================
CONTENT GENERATION WORKFLOW
========================================
1. A new Doxa node is proposed (manual or demand-driven).
2. AI ingests content from curated source pools:
   - Ideology-aligned media sources
   - Primary documents (laws, court rulings, government data)
3. AI pipelines:
   - Extract arguments per perspective
   - Normalize into standard schema
   - Identify shared facts / definitions
   - Attach citations
4. Node is published as “Draft / Under Review”.

========================================
USER PROFILING (NO SELF-LABELING)
========================================
Users are NOT asked to self-identify ideology directly.

Instead:
- Users complete a short, evolving survey
- Their responses are clustered into ideological profiles
- Clusters may change over time as views evolve

A user may:
- Align with different clusters on different topics
- Be uncertain or transitional

This avoids identity lock-in.

========================================
USER VALIDATION (MOST IMPORTANT PART)
========================================
Users are asked:

“Is your viewpoint fairly represented on this topic?”

NOT:
- “Do you agree?”
- “Is this true?”
- “Does your side win?”

Validation is about REPRESENTATION, not correctness.

========================================
VALIDATION OUTCOMES
========================================
For each perspective:

- High validation → representation is accurate
- Low validation → representation needs revision

Possible global states:
- Most perspectives validate → node is stable
- One or more perspectives fail → revise ONLY those sections
- Most perspectives fail → question is mis-scoped

========================================
REVISION VS NEW NODE DECISION
========================================
REVISE CURRENT NODE if feedback indicates:
- Misframing
- Missing arguments
- Incorrect emphasis
- Outdated interpretation

CREATE A NEW NODE if feedback indicates:
- The question is doing too much
- Disagreement is driven by definitions or metrics
- Users repeatedly ask the same follow-up question
- Multiple concepts are being conflated

Revision = representation problem  
New node = scope problem

========================================
TOPIC GRAPH (TRUE GRAPH, NOT TREE)
========================================
Nodes exist in a MANY-TO-MANY graph.

Relationships may be:
- Parent / child
- Depends on
- Contextual to
- Related event
- Shared actor

Circular paths ARE allowed.

Example:
Trump ↔ Immigration ↔ Minneapolis ICE protest
↔ Tim Walz ↔ Kamala Harris ↔ Trump

The graph is exploratory by design.
Rabbit holes are a feature, not a bug.

========================================
AI’S ROLE (STRICTLY DEFINED)
========================================
AI IS USED FOR:
- Reading and summarizing large volumes of content
- Structuring arguments consistently
- Detecting scope overflow
- Drafting revisions based on validation feedback
- Proposing candidate nodes when demand signals exist

AI IS NOT USED FOR:
- Declaring truth
- Deciding ideology
- Ranking perspectives morally
- Publishing without validation gates

========================================
ANTI-SLOP SAFEGUARDS
========================================
- No node without a clear question
- No node without minimum source counts
- No node promoted to “Stable” without validation thresholds
- New nodes are demand-driven, not AI-pushed
- Graph depth is user-pulled

========================================
MENTAL MODEL
========================================
Think:
“Community-calibrated media narratives”

Media provides the raw narrative.
AI structures it.
People correct it.

Articles DO evolve — but only through structured,
transparent, community-sourced input.

========================================
IMPLEMENTATION NOTES
========================================
- Nodes are versioned
- Validation is version-specific
- All changes are auditable
- No scraping of paywalled content
- Prefer RSS, YouTube transcripts, podcasts (via transcription),
  and primary documents

========================================
END GOAL
========================================
Build a living, community-validated political knowledge graph
that helps people understand disagreement without radicalization.
