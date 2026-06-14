const ADMIN_DATETIME_PARTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

/** Audit/history timestamps: `Jun 13, 2026, 22:22:47.283` (24-hour, ms). */
export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const ms = String(date.getMilliseconds()).padStart(3, '0')
  const parts = new Intl.DateTimeFormat('en-US', ADMIN_DATETIME_PARTS).formatToParts(date)

  return `${partValue(parts, 'month')} ${partValue(parts, 'day')}, ${partValue(parts, 'year')}, ${partValue(parts, 'hour')}:${partValue(parts, 'minute')}:${partValue(parts, 'second')}.${ms}`
}

export function formatAdminDateTimeOrNull(iso: string | null | undefined): string | null {
  if (!iso) return null
  const formatted = formatAdminDateTime(iso)
  return formatted === '—' ? null : formatted
}
