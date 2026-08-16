import { marbleAuthPanelClassName } from '@/components/landing/marble-shell'

/**
 * Field and control classes for the frosted card. The themed input surface is
 * opaque, which sits on the glass like a patch of paper; these let the stone
 * show through and carry their own rim so the edge holds against the marble.
 */
export const glassFieldClassName =
  'bg-white/55 shadow-[inset_0_0_0_1px_rgba(36,31,26,0.16)] focus:bg-white/80'

export const glassOutlineButtonClassName =
  'border-[rgba(36,31,26,0.16)] bg-white/50 text-foreground hover:bg-white/80 hover:text-foreground'

/** One treatment for every link inside the cards, so idle and hover match across the flow. */
export const authLinkClassName =
  'font-medium text-foreground underline underline-offset-2 transition-colors hover:text-muted'

/**
 * The frosted card every auth page sits in. Scene, brand and column come from
 * the `(marble)` layout, so this is only the card — moving between the landing
 * page and any auth route swaps nothing above it. The card starts invisible and
 * fades itself in, which is why the group's loading fallback draws nothing.
 */
export function AuthScene({ children }: { children: React.ReactNode }) {
  return <div className={marbleAuthPanelClassName}>{children}</div>
}

export function AuthCardHeading({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  )
}
