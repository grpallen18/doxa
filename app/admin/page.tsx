'use client'

import { GlobalLayoutPanel } from '@/components/admin/global-layout-panel'
import { NeoColorsPanel } from '@/components/admin/neo-colors-panel'
import { OpenAiModelConfigPanel } from '@/components/admin/openai-model-config-panel'

function AdminCenterContent() {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        Settings
      </h2>

      <section
        aria-label="Settings"
        className="grid gap-3 sm:grid-cols-2"
      >
        <OpenAiModelConfigPanel />
        <GlobalLayoutPanel />
        <NeoColorsPanel />
      </section>
    </div>
  )
}

export default function AdminCenterPage() {
  return <AdminCenterContent />
}
