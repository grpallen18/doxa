---
name: migrate-radix-to-base
description: >-
  Migrates Doxa UI from Radix to Base UI via the official shadcn skill. Use only
  when the user explicitly asks to migrate from radix, move to base-ui, or
  convert radix primitives — not for routine UI work.
---

# Radix → Base UI (Doxa)

Canonical skill:

[`.agents/skills/migrate-radix-to-base/SKILL.md`](../../../.agents/skills/migrate-radix-to-base/SKILL.md)

Doxa currently uses **Radix** (`npx shadcn@latest info` → `"base": "radix"`, style `new-york`). Do **not** start a migration unless the user asked for one.

After any migration step, keep Doxa tokens (`app/globals.css`), `Panel`, and existing Motion Primitives / React Bits conventions.
