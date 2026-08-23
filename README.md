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
- **Backend:** Next.js API routes + Supabase (PostgreSQL)
- **AI Integration:** OpenAI API
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
- **Theme persistence:** Signed-in users store `theme_mode` plus light/dark preset IDs on `users` (`/api/theme-preference`). SSR in `app/layout.tsx` via `lib/server-theme.ts`. Signed-out visitors use `localStorage` key `doxa-theme`. Marble/auth routes always render light.

Tokens and component classes live in `app/globals.css` and `tailwind.config.ts`. New surfaces should follow the same beveled-panel and token usage so the app feels like one piece of equipment.

## Navigation & Key Pages

**Account required:** every route except the landing page and the auth flow requires a session. Middleware redirects signed-out visitors to `/` (preserving the attempted path in `?redirect=`) and answers `/api/*` with `401` JSON. Signed-in visitors hitting `/` are sent to `/home`.

- **Landing (`/`):** Marble hero with the dark DOXA logo and the sign-up / log-in entry points. No app chrome, forced light theme. Shares a persistent `(marble)` layout with login/auth so the stone and statue stay mounted across those navigations. The old `/welcome` URL permanently redirects here.
- **Login (`/login`):** Sign-in (email/password + social OAuth) on the same marble scene, in a frosted `glass-panel` card. Links to sign-up and forgot-password.
- **Sign up / auth routes:** `/auth/sign-up`, `/auth/callback`, `/auth/confirm`, `/auth/forgot-password`, `/auth/update-password`, `/auth/error` — content columns under the shared marble layout and the forced light theme.
- **Home (`/home`):** Signed-in explore home — brand, headline, search (`SpotlightBorder`), trending controversies from `graph_controversies`, featured topic hubs (density bar + `graph_topic_links`), how-it-works.
- **Search (`/search?q=`):** Controversies first, then published topics, then people (`/api/explore/search`).
- **Controversy (`/c/[uid]`):** Primary product page — question, shared/clash/disputes, viewpoint columns, evidence sheet, assessments (labeled Analyzed), related debates, feedback. Only **`open`** controversies.
- **Topic hub (`/topics/[slug]`):** Core facts + linked controversies (only listed when `graph_topic_links` meet the density bar). Nested: `/topics/[slug]/c/[uid]`.
- **People (`/people`, `/people/[uid]`):** Projected person profiles (`graph_people`, filled by `project_person_profiles`). Eidos map: `/people/[uid]/eidos`.
- **About (`/about`):** Mission copy.
- **Profile (`/profile`):** Account settings and theme picker; ideology meters are still deferred.
- **Legacy:** `/page/[id]` redirects to the topic hub by slug; `/entities/[uid]` redirects to `/people/[uid]`; `/welcome` permanently redirects to `/`.
- **Admin** (JWT role `admin`; others sent to `/home`):
  - `/admin` — metrics + settings
  - `/admin/stories` — story pipeline hub
  - `/admin/neo` — graph explorer
  - `/admin/graph-controversies` — debate projections + question quarantine
  - `/admin/observability` — scrape chart + pipeline funnel (`/admin/health` redirects here)

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
   - Add `SUPABASE_SERVICE_ROLE_KEY` for admin write paths (run-step, extraction clear/QA override, topic link suggestions, observability service-role reads). Get it from Supabase Dashboard → Settings → API → service_role (or secret) key.

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

