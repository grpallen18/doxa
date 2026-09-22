# Doxa

A community-calibrated political knowledge graph that helps people understand disagreement without radicalization.

**One-liner (for LLMs):** Doxa is a political wiki for exploring topics from multiple viewpoints.

**Future domain:** doxas.io (not yet purchased).

## Overview

Doxa is a **meta-analysis layer over the news**, not a news publisher. It aggregates coverage of a given story across publishers and produces a structured, neutral synthesis: verifiable facts separated from interpretation, major ideological or narrative clusters mapped, and clear statements of where viewpoints agree, diverge, or misrepresent one another. Each story is a navigable **topic** that links to primary sources, highlights gaps or under-coverage, flags common framing or straw-man arguments, and surfaces strong arguments on each side. User feedback is central—readers flag omissions, mischaracterizations, or weak framing; that feedback is clustered and fed into revisions so the model improves over time. Discovery is Wikipedia-like (deep links between related topics); personalization happens in the background via reading behavior and structured feedback, not upfront ideological labels.

## What Doxa Is For (and Not For)

**Do:** Act as a truth-seeking **navigation system**. Publish **models of how news is framed**—facts at the core, perspectives around them, confidence levels attached, revision driven by aggregated dissent. Let a synthesized "consensus narrative" exist only as an optional, derived artifact ("if you wanted to explain this to a neutral third party using the strongest agreed-upon facts") once the analytical spine is mature. Keep basic access to understanding free; use freemium for enhanced insight (advanced comparisons, longitudinal tracking, deeper analytics), not for gating truth discovery.

**Don't:** Compete on breaking news, speed, or original reporting. Don't host full articles or shallow headline summaries. Don't present a single "correct" narrative or editorialize under the guise of neutrality. Don't allow raw, unstructured comments to dominate (no Reddit-style chaos). Don't ask users to self-identify ideologically upfront—clustering should emerge from behavior and responses. Avoid full articles for now to protect focus and legitimacy; leave the door open once the analytical spine is proven.

**Principle:** Doxa is a place to **navigate** controversy, not to consume opinions. Each topic is a living model: facts at the core, viewpoints around it, confidence attached, revision by reasoned dissent. Over time, users learn where they stand, how others genuinely think, and where common ground actually exists.

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

