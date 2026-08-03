# Motion Primitives

Owned, copy-paste animation components from [motion-primitives.com](https://motion-primitives.com) (Motion + Tailwind).

Add more with:

```bash
npx motion-primitives@latest add <component-name>
```

Docs: https://motion-primitives.com/docs  
Agent guidance: [`.cursor/rules/motion-primitives.mdc`](../../.cursor/rules/motion-primitives.mdc)

## Installed

| Component | Import |
|-----------|--------|
| Progressive Blur | `@/components/motion-primitives/progressive-blur` |
| Morphing Dialog | `@/components/motion-primitives/morphing-dialog` |
| Spotlight | `@/components/motion-primitives/spotlight` |
| Scroll Progress | `@/components/motion-primitives/scroll-progress` |
| Dock | `@/components/motion-primitives/dock` |
| Sliding Number | `@/components/motion-primitives/sliding-number` |
| Text Shimmer Wave | `@/components/motion-primitives/text-shimmer-wave` |
| Text Shimmer | `@/components/motion-primitives/text-shimmer` |
| Text Scramble | `@/components/motion-primitives/text-scramble` |
| Text Roll | `@/components/motion-primitives/text-roll` |
| Text Morph | `@/components/motion-primitives/text-morph` |
| Text Loop | `@/components/motion-primitives/text-loop` |
| Text Effect | `@/components/motion-primitives/text-effect` |
| Animated Group | `@/components/motion-primitives/animated-group` |
| Transition Panel | `@/components/motion-primitives/transition-panel` |

Helper: `useClickOutside` (used by Morphing Dialog).

Example (Spotlight path differs from upstream `@/components/core/...` demos):

```tsx
import { Spotlight } from '@/components/motion-primitives/spotlight';
```
