# Topic-explorer home

The default home and app shell mirror `docs/UI Layout.png`. Data is **mock-only**
([lib/mock/topic-explore.ts](../lib/mock/topic-explore.ts)) until wired to the DB.

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
| Mock data | [lib/mock/topic-explore.ts](../lib/mock/topic-explore.ts) |
| UI helper | [lib/topic-explore-ui.ts](../lib/topic-explore-ui.ts) |
| Orchestrator | [components/topic-explore-home.tsx](../components/topic-explore-home.tsx) |
| Sidebar nav | [components/explore-sidebar-nav.tsx](../components/explore-sidebar-nav.tsx) |
| Sections | `topic-header.tsx`, `topic-brief-panel.tsx`, `position-landscape.tsx`, `position-card.tsx`, `source-diversity-grid.tsx`, `discourse-evolution-chart.tsx`, `position-detail-panel.tsx` |
| Shell / page | [components/AppShell.tsx](../components/AppShell.tsx), [app/page.tsx](../app/page.tsx) |
| Tests | [playwright.config.ts](../playwright.config.ts), [e2e/experiment-home.spec.ts](../e2e/experiment-home.spec.ts) |

## Testing

`npm run test:e2e` with `npm run dev` running. First run: `npx playwright install`.
