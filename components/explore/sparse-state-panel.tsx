import { Panel } from '@/components/Panel'

export function SparseStatePanel({
  title = 'Still mapping',
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <Panel variant="soft" interactive={false} className="space-y-2 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{title}</p>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </Panel>
  )
}
