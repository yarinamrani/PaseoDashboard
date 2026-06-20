import {
  differenceInCalendarDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  isWithinInterval,
  parseISO,
} from 'date-fns'

// "עכשיו" אמיתי — הדשבורד עובד מול הזמן הנוכחי בפועל.
export const TODAY = new Date()

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

// "חודש עד היום" — מתחילת החודש ועד עכשיו (להשוואה הוגנת מול חודש קודם)
export function thisMonthToDateRange(ref: Date = TODAY) {
  return { start: startOfMonth(ref), end: ref }
}

// אותו חלק בחודש שעבר (מ-1 בחודש שעבר ועד אותו יום-בחודש)
export function lastMonthToDateRange(ref: Date = TODAY) {
  const lm = subMonths(ref, 1)
  return { start: startOfMonth(lm), end: lm }
}

// פירוק ISO בטוח — מחזיר null אם התאריך חסר/לא תקין.
// לידים אמיתיים מ-crm_leads עלולים להגיע ללא event_date, ואסור שזה יפיל את העמוד.
function safeParse(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null
  const d = parseISO(isoDate)
  return Number.isNaN(d.getTime()) ? null : d
}

export function inRange(isoDate: string, range: { start: Date; end: Date }) {
  const d = safeParse(isoDate)
  return d ? isWithinInterval(d, range) : false
}

export function daysSince(isoDate: string, ref: Date = TODAY) {
  const d = safeParse(isoDate)
  return d ? differenceInCalendarDays(ref, d) : NaN
}

export function daysUntil(isoDate: string, ref: Date = TODAY) {
  const d = safeParse(isoDate)
  return d ? differenceInCalendarDays(d, ref) : NaN
}

export function hoursSince(isoDate: string, ref: Date = TODAY) {
  const d = safeParse(isoDate)
  return d ? (ref.getTime() - d.getTime()) / (1000 * 60 * 60) : NaN
}

const HE_DATE = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDate(isoDate: string) {
  const d = safeParse(isoDate)
  return d ? HE_DATE.format(d) : '—'
}

// מפתחות תקופה לסימון ביצוע משימות (לפי שעון מקומי = ישראל אצל המשתמש)
export function dayKey(): string {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
}
export function weekKey(): string {
  const d = new Date()
  const sun = new Date(d)
  sun.setDate(d.getDate() - d.getDay()) // ראשון של השבוע הנוכחי
  return sun.toLocaleDateString('en-CA')
}
