---
name: shadcn
description: >-
  Manages shadcn/ui components in this Doxa repo — add, search, fix, style, and
  compose UI via the official skill plus the project shadcn MCP. Use when working
  with components.json, components/ui, forms, dialogs, sidebars, presets, or any
  request to add/install shadcn components.
---

# shadcn/ui (Doxa)

Canonical skill content lives in the skills.sh install path. **Read it first:**

[`.agents/skills/shadcn/SKILL.md`](../../../.agents/skills/shadcn/SKILL.md)

Then apply the Doxa overlays in [`.cursor/rules/shadcn.mdc`](../../rules/shadcn.mdc).

## Project tools

1. Run `npx shadcn@latest info --json` (or trust the skill’s injected context) before inventing paths or aliases.
2. Prefer the **shadcn MCP** (`project-0-doxa-shadcn` / server `shadcn` in `.cursor/mcp.json`) to search, view, and get add commands — then run the CLI.
3. Install with `npx shadcn@latest add …` into `components/ui/` (aliases from `components.json`).

## Update

```bash
npx skills add shadcn/ui
```

Keeps `.agents/skills/shadcn` and `skills-lock.json` current. This Cursor stub only points at that tree.