6. **Open [http://localhost:3000](http://localhost:3000) in your browser.** Signed-out visitors see the marble landing at `/`. Sign in or sign up from there; signed-in visitors are sent to `/home`.

## Developer docs

| Doc | Contents |
|-----|----------|
| [API_ENDPOINTS.md](./API_ENDPOINTS.md) | App Router APIs (explore, theme, topics, admin) |
| [TESTING_GUIDE.md](./TESTING_GUIDE.md) | Auth-gated API checks, Playwright gate tests |
| [ENV_SETUP.md](./ENV_SETUP.md) | `.env.local`, Edge secrets, Neo4j worker |
| [docs/admin-observability.md](./docs/admin-observability.md) | Observability funnel, scrape drill-down, question quarantine |
| [docs/admin-story-extraction-review.md](./docs/admin-story-extraction-review.md) | Story hub run-step / QA |
| [doxa-agents/AGENTS.md](./doxa-agents/AGENTS.md) | Pipeline handlers, deploy, cron |

## Project Structure

```
doxa/
├── middleware.ts                 # Session refresh; unauthenticated → `/` (APIs → 401 JSON)
├── app/
│   ├── (marble)/                 # Landing `/` + `/login` + `/auth/*` (shared marble scene)
│   ├── api/
│   │   ├── explore/              # Consumer home, search, controversies, polls, saves
│   │   ├── theme-preference/     # Signed-in theme mode + presets
│   │   ├── topics/               # SQL topic catalog (list, detail, search, suggest-link)
│   │   ├── viewpoints/           # SQL viewpoints table (not graph_viewpoints)
│   │   ├── stories/              # KEEP story feed
│   │   └── admin/                # Observability, debate, Neo, stories, agents
│   ├── home/                     # Signed-in explore home
│   ├── search/                   # Controversy / topic / people search
│   ├── c/[uid]/                  # Controversy page
│   ├── topics/[topicId]/         # Topic hubs
│   ├── people/                   # Person index, profile, eidos
│   ├── admin/                    # Admin Center, stories, neo, debate, observability
│   ├── profile/                  # Account + theme
│   └── about/
├── components/                   # Panel, explore, admin, auth, ui (shadcn), motion-primitives
├── lib/
│   ├── supabase/                 # SSR client + middleware
│   ├── explore/                  # Projection queries + person profiles
│   ├── admin/                    # Dashboard, observability, pipeline catalog
│   └── neo4j/                    # Admin Neo queries (Aura)
├── doxa-agents/                  # Pipeline handlers + generated catalog
├── supabase/                     # Migrations, Edge function stubs
├── services/graph-worker/        # Python utterance graph worker
├── workers/                      # Cloudflare scrape worker
└── steering-document.md
```

## Development

See `steering-document.md` for the complete project philosophy and design principles. Product and UX decisions should align with the \"What Doxa Is For (and Not For)\" section above so the site stays focused on epistemic clarity and depolarization, not on becoming a news destination or opinion platform.

For database schema, see **supabase/README.md**. Cross-story debate assembly is the Edge `debate_pipeline` over Neo4j, projected to `graph_*` tables for Explore/Admin — [doxa-agents/departments/06-debate-engine/debate-pipeline/README.md](doxa-agents/departments/06-debate-engine/debate-pipeline/README.md).

## Planned / not yet implemented

The following are out of scope for the current phase and should be tackled later. Document here so they are not forgotten.

- **Auth and access:** Implemented. The site is gated: middleware redirects unauthenticated users to `/`. Auth: `/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/confirm`, `/auth/callback`. Cookie session via `@supabase/ssr`. Marble layout is shared across landing + auth. `?redirect=` is sanitized (`lib/safe-redirect.ts`).
- **Poll backend:** Tables and `/api/explore/polls` exist; product still needs real poll questions seeded per controversy and participation UX.
- **Trending data:** Home lists **open** `graph_controversies` by `ranking_score`. Future: traffic, multi-outlet coverage, or curated lists.
- **Search API:** Implemented (`/api/explore/search` — controversies, topics, people). Ranking/quality still naive `ilike`.
- **Ideology engine:** Doxa's proprietary system that computes a user's **factor ratings** (e.g. fiscal, social, foreign policy) from behavior—not user-controlled; displayed as read-only on the profile. Plus an **overall ideology** assignment. When implementing, consider existing **political science grading systems** (e.g. for categorizing people into named ideologies).
- **Validation loop:** Critiques API (`/api/explore/critiques`) and advisory `/api/explore/revision-candidates` exist; they are not yet a `topic_version` revision gate.
- **topic_version:** Immutable topic versions (Core Facts, Viewpoint Clusters, coverage analysis) with audit trail — topic pages point to latest; older versions remain auditable.
- **Viewpoint votes and validations:** User validation of representation — on hold; see Validation loop above.
- **NewsAPI idempotency:** Check that the NewsAPI edge function (ingest-newsapi) is idempotent—i.e. repeated runs with the same data do not create duplicate sources or stories and behave predictably (e.g. upsert by URL, source name).
- **Paid features:** None for now. If paid tiers are introduced later (e.g. poll participation, features that influence the feedback loop), document the model in this README.
