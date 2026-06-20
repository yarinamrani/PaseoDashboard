import type { PaseoData, EventStatus } from '../types'
import {
  TODAY,
  lastWeekRange,
  thisWeekToDateRange,
  lastWeekToDateRange,
  thisMonthRange,
  thisMonthToDateRange,
  lastMonthToDateRange,
  inRange,
  daysSince,
  daysUntil,
} from './dates'

const OPEN_LEAD_STATUSES: EventStatus[] = [
  'ליד חדש',
  'שיחה בוצעה',
  'פגישה',
  'הצעה נשלחה',
  'משא ומתן',
]

// --- מכירות ---
function sumRevenue(d: PaseoData, r: { start: Date; end: Date }) {
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.revenue, 0)
}

// "מחזור השבוע" = שבוע עד היום (מתחילת השבוע ועד עכשיו)
export function weekRevenue(d: PaseoData) {
  return sumRevenue(d, thisWeekToDateRange())
}

// אותה תקופה בשבוע שעבר — להשוואה הוגנת (week-over-week)
export function lastWeekToDateRevenue(d: PaseoData) {
  return sumRevenue(d, lastWeekToDateRange())
}

// שבוע קודם מלא (לשימוש בסיכום ה-KPI השבועי של יום ראשון)
export function lastWeekRevenue(d: PaseoData) {
  return sumRevenue(d, lastWeekRange())
}

export function monthRevenue(d: PaseoData) {
  const r = thisMonthRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.revenue, 0)
}

export function weekDiners(d: PaseoData) {
  const r = thisWeekToDateRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.diners, 0)
}

function sumDiners(d: PaseoData, r: { start: Date; end: Date }) {
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.diners, 0)
}

// השוואה חודשית הוגנת: חודש-עד-היום מול אותו חלק בחודש שעבר
export interface MonthCompare {
  revenue: number
  revenuePrev: number
  revenueDelta: number // אחוז שינוי
  diners: number
  dinersPrev: number
  dinersDelta: number
}
const deltaPct = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : 0)
export function monthCompare(d: PaseoData): MonthCompare {
  const cur = thisMonthToDateRange()
  const prev = lastMonthToDateRange()
  const revenue = sumRevenue(d, cur)
  const revenuePrev = sumRevenue(d, prev)
  const diners = sumDiners(d, cur)
  const dinersPrev = sumDiners(d, prev)
  return {
    revenue,
    revenuePrev,
    revenueDelta: deltaPct(revenue, revenuePrev),
    diners,
    dinersPrev,
    dinersDelta: deltaPct(diners, dinersPrev),
  }
}

// --- משפך לידים והמרה ---
export interface ConversionStats {
  total: number // סה״כ לידים/אירועים
  open: number // בפייפליין (טרם הוכרעו)
  won: number // נסגרו
  lost: number // אבודים
  rate: number // אחוז סגירה מתוך מה שהוכרע (won/(won+lost))
  pipeline: number // שווי לידים פתוחים (₪)
  wonValue: number // שווי אירועים שנסגרו (₪)
}
export function conversionStats(d: PaseoData): ConversionStats {
  const won = d.events.filter((e) => e.status === 'נסגר')
  const lost = d.events.filter((e) => e.status === 'אבוד')
  const decided = won.length + lost.length
  return {
    total: d.events.length,
    open: openLeads(d).length,
    won: won.length,
    lost: lost.length,
    rate: decided ? (won.length / decided) * 100 : 0,
    pipeline: openPipelineValue(d),
    wonValue: won.reduce((a, e) => a + (e.value ?? 0), 0),
  }
}

export function weekAvgPerDiner(d: PaseoData) {
  const rev = weekRevenue(d)
  const diners = weekDiners(d)
  return diners ? Math.round(rev / diners) : 0
}

// סדרת מחזור יומית ל-N הימים האחרונים (לגרף)
export function dailyRevenueSeries(d: PaseoData, days = 30) {
  return d.sales
    .filter((s) => daysSince(s.date) < days && daysSince(s.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date.slice(5), מחזור: s.revenue, סועדים: s.diners }))
}

// --- אירועים / לידים ---
export function openLeads(d: PaseoData) {
  return d.events.filter((e) => OPEN_LEAD_STATUSES.includes(e.status))
}

