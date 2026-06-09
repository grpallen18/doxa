import { cn } from '@/lib/utils'

export type RecordEntityLink = {
  label: string
  linkText: string
  href: string
}

export function RecordEntityLinkBar({
  links,
  className,
}: {
  links: RecordEntityLink[]
  className?: string
}) {
  return (
    <nav
      aria-label="Related links"
      className={cn(
        'flex flex-nowrap items-center gap-x-6 overflow-x-auto px-4 py-3 text-sm sm:px-5',
        className
      )}
    >
      {links.map((link) => (
        <p key={link.label} className="shrink-0">
          <span className="text-[var(--record-section-header-fg)]">{link.label}: </span>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-subtle font-medium text-accent-primary hover:text-accent-primary/80"
          >
            {link.linkText}
          </a>
        </p>
      ))}
    </nav>
  )
}
