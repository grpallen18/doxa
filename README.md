# Doxa

A community-calibrated political knowledge graph that helps people understand disagreement without radicalization.

## Overview

Doxa is a **meta-analysis layer over the news**, not a news publisher. It aggregates coverage of a given story across publishers and produces a structured, neutral synthesis: verifiable facts separated from interpretation, major ideological or narrative clusters mapped, and clear statements of where viewpoints agree, diverge, or misrepresent one another. Each story is a navigable **node** that links to primary sources, highlights gaps or under-coverage, flags common framing or straw-man arguments, and surfaces strong arguments on each side. User feedback is central—readers flag omissions, mischaracterizations, or weak framing; that feedback is clustered and fed into revisions so the model improves over time. Discovery is Wikipedia-like (deep links between related topics); personalization happens in the background via reading behavior and structured feedback, not upfront ideological labels.

## What Doxa Is For (and Not For)

**Do:** Act as a truth-seeking **navigation system**. Publish **models of how news is framed**—facts at the core, perspectives around them, confidence levels attached, revision driven by aggregated dissent. Let a synthesized "consensus narrative" exist only as an optional, derived artifact ("if you wanted to explain this to a neutral third party using the strongest agreed-upon facts") once the analytical spine is mature. Keep basic access to understanding free; use freemium for enhanced insight (advanced comparisons, longitudinal tracking, deeper analytics), not for gating truth discovery.

**Don't:** Compete on breaking news, speed, or original reporting. Don't host full articles or shallow headline summaries. Don't present a single "correct" narrative or editorialize under the guise of neutrality. Don't allow raw, unstructured comments to dominate (no Reddit-style chaos). Don't ask users to self-identify ideologically upfront—clustering should emerge from behavior and responses. Avoid full articles for now to protect focus and legitimacy; leave the door open once the analytical spine is proven.

**Principle:** Doxa is a place to **navigate** controversy, not to consume opinions. Each node is a living model: facts at the core, perspectives around it, confidence attached, revision by reasoned dissent. Over time, users learn where they stand, how others genuinely think, and where common ground actually exists.

## Strategy: Wikipedia surface, pluralist governance

Imitate **Wikipedia’s surface**, not its governance logic. Use a big search bar, topic pages, citations, and dense linking so the product feels familiar and navigable. Do **not** adopt neutral point of view, verifiability, or notability as editorial rules. Instead, use **structured pluralism**: conservative, liberal, libertarian, institutional, populist, and other viewpoints are allowed to exist openly. Score them for **factual grounding**, **popularity**, and **internal coherence**—so users see how perspectives differ and how well each is supported, not a single “neutral” synthesis.

## Doxa Topic Lifecycle (Canonical Process)

### 1. Source Ingestion

For a given topic, Doxa gathers a wide and ideologically diverse set of sources (articles, podcasts, videos, blogs, RSS feeds, etc.) via APIs and web scraping. Each source is stored with metadata (publisher, timestamp, medium, URL). Doxa does not republish these sources; they serve as evidence only.

### 2. Claim Extraction (Fact First)

All sources are decomposed into atomic claims (discrete factual statements or assertions). Each claim is linked to one or more sources as evidence. Claims may later be scored for confidence, dispute level, or consensus. This layer is the factual substrate of the system.

### 3. Core Facts Synthesis

Using only extracted claims (not opinions), Doxa generates a fact-first, paragraph-style narrative explaining the topic in neutral language (Wikipedia-like).

This section aims to describe what happened, what is verifiably known, and what constraints exist (legal, temporal, institutional).

The Core Facts are explicitly not a summary of viewpoints.

This output becomes the Core Facts section for a new topic_version.

### 4. Viewpoint Clustering

Interpretive claims, arguments, and framing choices are clustered into Viewpoint Clusters (e.g., Progressive, Conservative, Institutional, Libertarian, etc.) based on semantic similarity and source alignment.
Each cluster contains:

- A summarized worldview or framing
- Key arguments (viewpoint_points)
- References to supporting and contradicting claims

These clusters are presented as parallel, first-class perspectives—none is suppressed or collapsed into a single narrative.

### 5. Coverage & Framing Analysis

Doxa analyzes how the topic was covered across publishers:

- What each cluster emphasizes or omits
- Common framing techniques or straw-man arguments
- Topics or data points that are under-covered or missing entirely

This produces structured sections like How It Was Covered and What's Missing.

### 6. Publish Topic Version

