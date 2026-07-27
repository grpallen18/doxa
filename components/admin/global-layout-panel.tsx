'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Trash2 } from 'lucide-react'
import { AdminDashboardWidget } from '@/components/admin/admin-dashboard-widget'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/components/ThemeProvider'
import {
  applyThemeColorOverrides,
  applyThemePreset,
  captureCurrentThemeColors,
  clearThemeColorOverrides,
  groupGlobalLayoutColorVars,
  loadSelectedThemePreset,
  loadThemeColorOverrides,
  saveSelectedThemePreset,
  saveThemeColorOverrides,
  toPickerHex,
  isProtectedThemePresetName,
  type ThemeMode,
  type ThemePresetRecord,
  type ThemePresetSelection,
} from '@/lib/admin/global-layout-theme'
import { showPipelineError, showPipelineSuccess } from '@/lib/admin/pipeline-toast'
import { cn } from '@/lib/utils'

function readLiveColor(key: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const live = getComputedStyle(document.documentElement).getPropertyValue(key)
  return toPickerHex(live, fallback)
}

export function GlobalLayoutPanel() {
  const themeCtx = useTheme()
  const mounted = themeCtx?.mounted ?? false
  const activeMode: ThemeMode =
    mounted && themeCtx?.theme === 'dark' ? 'dark' : 'light'
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<ThemePresetSelection | null>(null)
  const [colorsReady, setColorsReady] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [loadMode, setLoadMode] = useState<ThemeMode>('light')
  const [presets, setPresets] = useState<ThemePresetRecord[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => groupGlobalLayoutColorVars(), [])

  const syncFromStorage = useCallback(() => {
    const next = loadThemeColorOverrides(activeMode)
    setOverrides(next)
    setSelected(loadSelectedThemePreset(activeMode))
    applyThemeColorOverrides(activeMode, next)
    setColorsReady(true)
  }, [activeMode])

  useEffect(() => {
    if (!mounted) return
    setColorsReady(false)
    syncFromStorage()
  }, [mounted, syncFromStorage])

  useEffect(() => {
    if (loadOpen) setLoadMode(activeMode)
  }, [loadOpen, activeMode])

  const fetchPresets = useCallback(async (mode: ThemeMode) => {
    setPresetsLoading(true)
    try {
      const res = await fetch(`/api/admin/theme-presets?mode=${mode}`)
      const json = (await res.json()) as {
        data?: { presets: ThemePresetRecord[] }
        error?: { message?: string }
      }
      if (!res.ok || !json.data) {
        showPipelineError(json.error?.message ?? 'Failed to load themes')
        setPresets([])
        return
      }
      setPresets(json.data.presets)
    } catch {
      showPipelineError('Failed to load themes')
      setPresets([])
    } finally {
      setPresetsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (saveOpen) {
      setSaveName(selected?.name ? `${selected.name} copy` : '')
      void fetchPresets(activeMode)
    }
  }, [saveOpen, selected?.name, activeMode, fetchPresets])

  useEffect(() => {
    if (!loadOpen) return
    void fetchPresets(loadMode)
  }, [loadOpen, loadMode, fetchPresets])

  const saveNameConflict = useMemo(() => {
    const key = saveName.trim().toLowerCase()
    if (!key) return null
    return (
      presets.find(
        (row) => row.mode === activeMode && row.name.trim().toLowerCase() === key
      ) ?? null
    )
  }, [saveName, presets, activeMode])

  function setColor(key: string, value: string, fallback: string) {
    const hex = toPickerHex(value, fallback)
    setOverrides((prev) => {
      const next = { ...prev, [key]: hex }
      saveThemeColorOverrides(activeMode, next)
      applyThemeColorOverrides(activeMode, next)
      return next
    })
  }

  function applyPresetColors(mode: ThemeMode, colors: Record<string, string>) {
    saveThemeColorOverrides(mode, colors)
    applyThemeColorOverrides(mode, colors)
    if (mode === activeMode || themeCtx?.theme === mode) {
      setOverrides(colors)
      setColorsReady(true)
    }
  }

  function resetToSelectedTheme() {
    const current = loadSelectedThemePreset(activeMode)
    if (!current) {
      clearThemeColorOverrides(activeMode)
      setOverrides({})
      setSelected(null)
      showPipelineSuccess('Reset to default colors')
      return
    }

    void (async () => {
      try {
        const res = await fetch(`/api/admin/theme-presets?mode=${activeMode}`)
        const json = (await res.json()) as {
          data?: { presets: ThemePresetRecord[] }
          error?: { message?: string }
        }
        if (!res.ok || !json.data) {
          showPipelineError(json.error?.message ?? 'Failed to reset theme')
          return
        }
        const preset = json.data.presets.find((row) => row.id === current.id)
        if (!preset) {
          saveSelectedThemePreset(activeMode, null)
          clearThemeColorOverrides(activeMode)
          setOverrides({})
          setSelected(null)
          showPipelineError('Selected theme no longer exists; reset to defaults')
          return
        }
        applyPresetColors(activeMode, preset.colors)
        setSelected({ id: preset.id, name: preset.name })
        saveSelectedThemePreset(activeMode, { id: preset.id, name: preset.name })
        showPipelineSuccess(`Reset to “${preset.name}”`)
      } catch {
        showPipelineError('Failed to reset theme')
      }
    })()
  }

  async function loadPreset(preset: ThemePresetRecord) {
    setLoadingId(preset.id)
    try {
      const selection = applyThemePreset(preset, themeCtx?.setTheme)
      setOverrides(preset.colors)
      setSelected(selection)
      setColorsReady(true)

      showPipelineSuccess(`Loaded “${preset.name}” (${preset.mode})`)
      setLoadOpen(false)
    } finally {
      setLoadingId(null)
    }
  }

  async function deletePreset(preset: ThemePresetRecord) {
    if (isProtectedThemePresetName(preset.name)) {
      showPipelineError(`The “${preset.name}” theme cannot be deleted`)
      return
    }
    setDeletingId(preset.id)
    try {
      const res = await fetch(`/api/admin/theme-presets/${preset.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { error?: { message?: string } }
      if (!res.ok) {
        showPipelineError(json.error?.message ?? 'Failed to delete theme')
        return
      }

      setPresets((prev) => prev.filter((row) => row.id !== preset.id))

      const selectedForMode = loadSelectedThemePreset(preset.mode)
      if (selectedForMode?.id === preset.id) {
        saveSelectedThemePreset(preset.mode, null)
        if (preset.mode === activeMode) setSelected(null)
      }
      showPipelineSuccess(`Deleted “${preset.name}”`)
    } catch {
      showPipelineError('Failed to delete theme')
    } finally {
      setDeletingId(null)
    }
  }

  function finishSave(preset: ThemePresetRecord, message: string) {
    applyPresetColors(preset.mode, preset.colors)
    const selection = { id: preset.id, name: preset.name }
    saveSelectedThemePreset(preset.mode, selection)
    setSelected(selection)
    showPipelineSuccess(message)
    setSaveOpen(false)
    setSaveName('')
  }

  async function putPresetColors(presetId: string): Promise<ThemePresetRecord | null> {
    const colors = captureCurrentThemeColors(activeMode)
    const res = await fetch(`/api/admin/theme-presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colors }),
    })
    const json = (await res.json()) as {
      data?: { preset: ThemePresetRecord }
      error?: { message?: string }
    }
    if (!res.ok || !json.data) {
      showPipelineError(json.error?.message ?? 'Failed to save theme')
      return null
    }
    return json.data.preset
  }

  async function overwritePreset(presetId: string) {
    setSaving(true)
    try {
      const preset = await putPresetColors(presetId)
      if (preset) {
        finishSave(preset, `Saved “${preset.name}” (${preset.mode})`)
      }
    } catch {
      showPipelineError('Failed to save theme')
    } finally {
      setSaving(false)
    }
  }

  async function createPreset(name: string) {
    setSaving(true)
    try {
      const colors = captureCurrentThemeColors(activeMode)
      const res = await fetch('/api/admin/theme-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mode: activeMode, colors }),
      })
      const json = (await res.json()) as {
        data?: { preset: ThemePresetRecord }
        error?: { message?: string; conflictId?: string }
      }
      if (res.status === 409) {
        const conflictId = json.error?.conflictId
        if (typeof conflictId !== 'string') {
          showPipelineError(json.error?.message ?? 'Theme name already exists')
          return
        }
        const preset = await putPresetColors(conflictId)
        if (preset) {
          finishSave(preset, `Saved “${preset.name}” (${preset.mode})`)
        }
        return
      }
      if (!res.ok || !json.data) {
        showPipelineError(json.error?.message ?? 'Failed to save theme')
        return
      }
      finishSave(json.data.preset, `Saved “${json.data.preset.name}” (${json.data.preset.mode})`)
    } catch {
      showPipelineError('Failed to save theme')
    } finally {
      setSaving(false)
    }
  }

  async function savePreset() {
    const name = saveName.trim()
    if (!name) {
      showPipelineError('Enter a theme name')
      return
    }
    if (saveNameConflict) {
      await overwritePreset(saveNameConflict.id)
      return
    }
    await createPreset(name)
  }

  return (
    <AdminDashboardWidget
      title="Global Layout"
      titleClassName="text-sm font-semibold tracking-tight text-foreground"
      headerCenter={
        <p className="text-sm font-semibold tracking-tight text-foreground">
          {mounted
            ? `${selected?.name ?? 'Unsaved'} (${activeMode === 'dark' ? 'Dark' : 'Light'})`
            : 'Unsaved (Light)'}
        </p>
      }
      headerAside={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={() => setLoadOpen(true)}
            className="h-7 px-2 text-xs border-0 bg-[var(--accent-primary)] text-inverted shadow-sm hover:bg-[var(--accent-primary)] hover:brightness-110 hover:text-inverted"
          >
            Load
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setSaveOpen(true)}
            className="h-7 px-2 text-xs border-0 bg-[var(--accent-primary)] text-inverted shadow-sm hover:bg-[var(--accent-primary)] hover:brightness-110 hover:text-inverted"
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={resetToSelectedTheme}
            className="h-7 px-2 text-xs border-0 bg-[var(--accent-primary)] text-inverted shadow-sm hover:bg-[var(--accent-primary)] hover:brightness-110 hover:text-inverted"
          >
            Reset
          </Button>
        </div>
      }
    >
      <div className="flex max-h-[22rem] flex-col gap-3">
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {groups.map(({ group, vars }) => {
            const open = openGroups.has(group)
            return (
              <Collapsible
                key={group}
                open={open}
                onOpenChange={(next) => {
                  setOpenGroups((prev) => {
                    const copy = new Set(prev)
                    if (next) copy.add(group)
                    else copy.delete(group)
                    return copy
                  })
                }}
                className="space-y-1"
              >
                <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left">
                  <p className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-foreground">
                    {group}
                  </p>
                  <ChevronDown
                    className={cn(
                      'size-3.5 shrink-0 text-muted transition-transform',
                      open && 'rotate-180'
                    )}
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="space-y-1.5 py-1 pl-4 pr-0">
                    {vars.map((entry) => {
                      const fallback = entry.defaults[activeMode]
                      const value =
                        entry.key in overrides
                          ? toPickerHex(overrides[entry.key], fallback)
                          : colorsReady
                            ? readLiveColor(entry.key, fallback)
                            : fallback

                      return (
                        <li key={entry.key}>
                          <label className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5">
                            <span className="min-w-0 truncate text-xs font-semibold tracking-tight text-foreground">
                              {entry.label}
                              <span className="ml-1.5 text-xs font-semibold tracking-tight text-muted">
                                {entry.key}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="text-xs font-semibold tracking-tight uppercase text-muted">
                                {value}
                              </span>
                              <input
                                type="color"
                                value={value}
                                onChange={(e) =>
                                  setColor(entry.key, e.target.value, fallback)
                                }
                                className="size-5 cursor-pointer appearance-none overflow-hidden rounded-full border border-border bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                                aria-label={entry.label}
                              />
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )
          })}
        </div>
      </div>

      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Load theme</DialogTitle>
            <DialogDescription>
              Choose light or dark, then load a saved preset. Themes are independent per mode.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={loadMode === mode ? 'default' : 'outline'}
                onClick={() => setLoadMode(mode)}
                className="capitalize"
              >
                {mode}
              </Button>
            ))}
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {presetsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </div>
            ) : presets.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                No {loadMode} themes saved yet.
              </p>
            ) : (
              presets.map((preset) => {
                const isSelected =
                  loadSelectedThemePreset(loadMode)?.id === preset.id
                const protectedPreset = isProtectedThemePresetName(preset.name)
                return (
                  <div
                    key={preset.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                      onClick={() => void loadPreset(preset)}
                      disabled={loadingId === preset.id}
                    >
                      {preset.name}
                      {isSelected ? (
                        <span className="ml-2 text-[10px] text-muted">selected</span>
                      ) : null}
                      {protectedPreset ? (
                        <span className="ml-2 text-[10px] text-muted">built-in</span>
                      ) : null}
                    </button>
                    {!protectedPreset ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0 text-muted hover:text-destructive"
                        disabled={deletingId === preset.id || loadingId === preset.id}
                        onClick={() => void deletePreset(preset)}
                        aria-label={`Delete ${preset.name}`}
                      >
                        {deletingId === preset.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save theme</DialogTitle>
            <DialogDescription>
              Save the current {activeMode} color settings as a named preset. Light and dark
              themes are stored separately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="theme-preset-name" className="text-xs">
              Theme name
            </Label>
            <Input
              id="theme-preset-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Forest"
              maxLength={80}
              className="h-8 text-sm"
              aria-invalid={saveNameConflict != null}
            />
            {saveNameConflict ? (
              <p className="text-[11px] text-muted">
                “{saveNameConflict.name}” already exists in {activeMode} mode. Saving will
                overwrite the existing preset.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void savePreset()}
              disabled={saving || !saveName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving
                </>
              ) : (
                'Save theme'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminDashboardWidget>
  )
}
