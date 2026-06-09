export type EnforcedOutputSpec = {
  topLevel: string[];
  nested: Record<string, string[]>;
  recommendedActions?: string[];
};

export const ENFORCED_OUTPUT_SPECS: Record<string, EnforcedOutputSpec> = {
  "validate-chunk-claims": {
    topLevel: ["passes_review", "recommended_action", "summary", "issues", "patches"],
    nested: {
      issues: ["severity", "claim_id", "claim_index", "issue_type", "finding"],
      patches: [
        "action",
        "entity_type",
        "severity",
        "claim_ids",
        "claim_indexes",
        "recommended_raw_text",
        "reason",
        "source_grounding",
      ],
    },
    recommendedActions: ["validate", "needs_refinement", "reject"],
  },
};

export type PromptSchemaMismatch = {
  mismatched: boolean;
  message: string;
  promptOnlyTopLevel: string[];
  schemaOnlyTopLevel: string[];
  nestedMismatches: Array<{
    arrayKey: string;
    promptOnly: string[];
    schemaOnly: string[];
  }>;
  actionMismatch: string | null;
};

function extractOutputJsonBlock(systemPrompt: string): string | null {
  const outputIdx = systemPrompt.search(/\bOUTPUT:\b/i);
  const slice = outputIdx >= 0 ? systemPrompt.slice(outputIdx) : systemPrompt;
  const start = slice.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < slice.length; i++) {
    const ch = slice[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return slice.slice(start, i + 1);
    }
  }
  return null;
}

function topLevelKeysFromJsonExample(jsonBlock: string): string[] {
  const keys: string[] = [];
  const re = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(jsonBlock)) !== null) {
    const before = jsonBlock.slice(0, match.index);
    const open = (before.match(/\{/g) ?? []).length;
    const close = (before.match(/\}/g) ?? []).length;
    if (open - close === 1) keys.push(match[1]);
  }
  return keys;
}

function firstArrayItemKeys(jsonBlock: string, arrayKey: string): string[] {
  const re = new RegExp(`"${arrayKey}"\\s*:\\s*\\[\\s*\\{`, "i");
  const match = re.exec(jsonBlock);
  if (!match) return [];
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = start; i < jsonBlock.length; i++) {
    const ch = jsonBlock[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  return topLevelKeysFromJsonExample(jsonBlock.slice(start, end));
}

function extractRecommendedActions(jsonBlock: string): string[] {
  const match = jsonBlock.match(/"recommended_action"\s*:\s*"([^"]+)"/i);
  if (!match) return [];
  return match[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkPromptOutputSchemaMatch(
  stepId: string,
  systemPrompt: string
): PromptSchemaMismatch | null {
  const spec = ENFORCED_OUTPUT_SPECS[stepId];
  if (!spec) return null;

  const jsonBlock = extractOutputJsonBlock(systemPrompt);
  if (!jsonBlock) {
    return {
      mismatched: true,
      message:
        "Active prompt has no OUTPUT JSON example. The runtime enforces a fixed response schema that may not match your prompt.",
      promptOnlyTopLevel: [],
      schemaOnlyTopLevel: spec.topLevel,
      nestedMismatches: [],
      actionMismatch: null,
    };
  }

  const promptTop = topLevelKeysFromJsonExample(jsonBlock);
  const promptTopSet = new Set(promptTop);
  const schemaTopSet = new Set(spec.topLevel);
  const promptOnlyTopLevel = promptTop.filter((k) => !schemaTopSet.has(k));
  const schemaOnlyTopLevel = spec.topLevel.filter((k) => !promptTopSet.has(k));

  const nestedMismatches: PromptSchemaMismatch["nestedMismatches"] = [];
  for (const [arrayKey, schemaKeys] of Object.entries(spec.nested)) {
    const promptKeys = firstArrayItemKeys(jsonBlock, arrayKey);
    const promptKeySet = new Set(promptKeys);
    const schemaKeySet = new Set(schemaKeys);
    const promptOnly = promptKeys.filter((k) => !schemaKeySet.has(k));
    const schemaOnly = schemaKeys.filter((k) => !promptKeySet.has(k));
    if (promptOnly.length > 0 || schemaOnly.length > 0) {
      nestedMismatches.push({ arrayKey, promptOnly, schemaOnly });
    }
  }

  let actionMismatch: string | null = null;
  if (spec.recommendedActions?.length) {
    const promptActions = extractRecommendedActions(jsonBlock);
    if (promptActions.length > 0) {
      const schemaActionSet = new Set(spec.recommendedActions);
      const unknown = promptActions.filter((a) => !schemaActionSet.has(a));
      if (unknown.length > 0) {
        actionMismatch = `Prompt allows recommended_action values [${promptActions.join(", ")}] but runtime schema allows [${spec.recommendedActions.join(", ")}].`;
      }
    }
  }

  const mismatched =
    schemaOnlyTopLevel.length > 0 ||
    promptOnlyTopLevel.length > 0 ||
    nestedMismatches.length > 0 ||
    actionMismatch != null;

  if (!mismatched) return null;

  const parts: string[] = [
    "Active prompt OUTPUT shape does not match the enforced JSON schema. OpenAI will follow the schema, not the prompt example.",
  ];
  if (schemaOnlyTopLevel.length > 0) {
    parts.push(`Schema requires top-level fields missing from prompt example: ${schemaOnlyTopLevel.join(", ")}.`);
  }
  if (promptOnlyTopLevel.length > 0) {
    parts.push(`Prompt example includes fields not in schema: ${promptOnlyTopLevel.join(", ")}.`);
  }
  for (const nested of nestedMismatches) {
    if (nested.schemaOnly.length > 0) {
      parts.push(
        `${nested.arrayKey}[] schema fields missing from prompt: ${nested.schemaOnly.join(", ")}.`
      );
    }
    if (nested.promptOnly.length > 0) {
      parts.push(
        `${nested.arrayKey}[] prompt fields not in schema: ${nested.promptOnly.join(", ")}.`
      );
    }
  }
  if (actionMismatch) parts.push(actionMismatch);

  return {
    mismatched: true,
    message: parts.join(" "),
    promptOnlyTopLevel,
    schemaOnlyTopLevel,
    nestedMismatches,
    actionMismatch,
  };
}
