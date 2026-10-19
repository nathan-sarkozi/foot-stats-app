export const RBFA_TIME_ZONE = 'Europe/Brussels'

function readRbfaDate(value: unknown): { wallDate: Date; instant: number | null } | null {
  if (typeof value !== 'string') return null
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(value)
  if (!parts) return null

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue, fraction, offset] = parts
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const hour = Number(hourValue)
  const minute = Number(minuteValue)
  const second = Number(secondValue ?? 0)
  const calendarDay = new Date(0)
  calendarDay.setUTCFullYear(year, month - 1, day)
  if (calendarDay.getUTCFullYear() !== year || calendarDay.getUTCMonth() !== month - 1
    || calendarDay.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null
  calendarDay.setUTCHours(hour, minute, second, Number((fraction ?? '').padEnd(3, '0').slice(0, 3)))
  // A valid historical ISO string is not proof of its timezone. UTC is used
  // only as a calendar container here, never as the inferred match instant.
  if (!offset) return { wallDate: calendarDay, instant: null }
  if (offset.toUpperCase() !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? { wallDate: calendarDay, instant: timestamp } : null
}

export function isValidRbfaStartTime(value: unknown): boolean {
  return readRbfaDate(value) !== null
}

// Only an explicit offset establishes an instant until the RBFA convention
// for historical offset-free values has been confirmed independently.
export function parseRbfaStartTime(value: unknown): number | null {
  return readRbfaDate(value)?.instant ?? null
}

export function formatRbfaKickoff(value: unknown): { date: string; time: string; warning?: string } | null {
  const parsed = readRbfaDate(value)
  if (!parsed) return null
  const timestamp = parsed.instant ?? parsed.wallDate.getTime()
  const timeZone = parsed.instant === null ? 'UTC' : RBFA_TIME_ZONE
  return {
    date: new Intl.DateTimeFormat('fr-FR', {
      timeZone, weekday: 'long', day: 'numeric', month: 'long',
    }).format(timestamp),
    time: new Intl.DateTimeFormat('fr-FR', {
      timeZone, hour: '2-digit', minute: '2-digit',
    }).format(timestamp),
    ...(parsed.instant === null ? { warning: 'Fuseau horaire à confirmer.' } : {}),
  }
}
