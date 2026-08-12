'use client'

export function PropositionRow({
  proposition,
  onOpen,
}: {
  proposition: { uid: string; text: string }
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-bevel border border-border bg-surface px-3 py-2 text-left text-sm leading-snug text-foreground shadow-panel-soft transition-colors hover:bg-surface-soft"
    >
      {proposition.text}
    </button>
  )
}
