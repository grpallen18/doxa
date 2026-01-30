import GraphVisualization from '@/components/graph/GraphVisualization'
import { LandingHeader } from '@/components/LandingHeader'

export default function GraphPage() {
  return (
    <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:gap-8">
        <LandingHeader />
        <GraphVisualization />
      </div>
    </main>
  )
}
