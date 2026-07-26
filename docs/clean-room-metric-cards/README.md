# Clean-room metric cards

This is an original React + Tailwind implementation based only on the visual layout in the supplied screenshot. It does not use or recover the paywalled source code.

## Files

- `components/metric-card.tsx` — reusable card and five SVG chart variants
- `components/metric-cards-demo.tsx` — screenshot-style example grid
- `app-page-example.tsx` — example Next.js App Router page

## Install

No chart package is required. The charts are inline SVG.

Copy the component files into your project:

```text
components/
  metric-card.tsx
  metric-cards-demo.tsx
```

For a Next.js App Router project, copy `app-page-example.tsx` to something like:

```text
app/metric-cards/page.tsx
```

Make sure Tailwind scans your `components` folder.

## Basic use

```tsx
import { MetricCard } from "@/components/metric-card";

<MetricCard
  title="Revenue"
  subtitle="Last 30 days"
  value="$824K"
  change="+8.4%"
  chart="area"
  data={[22, 38, 31, 58, 47, 72, 64]}
/>
```

Supported chart values:

```ts
"bars" | "area" | "line" | "step" | "donut"
```

## Cursor integration prompt

Paste this into Cursor after adding the files:

```text
Integrate the new clean-room metric-card components into this project.

1. Inspect the existing framework, import aliases, Tailwind version, theme tokens, and page structure.
2. Place metric-card.tsx and metric-cards-demo.tsx in the project's normal component directory.
3. Add a route or Storybook story that renders MetricCardsDemo.
4. Preserve the existing app shell and global styling.
5. Replace hard-coded example values only if an existing dashboard data source is obvious.
6. Fix all TypeScript, ESLint, Tailwind, and import-path issues.
7. Do not add a charting dependency; keep the inline SVG implementation.
8. Report the files changed and any assumptions.
```

## Fine-tuning

The most important visual controls are in the `<article>` classes in `MetricCard`:

- `rounded-[26px]`
- `min-h-[268px]`
- `px-6 pb-5 pt-6`
- the custom two-layer `shadow-[...]`
- the dark navy `#0c1b36`
- the indigo accent `#5548e8`

For denser layouts, change the demo grid to:

```tsx
className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4"
```
