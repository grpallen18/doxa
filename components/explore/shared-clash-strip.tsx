import { Panel } from '@/components/Panel'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

function BulletPanel({ label, bullets }: { label: string; bullets: string[] }) {
  return (
    <Panel variant="soft" interactive={false} className="space-y-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      {bullets.length === 0 ? (
        <p className="text-sm text-muted">Nothing mapped yet.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function SharedClashStrip({
  shared,
  clash,
  disputes,
}: {
  shared: string[]
  clash: string[]
  disputes: string[]
}) {
  const sections = [
    { id: 'shared', label: 'Shared ground', bullets: shared },
    { id: 'clash', label: 'Where they clash', bullets: clash },
    { id: 'disputes', label: 'Disputes', bullets: disputes },
  ]

  return (
    <div id="overview" className="space-y-4">
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {sections.map((s) => (
          <BulletPanel key={s.id} label={s.label} bullets={s.bullets} />
        ))}
      </div>
      <div className="md:hidden">
        <Accordion type="multiple" defaultValue={['shared', 'clash']}>
          {sections.map((s) => (
            <AccordionItem key={s.id} value={s.id}>
              <AccordionTrigger className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {s.label}
              </AccordionTrigger>
              <AccordionContent>
                {s.bullets.length === 0 ? (
                  <p className="text-sm text-muted">Nothing mapped yet.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  )
}