- **Frontend:** Next.js 15 (App Router) + React + TypeScript
- **Backend:** Next.js API routes + Supabase (PostgreSQL) + Neo4j AuraDB (graph-worker)
- **AI Integration:** OpenAI API (ingestion/graph); Grok via xAI MCP for L3 debate review
- **Styling:** Tailwind CSS
- **UI primitives:** [shadcn/ui](https://ui.shadcn.com/) under `components/ui/`
- **UI motion:** [Motion Primitives](https://motion-primitives.com) (`motion` + copy-paste components under `components/motion-primitives/`) — prefer these for React animations the same way we prefer shadcn for primitives
- **Agent UI tooling:** Official [shadcn skill](https://ui.shadcn.com/docs/skills) in `.agents/skills/shadcn` (Cursor entry under `.cursor/skills/shadcn`) plus the [shadcn MCP](https://ui.shadcn.com/docs/mcp) in `.cursor/mcp.json`. Project overlays live in `.cursor/rules/shadcn.mdc`. Refresh with `npm run ui:skills:update`; inspect config with `npm run ui:info`.

## Design System (UI Aesthetic)

The site uses a **neumorphic, instrument-panel** look: warm light gray surfaces, soft beveled panels (top-left highlight, bottom-right shadow), and minimal accent color. Stay consistent by:

- **Background:** Warm off-white / light gray (`--background`, `--surface` in `app/globals.css`). No pure white.
- **Panels & cards:** Same base as background but 2–4% lighter; use the shared `Panel` component and token-driven shadows (`--shadow-panel-soft`, `--shadow-panel-hover`). Consistent radius (e.g. `--radius-lg`).
- **Shadows:** Soft, low contrast; light from top-left. No harsh drop shadows. Use CSS variables in `globals.css`, not inline `box-shadow`.
- **Color:** Mostly monochrome. **Primary accent** (`--accent-primary`) for primary CTAs and signal indicators; **secondary accent** (`--accent-secondary`) for secondary states. Text: `--foreground`, `--muted`.
- **Typography:** Modern sans (system UI / Inter-style), plenty of whitespace, clear hierarchy. No decorative fonts.
- **Components:** Use `Panel`, `Button`, and (where relevant) `InstrumentModule` from `components/`. Prefer design tokens and Tailwind theme keys from `tailwind.config.ts`; avoid inline hex colors or shadow strings.
- **Motion:** Prefer [Motion Primitives](https://motion-primitives.com) for animated UI (CLI: `npx motion-primitives@latest add <name>` → `components/motion-primitives/`). Keep motion purposeful; don’t fight the neumorphic design system.
- **Spacing:** Align to an 8pt grid (e.g. 8, 12, 16, 24, 32) for padding, gaps, and margins.

Tokens and component classes live in `app/globals.css` and `tailwind.config.ts`. New surfaces should follow the same beveled-panel and token usage so the app feels like one piece of equipment.

## Navigation & Key Pages

**Account required:** every route except the landing page and the auth flow requires a session. Middleware redirects signed-out visitors to `/` (preserving the attempted path in `?redirect=`) and answers `/api/*` with `401` JSON. Signed-in visitors hitting `/` are sent to `/home`.

- **Landing (`/`):** Marble hero with the dark DOXA logo and the sign-up / log-in entry points. No app chrome, forced light theme. Shares a persistent `(marble)` layout with login/auth so the stone and statue stay mounted across those navigations. The old `/welcome` URL permanently redirects here.
- **Login (`/login`):** Sign-in (email/password + social OAuth) on the same marble scene, in a frosted `glass-panel` card. Links to sign-up and forgot-password.
- **Sign up / auth routes:** `/auth/sign-up`, `/auth/callback`, `/auth/confirm`, `/auth/forgot-password`, `/auth/update-password`, `/auth/error` — content columns under the shared marble layout and the forced light theme.
- **Home (`/home`):** Signed-in explore home — search, trending controversies from `graph_controversies`, featured topic hubs (`graph_topic_links`). When `DEBATE_REBUILD_MODE=true`, lists are empty and a maintenance banner is shown.
- **Search (`/search?q=`):** Controversies, then topics, then people (`/api/explore/search`).
- **Controversy (`/c/[uid]`):** Primary product page — question, sides, evidence, assessments, related debates, feedback.
- **Topic hub (`/topics/[slug]`):** Core facts + linked controversies (only listed when link density meets the hub bar). Nested: `/topics/[slug]/c/[uid]`.
- **People (`/people`, `/people/[uid]`):** Projected `graph_people` — debates a person appears in, not a bio. `/people/[uid]/eidos` is the eidos canvas when the graph has nodes.
- **Entity (`/entities/[uid]`):** Neo-backed dossier — controversies + propositions.
- **About (`/about`):** Mission copy.
- **Profile (`/profile`):** Account settings + theme preference (`/api/theme-preference`).
- **Legacy:** `/page/[id]` redirects to topic hub by slug; mock position routes redirect to the topic hub.
- **Admin** (`/admin/**`, role `admin`): Center, Stories, Neo, Debate (`/admin/graph-controversies`), L3 proposals (`/admin/l3-proposals`), Observability (`/admin/observability`; `/admin/health` redirects here).

Typography uses **Manrope** (`--font-app`). Prefer `Panel`, design-system `Button`, `DoxaLink`, shadcn primitives, and Motion Primitives — CSS variables only (see Design System above).

## Getting Started

1. **Install dependencies:**
```bash
npm install
```

2. **Set up Supabase database:**
   - See `supabase/README.md` for schema overview and migration/seed instructions.

3. **Set up environment variables:**
   - Create `.env.local` file in the root directory
   - Add your Supabase credentials (auth uses these for session cookies):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```
   - You can use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead of `NEXT_PUBLIC_SUPABASE_ANON_KEY` if your project provides it.
   - Add OpenAI API key (optional, for content generation):
   ```
   OPENAI_API_KEY=your_key_here
   ```
   - Add `SUPABASE_SERVICE_ROLE_KEY` for admin run-step / L3 apply / Neo inspection (same project as the URL above). Full variable list: [ENV_SETUP.md](ENV_SETUP.md).

4. **Configure Supabase Dashboard (Auth):**
   - **URL Configuration:** In [Auth → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration), set **Site URL** (e.g. `http://localhost:3000` for dev, `https://yourdomain.com` for production) and add **Redirect URLs**:  
     `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`, `http://localhost:3000/auth/forgot-password` (and production equivalents).
   - **Auth providers:** Enable **Email** (for sign-up/sign-in). For “Login with GitHub,” enable **GitHub** under [Auth → Providers](https://supabase.com/dashboard/project/_/auth/providers) and add your GitHub OAuth app credentials.
   - **Email templates:** In [Auth → Email Templates](https://supabase.com/dashboard/project/_/auth/templates), ensure **Confirm signup** and **Reset password** links point to your app:  
     - Sign-up: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`  
     - Recovery: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}`

5. **Run the development server:**
```bash
npm run dev
```

6. **Open [http://localhost:3000](http://localhost:3000).** Signed-out visitors see the marble landing (`/`). Sign in at `/login`. After a session, `/` redirects to `/home`.

## Project Structure

```
doxa/
├── middleware.ts               # Session refresh; unauthenticated → landing `/`; /api → 401 JSON
├── app/
│   ├── (marble)/               # Landing `/`, login, auth (shared marble scene)
│   ├── home/                   # Signed-in explore home
│   ├── search/ c/ topics/ people/ entities/ profile/ about/
│   ├── admin/                  # Stories, Neo, Debate, L3, Observability
│   └── api/                    # explore/, admin/, mcp/, slack/, theme-*, topics/, viewpoints/
├── components/                 # Panel, explore, admin, ui (shadcn), motion-primitives
├── lib/                        # supabase, explore, l3 (MCP/Slack), admin, debate-rebuild
├── doxa-agents/                # Pipeline handlers, catalog, generated docs
├── services/graph-worker/      # Python Neo4j utterance graph
├── integrations/               # grok-bots, slack-l3-approvals
├── workers/                    # Cloudflare scrape worker
├── API_ENDPOINTS.md            # Live HTTP surface
├── TESTING_GUIDE.md            # How to exercise APIs
└── ENV_SETUP.md                # Env vars and secrets
```

## Development

See `steering-document.md` for product philosophy. Schema and migrations: **supabase/README.md**. Pipeline catalog: **doxa-agents/AGENTS.md**.

**Live path:** ingest → scrape/clean → `graph_processing_jobs` → Python graph-worker (Neo4j) → `debate_pipeline` (bind / apply / project) → Grok L3 via MCP for mint/membership/viewpoints/audit. Postgres `graph_*` tables are projections for the explore UI.

- HTTP map: [API_ENDPOINTS.md](API_ENDPOINTS.md)
- Local API checks: [TESTING_GUIDE.md](TESTING_GUIDE.md)
- Observability: [docs/admin-observability.md](docs/admin-observability.md)
- L3 Grok + Slack: [doxa-agents/docs/grok-bot-architecture.md](doxa-agents/docs/grok-bot-architecture.md), [integrations/grok-bots/README.md](integrations/grok-bots/README.md)

## Planned / not yet implemented

The following are out of scope for the current phase and should be tackled later. Document here so they are not forgotten.

- **Auth and access:** Implemented. The site is gated: middleware redirects unauthenticated users to the landing page at `/`. Auth uses the Supabase UI Library pattern (shadcn-based forms): `/login` (sign-in + “Login with GitHub”), `/auth/sign-up`, `/auth/forgot-password`, `/auth/confirm` (email links), `/auth/callback` (OAuth/magic-link). Session is cookie-based via `@supabase/ssr`. Auth pages share the landing page's marble scene (`AuthScene` + `glass-panel`) for consistent branding. See “Configure Supabase Dashboard (Auth)” above for Site URL, Redirect URLs, providers, and email templates.
- **Poll backend:** Real poll questions and answers in the database; persistence and participation (e.g. sign-in to participate).
- **Trending data:** Home lists open `graph_controversies` by ranking score. Future: traffic or curated lists.
- **Search API:** Implemented (`/api/explore/search`) — controversies, topics, people. Ranking/quality still thin.
- **Ideology engine:** Doxa's proprietary system that computes a user's **factor ratings** (e.g. fiscal, social, foreign policy) from behavior—not user-controlled; displayed as read-only on the profile. Plus an **overall ideology** assignment. When implementing, consider existing **political science grading systems** (e.g. for categorizing people into named ideologies).
- **Validation loop:** User feedback on viewpoint representation ("Is your viewpoint fairly represented?") — on hold until viewpoints and UI are more developed. Will require new schema.
- **topic_version:** Immutable topic versions (Core Facts, Viewpoint Clusters, coverage analysis) with audit trail — topic pages point to latest; older versions remain auditable.
- **Viewpoint votes and validations:** User validation of representation — on hold; see Validation loop above. Will be re-added with new schema once viewpoints and UI are ready.
- **NewsAPI idempotency:** Check that the NewsAPI edge function (ingest-newsapi) is idempotent—i.e. repeated runs with the same data do not create duplicate sources or stories and behave predictably (e.g. upsert by URL, source name).
- **Paid features:** None for now. If paid tiers are introduced later (e.g. poll participation, features that influence the feedback loop), document the model in this README.