All generated content (Core Facts, Viewpoint Clusters, coverage analysis, sources) is stored as an immutable topic_version. Topic pages always point to the latest published version, while older versions remain auditable.

### 7. User Feedback Loop

Users can submit structured feedback (critiques) such as:

- Missing facts
- Poor representation of a viewpoint
- Misclassified or weakly supported claims

Users may also respond to polls tied to specific claims or viewpoints.

### 8. Critique Aggregation & Revision Gate

User critiques are clustered into recurring issues. A new topic_version is triggered only when predefined thresholds are met (e.g., repeated high-quality critiques, new credible sources, factual corrections). This prevents churn and preserves epistemic stability.

### 9. Iterative Improvement

When triggered, the process repeats: new sources and critiques are ingested, claims are updated, and a revised version is published. Over time, each topic converges toward greater clarity, better framing, and a more complete representation of disagreement.

### Core Principle

Doxa does not publish news.
Doxa publishes structured models of facts, disagreement, and framing, continuously refined through evidence and reasoned dissent.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + React + TypeScript
- **Backend:** Next.js API routes + Supabase (PostgreSQL)
- **Graph Visualization:** react-force-graph-2d
- **AI Integration:** OpenAI API
- **Styling:** Tailwind CSS

## Design System (UI Aesthetic)

The site uses a **neumorphic, instrument-panel** look: warm light gray surfaces, soft beveled panels (top-left highlight, bottom-right shadow), and minimal accent color. Stay consistent by:

- **Background:** Warm off-white / light gray (`--background`, `--surface` in `app/globals.css`). No pure white.
- **Panels & cards:** Same base as background but 2–4% lighter; use the shared `Panel` component and token-driven shadows (`--shadow-panel-soft`, `--shadow-panel-hover`). Consistent radius (e.g. `--radius-lg`).
- **Shadows:** Soft, low contrast; light from top-left. No harsh drop shadows. Use CSS variables in `globals.css`, not inline `box-shadow`.
- **Color:** Mostly monochrome. **Primary accent** (`--accent-primary`) for primary CTAs and signal indicators; **secondary accent** (`--accent-secondary`) for secondary states. Text: `--foreground`, `--muted`, `--muted-soft`.
- **Typography:** Modern sans (system UI / Inter-style), plenty of whitespace, clear hierarchy. No decorative fonts.
- **Components:** Use `Panel`, `Button`, and (where relevant) `InstrumentModule` from `components/`. Prefer design tokens and Tailwind theme keys from `tailwind.config.ts`; avoid inline hex colors or shadow strings.
- **Spacing:** Align to an 8pt grid (e.g. 8, 12, 16, 24, 32) for padding, gaps, and margins.

Tokens and component classes live in `app/globals.css` and `tailwind.config.ts`. New surfaces should follow the same beveled-panel and token usage so the app feels like one piece of equipment.

## Navigation & Key Pages

- **Home (`/`):** Search-first landing page with a big search bar, a weekly poll (placeholder), a \"Trending stories\" panel of topic nodes, a simple \"How it works\" section, and a CTA band inviting users to create a free profile (no paid features).
- **Search (`/search`):** Placeholder search results page that echoes the query and shows static example topics; a real search backend is not yet implemented.
- **Profile (`/profile`):** Account & ideology stub page showing read-only, placeholder factor ratings and an overall ideology label; the real ideology engine is not yet implemented.
- **Node map (graph) (`/graph`):** From the main page, click **Topics** in the top navigation bar to open the interactive knowledge graph. The node map shows political topics as nodes; click a node to open its topic page at `/page/[id]`.

## Getting Started

1. **Install dependencies:**
```bash
npm install
```

2. **Set up Supabase database:**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Run `supabase/migrations/001_initial_schema.sql` to create tables
   - Run `supabase/seed.sql` to populate with sample data
   - See `supabase/README.md` for detailed instructions

