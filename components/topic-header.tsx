import { Bookmark, FileText, Globe, Languages, Layers, Library } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Topic } from '@/lib/mock/topic-explore'

const statIcons: Record<string, LucideIcon> = {
  positions: Layers,
  claims: FileText,
  sources: Library,
  countries: Globe,
  languages: Languages,
}

export function TopicHeader({ topic }: { topic: Topic }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{topic.title}</h1>
        <button
          type="button"
          aria-label="Bookmark topic"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
        >
          <Bookmark className="size-5" />
        </button>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-3">
        {topic.stats.map((stat) => {
          const Icon = statIcons[stat.id] ?? FileText
          return (
            <div key={stat.id} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-accent-primary" />
              <div className="leading-tight">
                <dd className="text-sm font-semibold tabular-nums text-foreground">{stat.value}</dd>
                <dt className="text-xs text-muted">{stat.label}</dt>
              </div>
            </div>
          )
        })}
      </dl>
    </header>
  )
}
