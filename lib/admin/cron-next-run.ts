const MAX_SEARCH_MINUTES = 60 * 24 * 8

type CronField = {
  any: boolean
  values: Set<number> | null
}

function parseCronField(part: string, min: number, max: number): CronField | null {
  const trimmed = part.trim()
  if (trimmed === '*') return { any: true, values: null }

  const values = new Set<number>()

  for (const token of trimmed.split(',')) {
    const segment = token.trim()
    if (!segment) return null

    if (segment.startsWith('*/')) {
      const step = Number.parseInt(segment.slice(2), 10)
      if (!Number.isFinite(step) || step <= 0) return null
      for (let i = min; i <= max; i += step) values.add(i)
      continue
    }

    if (segment.includes('-')) {
      const [startRaw, endRaw] = segment.split('-')
      const start = Number.parseInt(startRaw, 10)
      const end = Number.parseInt(endRaw, 10)
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
      for (let i = start; i <= end; i += 1) {
        if (i < min || i > max) return null
        values.add(i)
      }
      continue
    }

    const value = Number.parseInt(segment, 10)
    if (!Number.isFinite(value) || value < min || value > max) return null
    values.add(value)
  }

  return { any: false, values }
}

function fieldMatches(field: CronField, value: number): boolean {
  if (field.any) return true
  return field.values?.has(value) ?? false
}

function parseCronSchedule(schedule: string): [CronField, CronField, CronField, CronField, CronField] | null {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const minute = parseCronField(parts[0], 0, 59)
  const hour = parseCronField(parts[1], 0, 23)
  const dayOfMonth = parseCronField(parts[2], 1, 31)
  const month = parseCronField(parts[3], 1, 12)
  const dayOfWeek = parseCronField(parts[4], 0, 6)

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null
  return [minute, hour, dayOfMonth, month, dayOfWeek]
}

function cronMatches(date: Date, fields: [CronField, CronField, CronField, CronField, CronField]): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  return (
    fieldMatches(minute, date.getMinutes()) &&
    fieldMatches(hour, date.getHours()) &&
    fieldMatches(dayOfMonth, date.getDate()) &&
    fieldMatches(month, date.getMonth() + 1) &&
    fieldMatches(dayOfWeek, date.getDay())
  )
}

export function getNextCronRunTime(schedule: string, from: Date = new Date()): Date | null {
  const fields = parseCronSchedule(schedule)
  if (!fields) return null

  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let i = 0; i < MAX_SEARCH_MINUTES; i += 1) {
    if (cronMatches(cursor, fields)) return new Date(cursor)
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  return null
}

export function formatNextCronRunTime(schedule: string | null | undefined): string {
  if (!schedule?.trim()) return '—'
  const next = getNextCronRunTime(schedule)
  if (!next) return '—'
  return next.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
