import type { PaseoData, EventStatus } from '../types'
import {
  TODAY,
  thisWeekRange,
  lastWeekRange,
  thisMonthRange,
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
export function weekRevenue(d: PaseoData) {
  const r = thisWeekRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.revenue, 0)
}

export function lastWeekRevenue(d: PaseoData) {
  const r = lastWeekRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.revenue, 0)
}

export function monthRevenue(d: PaseoData) {
  const r = thisMonthRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.revenue, 0)
}

export function weekDiners(d: PaseoData) {
  const r = thisWeekRange()
  return d.sales.filter((s) => inRange(s.date, r)).reduce((a, s) => a + s.diners, 0)
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
