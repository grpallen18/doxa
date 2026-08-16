'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type ThemeMode,
  type ThemePresetRecord,
} from '@/lib/admin/global-layout-theme'

export function ThemePickerMenu() {
  const themeCtx = useTheme()
  const activeMode: ThemeMode = themeCtx?.theme === 'dark' ? 'dark' : 'light'
  const [presets, setPresets] = useState<ThemePresetRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  async function ensurePresets() {
    if (fetched || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/theme-presets')
      const json = (await res.json()) as {
        data?: { presets: ThemePresetRecord[] }
        error?: { message?: string }
      }
      if (!res.ok) {
        setError(json.error?.message ?? 'Failed to load themes')
        return
      }
      setPresets(json.data?.presets ?? [])
      setFetched(true)
    } catch {
      setError('Failed to load themes')
    } finally {
      setLoading(false)
    }
  }

  async function handlePresetSelect(preset: ThemePresetRecord) {
    setApplyingId(preset.id)
    setError(null)
    try {
      await themeCtx?.applyPreset(preset)
    } catch {
      setError('Failed to save theme preference')
    } finally {
      setApplyingId(null)
    }
  }

  const lightPresets = presets.filter((p) => p.mode === 'light')
  const darkPresets = presets.filter((p) => p.mode === 'dark')
  // Only the preset currently applied (active mode + saved selection) shows a check.
  const activeSelectedId = themeCtx?.selections[activeMode]?.id ?? null

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (open) {
          void ensurePresets()
        }
      }}
    >
      <DropdownMenuSubTrigger className="gap-2">
        <span className="flex-1 text-sm">Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-[12rem]">
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="flex cursor-default items-center justify-between gap-2"
        >
          <span className="text-xs text-muted">Mode</span>
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="px-2 py-4 text-center text-xs text-muted">{error}</p>
        ) : (
          <>
            <ThemePresetSection
              label="Light"
              presets={lightPresets}
              activeSelectedId={activeMode === 'light' ? activeSelectedId : null}
              applyingId={applyingId}
              onSelect={handlePresetSelect}
            />
            <DropdownMenuSeparator />
            <ThemePresetSection
              label="Dark"
              presets={darkPresets}
              activeSelectedId={activeMode === 'dark' ? activeSelectedId : null}
              applyingId={applyingId}
              onSelect={handlePresetSelect}
            />
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ThemePresetSection({
  label,
  presets,
  activeSelectedId,
  applyingId,
  onSelect,
}: {
  label: string
  presets: ThemePresetRecord[]
  activeSelectedId: string | null
  applyingId: string | null
  onSelect: (preset: ThemePresetRecord) => void
}) {
  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted">
        {label}
      </DropdownMenuLabel>
      {presets.length === 0 ? (
        <p className="px-2 py-2 text-xs text-muted">No {label.toLowerCase()} themes</p>
      ) : (
        presets.map((preset) => {
          const isActive = activeSelectedId === preset.id
          const isApplying = applyingId === preset.id
          return (
            <DropdownMenuItem
              key={preset.id}
              disabled={isApplying}
              onSelect={(e) => {
                e.preventDefault()
                void onSelect(preset)
              }}
              className="gap-2"
            >
              <span className="min-w-0 flex-1 truncate">{preset.name}</span>
              {isApplying ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />
              ) : isActive ? (
                <Check className="size-3.5 shrink-0" aria-label="Selected" />
              ) : null}
            </DropdownMenuItem>
          )
        })
      )}
    </>
  )
}