3. **Set up environment variables:**
   - Create `.env.local` file in the root directory
   - Add your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
   ```
   - Add OpenAI API key (optional, for content generation):
   ```
   OPENAI_API_KEY=your_key_here
   ```

4. **Run the development server:**
```bash
npm run dev
```

5. **Open [http://localhost:3000](http://localhost:3000) in your browser.**

## Project Structure

```
doxa/
├── app/                        # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── graph/             # Graph data (nodes + relationships)
│   │   ├── nodes/             # Node details API
│   │   ├── perspectives/      # Perspective-related APIs
│   │   │   └── vote/          # Viewpoint upvote/downvote endpoint
│   │   └── validate/          # Representation validation endpoint
│   ├── globals.css            # Design tokens and neumorphic component classes
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Home (search-first landing)
│   ├── search/                # Search results (placeholder)
│   ├── profile/               # Profile & ideology stub
│   ├── page/[id]/             # Topic detail pages
│   ├── graph/                 # Node map (graph visualization)
│   ├── error.tsx              # Route-level error boundary
│   ├── global-error.tsx       # Global error boundary
│   └── not-found.tsx          # 404 page
├── components/                # React components
│   ├── Panel.tsx              # Beveled panel (design system)
│   ├── Button.tsx             # Primary/secondary button (design system)
│   ├── InstrumentModule.tsx   # Instrument-style metric module
│   ├── LandingHeader.tsx      # Shared nav (home + graph pages)
│   ├── graph/                 # Graph visualization components
│   └── node/                  # Node detail UI (perspectives, validation)
├── lib/                       # Utilities and helpers
│   ├── supabase/              # Supabase client helpers
│   └── types/                 # Shared TypeScript types
└── steering-document.md       # Project philosophy and design
```

## Database Schema

See the Supabase migrations for the complete schema. Key tables:
- `nodes` - Core Doxa nodes (political questions and their versioned snapshots, including `core_facts`, `coverage_summary`, `missing_perspectives`)
- `perspectives` - Perspective definitions
- `node_perspectives` - Many-to-many relationship between nodes and perspectives, including each perspective's `core_claim` and key arguments
- `node_relationships` - Graph edges between nodes
- `sources` - Source citations for nodes and perspectives
- `claims` / `claim_sources` - Minimal claim-level scaffolding to eventually link atomic claims to sources (not yet surfaced in the UI)
- `validations` - User validation feedback about whether a perspective is fairly represented for a given node/version
- `perspective_votes` - Viewpoint upvote/downvote records with free-text reasoning for each node/version/perspective

## Development

See `steering-document.md` for the complete project philosophy and design principles. Product and UX decisions should align with the \"What Doxa Is For (and Not For)\" section above so the site stays focused on epistemic clarity and depolarization, not on becoming a news destination or opinion platform.

### Topic Lifecycle: Implementation Status

The **Doxa Topic Lifecycle** described above is the canonical product vision. The current implementation reflects it **partially**:

- **Claims & topic versions:** The database has a `claims` table and versioned `nodes` rows (via `version` and `parent_version_id`), but claims are not yet exposed in the UI, and only one version per demo topic exists today.
- **Core Facts:** Each node has a `core_facts` field that holds a fact-first narrative; this is rendered on topic pages alongside structured `shared_facts`.
- **Coverage & framing:** `coverage_summary` (\"How It Was Covered\") and `missing_perspectives` (\"What’s Missing\") are optional text fields on nodes and are rendered when present.
- **Feedback & scoring:** `validations` capture whether a perspective is fairly represented; `perspective_votes` capture upvote/downvote assessments plus free-text reasoning for each viewpoint.

## Planned / not yet implemented

The following are out of scope for the current phase and should be tackled later. Document here so they are not forgotten.

- **Auth and access:** Sign-up and log-in are required to access the site; the site is completely free (no paid features for now). Build **nice sign-in and sign-up pages** when implementing auth—on-brand, clear UX. Gate the site behind login once auth exists.
- **Poll backend:** Real poll questions and answers in the database; persistence and participation (e.g. sign-in to participate).
- **Trending data:** Real data sources for "Trending" stories (e.g. traffic, multi-outlet coverage); for now use static/curated lists.
- **Search API:** Wire the search bar to a backend that searches nodes by query (e.g. by headline/topic).
- **Ideology engine:** Doxa's proprietary system that computes a user's **factor ratings** (e.g. fiscal, social, foreign policy) from behavior—not user-controlled; displayed as read-only on the profile. Plus an **overall ideology** assignment. When implementing, consider existing **political science grading systems** (e.g. for categorizing people into named ideologies).
- **Vote feedback modal:** The **Confirm** button in the perspective vote modal (shown when a user clicks Upvote or Downvote on a topic page) should send the user's free-text feedback to the DB to store the critique (e.g. via `perspective_votes.reason` and the existing `/api/perspectives/vote` endpoint). For now, both Cancel and Confirm only close the modal.
- **Paid features:** None for now. If paid tiers are introduced later (e.g. poll participation, features that influence the feedback loop), document the model in this README.
