import type { ReactNode } from 'react'

export function RecordFieldRow({
  label,
  children,
}: {
  label: string
  children?: ReactNode
}) {
  const empty = children == null || children === ''

  return (
    <>
      <dt className="min-w-0 truncate whitespace-nowrap pb-1.5 text-sm font-medium text-foreground">
        {label}
      </dt>
      <dd className="min-w-0 border-b border-border pb-1.5 text-sm leading-snug text-muted">
        <div className="min-w-0 truncate whitespace-nowrap">
          {empty ? <span>—</span> : children}
        </div>
      </dd>
    </>
  )
}

export const recordFieldGridClass =
  'grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-center gap-x-4'
