import type { Activity } from './activity.types'

export interface CalendarDay {
  date: string
  day: number
  inCurrentMonth: boolean
}

export function getMonthDays(year: number, month: number): CalendarDay[] {
  const first = new Date(Date.UTC(year, month, 1))

  const precedingDays = (first.getUTCDay() + 6) % 7

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, 1 - precedingDays + index))

    return {
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inCurrentMonth:
        date.getUTCFullYear() === year && date.getUTCMonth() === month,
    }
  })
}

export function getMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1)))
}

const madridDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Madrid',
})

export function getMadridDate(instant = new Date()): string {
  const parts = madridDateFormatter.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value

  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export function activityOccursOn(activity: Activity, date: string): boolean {
  const schedule = activity.schedule
  if (schedule.kind === 'date') return schedule.date === date

  const start = getMadridDate(new Date(schedule.at))
  if (schedule.kind === 'instant') return start === date
  const end = getMadridDate(new Date(Date.parse(schedule.end_at) - 1))
  return start <= date && date <= end
}

export function getWeekDays(referenceDate: string): CalendarDay[] {
  const reference = new Date(`${referenceDate}T00:00:00Z`)
  const precedingDays = (reference.getUTCDay() + 6) % 7
  const monday = addCalendarDays(referenceDate, -precedingDays)

  return Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(monday, index)
    const parsed = new Date(`${date}T00:00:00Z`)

    return {
      date,
      day: parsed.getUTCDate(),
      inCurrentMonth:
        parsed.getUTCFullYear() === reference.getUTCFullYear() &&
        parsed.getUTCMonth() === reference.getUTCMonth(),
    }
  })
}

export function getWeekLabel(referenceDate: string): string {
  const days = getWeekDays(referenceDate)
  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return formatter.formatRange(
    new Date(`${days[0].date}T00:00:00Z`),
    new Date(`${days[6].date}T00:00:00Z`),
  )
}

export function getDayLabel(referenceDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${referenceDate}T00:00:00Z`))
}

export function compareCalendarActivities(
  left: Activity,
  right: Activity,
): number {
  const leftUntimed = left.schedule.kind === 'date'
  const rightUntimed = right.schedule.kind === 'date'
  if (leftUntimed !== rightUntimed) return leftUntimed ? 1 : -1
  if (left.schedule.kind !== 'date' && right.schedule.kind !== 'date') {
    const difference =
      Date.parse(left.schedule.at) - Date.parse(right.schedule.at)
    if (difference !== 0) return difference
  }
  return (
    left.title.localeCompare(right.title, 'es') ||
    left.id.localeCompare(right.id)
  )
}
