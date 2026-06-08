'use client'

import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const actionButtonClass =
  'flex h-full flex-1 items-center justify-center transition-colors hover:bg-[var(--accent-primary-soft)] hover:text-[var(--accent-primary)] active:bg-[var(--surface-section)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]'

export function ExportSplitButton({
  label,
  copyLabel,
  downloadLabel,
  content,
  downloadFilename,
  downloadMimeType,
  compact = false,
  className,
}: {
  label: string
  copyLabel: string
  downloadLabel: string
  content: string
  downloadFilename: string
  downloadMimeType: string
  compact?: boolean
  className?: string
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      toast.success(`${label} copied to clipboard`)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`)
    }
  }

  const download = () => {
    downloadText(content, downloadFilename, downloadMimeType)
    toast.success(`${label} downloaded`)
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'group relative overflow-hidden rounded-md border border-input bg-background font-medium shadow-sm',
          compact ? 'h-7 min-w-[3.25rem] text-[10px]' : 'h-8 min-w-[5.5rem] text-xs'
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0"
        >
          {label}
        </span>
        <div className="absolute inset-0 flex h-full opacity-0 pointer-events-none transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
          <button
            type="button"
            title={copyLabel}
            aria-label={copyLabel}
            className={actionButtonClass}
            onClick={() => void copy()}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title={downloadLabel}
            aria-label={downloadLabel}
            className={cn(actionButtonClass, 'border-l border-input')}
            onClick={download}
          >
            <Download className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
