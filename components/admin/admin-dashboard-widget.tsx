import Link from 'next/link'
import { cn } from '@/lib/utils'

type AdminDashboardWidgetProps = {
  title: string
  href?: string
  className?: string
  children: React.ReactNode
}

export function AdminDashboardWidget({
  title,
  href,
  className,
  children,
}: AdminDashboardWidgetProps) {
  const body = (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border border-border/70 bg-white p-4 shadow-sm dark:bg-card',
        href && 'transition-[box-shadow,border-color] hover:border-border hover:shadow-md',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <p className="text-xs font-semibold tracking-tight text-foreground">{title}</p>
        {href && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Open</span>
        )}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    )
  }

  return body
}

type HealthMetric = {
  label: string
  value: string | number
  href?: string
}

export function AdminHealthCheckWidget({
  metrics,
  href = '/admin/health',
  className,
}: {
  metrics: HealthMetric[]
  href?: string
  className?: string
}) {
  return (
    <AdminDashboardWidget title="Health check" className={className}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {metrics.map((metric) => {
          const cell = (
            <>
              <p className="text-xl font-semibold tabular-nums leading-none">{metric.value}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted">{metric.label}</p>
            </>
          )

          if (metric.href) {
            return (
              <Link
                key={metric.label}
                href={metric.href}
                className="rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
              >
                {cell}
              </Link>
            )
          }

          return <div key={metric.label}>{cell}</div>
        })}
      </div>
      <Link href={href} className="mt-3 text-xs font-medium text-accent-primary hover:underline">
        View health dashboard
      </Link>
    </AdminDashboardWidget>
  )
}
