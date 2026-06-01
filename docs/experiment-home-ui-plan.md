# Experiment home UI (branch-only)

A feature-flagged topic-explorer home and app shell that structurally mirrors
`docs/UI Layout.png`. It uses **mock data only** and reuses the existing Doxa
design tokens, dark mode, responsive behavior, and sidebar collapse. It is OFF
by default and only runs on the preview branch.

## Feature flag

`NEXT_PUBLIC_EXPERIMENT_HOME_UI=true` enables the experiment. Read once in
[lib/feature-flags.ts](../lib/feature-flags.ts):

```ts
export const experimentHomeUi =
  process.env.NEXT_PUBLIC_EXPERIMENT_HOME_UI === 'true'
```

- Off by default; documented in [.env.local.branch.example](../.env.local.branch.example).
- When off, [app/page.tsx](../app/page.tsx) and [components/AppShell.tsx](../components/AppShell.tsx)
  behave exactly as before (legacy home, full nav, footer). Merging to `main`
  is a no-op for users until the flag is set.

## Layout

```
+-----------------+-------------------------------------------+------------------+
| Sidebar         | Center                                    | Position detail  |
| - doxa wordmark | - Topic header + stat chips               | (lg+: sticky col |
| - Explore Topics| - AI topic brief + legend                 |  <lg: Sheet)     |
| - Saved Briefs* | - Position landscape (5 cards)            | - tabs           |
| - Comparisons*  | - Alignment legend                        | - supporting     |
| - Alerts*       | - Source diversity grid | discourse chart |   /opposing claims|
| - TOPICS list   |                                           | - controversies  |
+-----------------+-------------------------------------------+------------------+
* "Coming soon" (disabled)
```

## Files

| Kind | Path |
|------|------|
| Flag | [lib/feature-flags.ts](../lib/feature-flags.ts) |
| Mock data | [lib/mock/topic-explore.ts](../lib/mock/topic-explore.ts) |
| UI helper | [lib/topic-explore-ui.ts](../lib/topic-explore-ui.ts) |
| Orchestrator | [components/topic-explore-home.tsx](../components/topic-explore-home.tsx) |
| Sidebar nav | [components/explore-sidebar-nav.tsx](../components/explore-sidebar-nav.tsx) |
| Sections | `topic-header.tsx`, `topic-brief-panel.tsx`, `position-landscape.tsx`, `position-card.tsx`, `source-diversity-grid.tsx`, `discourse-evolution-chart.tsx`, `position-detail-panel.tsx` (all in [components/](../components/)) |
| Shell / page | [components/AppShell.tsx](../components/AppShell.tsx), [app/page.tsx](../app/page.tsx) |
| Tests | [playwright.config.ts](../playwright.config.ts), [e2e/experiment-home.spec.ts](../e2e/experiment-home.spec.ts) |

## Conventions followed

- New components are flat in `components/` with kebab-case names (no new folder,
  no `Atlas` naming). The existing `components/atlas/` is untouched because the
  `/atlas` route is out of scope.
- Per-position colors map to existing `--chart-1..5` tokens via
  `positionAccentVar(ordinal)` so light/dark stay coherent (no hardcoded hex).
- The right panel uses a sticky column at `lg+` and a `Sheet` below `lg`.
  Position cards scroll horizontally on small screens; the two visualizations
  stack below `xl`.

## Testing

`npm run test:e2e` runs Playwright smoke tests (desktop + mobile projects).
Specs self-skip unless `NEXT_PUBLIC_EXPERIMENT_HOME_UI=true`, so CI/main are
unaffected. First run requires browser binaries: `npx playwright install`.

## Promotion

To ship to prod later, either enable the flag on the main env or remove the flag
and make the experiment the default home. Until then, `main` + default env =
zero user-facing change.
