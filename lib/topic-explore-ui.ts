/**
 * Maps a 1-based position ordinal to an existing Doxa chart token so the
 * per-position colors stay coherent in light and dark mode (no hardcoded hex).
 */
export function positionAccentVar(ordinal: number): string {
  const idx = ((ordinal - 1) % 5) + 1
  return `var(--chart-${idx})`
}

/** Agreement meter fill — same green as position 1 (Border enforcement…). */
export const agreementMeterFill = '#2d5a4a'