// לידים שבאמת ממתינים למענה ראשון = "ליד חדש" בלבד.
// לידים ב"שיחה בוצעה"/הצעה/מו״מ כבר בטיפול ואינם נחשבים "ממתינים".
export function newLeads(d: PaseoData) {
  return d.events.filter((e) => e.status === 'ליד חדש')
}

// --- פילוח אמצעי תשלום (מדוח ה-Z של ביקום) ---
const PAY_LABELS: Record<string, string> = {
  credit: 'אשראי',
  cash: 'מזומן',
  bizns: 'ביזנס לוג׳יק',
  multipass: 'מולטיפס',
  wolt: 'וולט',
  sodexo: 'סודקסו',
  mega: 'מגה לאן',
  employee: 'הפקדת עובדים',
}

export interface PaymentSlice {
  method: string
  label: string
  amount: number
  pct: number
}

// מסכם את אמצעי התשלום על פני כל ימי המכירות הטעונים
export function paymentBreakdown(d: PaseoData): PaymentSlice[] {
  const sums: Record<string, number> = {}
  for (const s of d.sales) {
    if (!s.payments) continue
    for (const [k, v] of Object.entries(s.payments)) sums[k] = (sums[k] ?? 0) + (v || 0)
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0)
  return Object.entries(sums)
    .filter(([, v]) => v > 0)
    .map(([method, amount]) => ({
      method,
      label: PAY_LABELS[method] ?? method,
      amount,
      pct: total ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// יעד מחזור חודשי (₪) — ניתן לכוונן
export const MONTHLY_TARGET = 400000

export function leadsByStatus(d: PaseoData) {
  const counts: Record<string, number> = {}
  for (const e of d.events) counts[e.status] = (counts[e.status] ?? 0) + 1
  return counts
}

export function upcomingEvents(d: PaseoData, withinDays = 30) {
  return d.events
    .filter((e) => e.status === 'נסגר')
    .filter((e) => {
      const u = daysUntil(e.date)
      return u >= 0 && u <= withinDays
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function openPipelineValue(d: PaseoData) {
  return openLeads(d).reduce((a, e) => a + (e.value ?? 0), 0)
}

// --- ביקורות ---
export function googleRating(d: PaseoData) {
  // הדירוג האמיתי מגוגל (אגרגטיבי) אם קיים; אחרת ממוצע הביקורות שנמשכו
  if (d.googleRating != null) return d.googleRating
  const g = d.reviews.filter((r) => r.platform === 'Google')
  if (!g.length) return 0
  return g.reduce((a, r) => a + r.rating, 0) / g.length
}

export function reviewsThisMonth(d: PaseoData) {
  const r = thisMonthRange()
  return d.reviews.filter((rv) => inRange(rv.date, r))
}

export function lowReviews(d: PaseoData) {
  return d.reviews.filter((r) => r.rating <= 3)
}

// --- תחזוקה ---
export function openIssues(d: PaseoData) {
  return d.maintenance.filter((m) => m.status !== 'סגור')
}

export function staleIssues(d: PaseoData, days = 3) {
  return openIssues(d).filter((m) => daysSince(m.openedDate) > days)
}

// --- שיווק ---
export function marketingStats(d: PaseoData) {
  const r = thisMonthRange()
  const monthTasks = d.marketing.filter((m) => inRange(m.publishDate, r))
  const postsDone = d.marketing.filter(
    (m) => m.status === 'פורסם' && m.kind === 'תוכן' && m.type !== 'רילס',
  ).length
  const reelsDone = d.marketing.filter(
    (m) => m.status === 'פורסם' && m.type === 'רילס',
  ).length
  const activeCampaigns = d.marketing.filter(
    (m) => m.kind === 'ממומן' && m.status === 'פעיל',
  ).length
  const adLeads = d.marketing.reduce((a, m) => a + (m.leadsFromAd ?? 0), 0)
  return { monthTasks, postsDone, reelsDone, activeCampaigns, adLeads }
}

// --- עובדים ---
export function activeEmployees(d: PaseoData) {
  return d.employees.filter((e) => e.status === 'פעיל')
}

export const GOOGLE_TARGET = 4.6
export const TODAY_REF = TODAY
