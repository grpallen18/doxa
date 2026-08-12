import { Panel } from '@/components/Panel'

export function TopicCoreFacts({
  paragraphs,
}: {
  paragraphs: string[]
}) {
  if (!paragraphs.length) return null
  return (
    <Panel variant="soft" interactive={false} className="space-y-3 p-5" id="core-facts">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Core facts</p>
      <div className="max-w-3xl space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))}
      </div>
    </Panel>
  )
}
