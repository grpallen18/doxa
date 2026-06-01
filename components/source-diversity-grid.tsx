import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { DiversityCell, Topic } from '@/lib/mock/topic-explore'

/** Opacity ramp for cell strength 0-3. */
const cellOpacity: Record<DiversityCell, number> = {
  0: 0.12,
  1: 0.4,
  2: 0.7,
  3: 1,
}

export function SourceDiversityGrid({ topic }: { topic: Topic }) {
  return (
    <section className="p-5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Source Diversity Behind All Positions
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-muted">
              <th className="w-8 pb-2 text-left font-medium" scope="col">
                <span className="sr-only">Position</span>
              </th>
              {topic.sourceTypes.map((type) => (
                <th key={type.id} className="px-1 pb-2 text-center font-medium" scope="col">
                  {type.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topic.positions.map((position) => {
              const accent = positionAccentVar(position.ordinal)
              const row = topic.diversity[position.id] ?? {}
              return (
                <tr key={position.id}>
                  <th scope="row" className="py-1 pr-2 text-left font-semibold text-muted">
                    {position.ordinal}
                  </th>
                  {topic.sourceTypes.map((type) => {
                    const strength = (row[type.id] ?? 0) as DiversityCell
                    return (
                      <td key={type.id} className="px-1 py-1 text-center">
                        <span
                          className="mx-auto block size-3 rounded-full"
                          style={{ backgroundColor: accent, opacity: cellOpacity[strength] }}
                          title={`Position ${position.ordinal} - ${type.label}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
