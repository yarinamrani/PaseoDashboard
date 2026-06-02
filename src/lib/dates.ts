import {
  differenceInCalendarDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  isWithinInterval,
  parseISO,
} from 'date-fns'

// Fixed "now" so the dashboard is reproducible against the mock data.
// In production this becomes `new Date()`.
export const TODAY = new Date('2026-06-02T09:00:00')

// השבוע בישראל מתחיל ביום ראשון
const WEEK_OPTS = { weekStartsOn: 0 as const }

export function thisWeekRange(ref: Date = TODAY) {
  return {
    start: startOfWeek(ref, WEEK_OPTS),
    end: endOfWeek(ref, WEEK_OPTS),
  }
}

export function lastWeekRange(ref: Date = TODAY) {
  const lw = subWeeks(ref, 1)
  return {
    start: startOfWeek(lw, WEEK_OPTS),
    end: endOfWeek(lw, WEEK_OPTS),
  }
}

// "שבוע עד היום": מתחילת השבוע ועד עכשיו (ולא שבוע מלא)
export function thisWeekToDateRange(ref: Date = TODAY) {
  return { start: startOfWeek(ref, WEEK_OPTS), end: ref }
}

// אותה תקופה בשבוע שעבר (לאותו מספר ימים) — להשוואה הוגנת
export function lastWeekToDateRange(ref: Date = TODAY) {
  const lw = subWeeks(ref, 1)
  return { start: startOfWeek(lw, WEEK_OPTS), end: lw }
}

export function thisMonthRange(ref: Date = TODAY) {
  return { start: startOfMonth(ref), end: endOfMonth(ref) }
}

export function inRange(isoDate: string, range: { start: Date; end: Date }) {
  return isWithinInterval(parseISO(isoDate), range)
}

export function daysSince(isoDate: string, ref: Date = TODAY) {
  return differenceInCalendarDays(ref, parseISO(isoDate))
}

export function daysUntil(isoDate: string, ref: Date = TODAY) {
  return differenceInCalendarDays(parseISO(isoDate), ref)
}

export function hoursSince(isoDate: string, ref: Date = TODAY) {
  return (ref.getTime() - parseISO(isoDate).getTime()) / (1000 * 60 * 60)
}

const HE_DATE = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDate(isoDate: string) {
  return HE_DATE.format(parseISO(isoDate))
}
