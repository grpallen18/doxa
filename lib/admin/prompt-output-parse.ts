export function extractOutputJsonBlock(systemPrompt: string): string | null {
  const outputIdx = systemPrompt.search(/\bOUTPUT:\b/i)
  const slice = outputIdx >= 0 ? systemPrompt.slice(outputIdx) : systemPrompt
  const start = slice.indexOf('{')
  if (start < 0) return null

  let depth = 0
  for (let i = start; i < slice.length; i++) {
    const ch = slice[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return slice.slice(start, i + 1)
    }
  }
  return null
}

/** Replace pipe-enum placeholders so the OUTPUT example can be JSON.parse'd. */
export function sanitizePromptJsonExample(block: string): string {
  let out = block
  out = out.replace(/"([^"]*)"\s*:\s*"([^"]*\|[^"]*)"/g, (_match, key, val) => {
    const first = val.split('|')[0]?.trim() ?? val
    return `"${key}": "${first}"`
  })
  out = out.replace(/,\s*([\]}])/g, '$1')
  return out
}

export function topLevelKeysFromJsonExample(jsonBlock: string): string[] {
  const keys: string[] = []
  const re = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g
  let match: RegExpExecArray | null
  while ((match = re.exec(jsonBlock)) !== null) {
    const before = jsonBlock.slice(0, match.index)
    const open = (before.match(/\{/g) ?? []).length
    const close = (before.match(/\}/g) ?? []).length
    if (open - close === 1) keys.push(match[1])
  }
  return keys
}

export function firstArrayItemKeys(jsonBlock: string, arrayKey: string): string[] {
  const re = new RegExp(`"${arrayKey}"\\s*:\\s*\\[\\s*\\{`, 'i')
  const match = re.exec(jsonBlock)
  if (!match) return []
  const start = match.index + match[0].length - 1
  let depth = 0
  let end = -1
  for (let i = start; i < jsonBlock.length; i++) {
    const ch = jsonBlock[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) return []
  return topLevelKeysFromJsonExample(jsonBlock.slice(start, end))
}

export function extractRecommendedActions(jsonBlock: string): string[] {
  const enumMatch = jsonBlock.match(
    /"recommended_action"\s*:\s*"([^"]*\|[^"]*)"/i
  )
  if (enumMatch) {
    return enumMatch[1]
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const singleMatch = jsonBlock.match(/"recommended_action"\s*:\s*"([^"|]+)"/i)
  return singleMatch ? [singleMatch[1].trim()] : []
}

export function parseOutputExampleObject(systemPrompt: string): Record<string, unknown> | null {
  const block = extractOutputJsonBlock(systemPrompt)
  if (!block) return null
  try {
    const parsed = JSON.parse(sanitizePromptJsonExample(block))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
