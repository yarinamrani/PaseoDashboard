import type { PaseoData, Alert } from '../types'
import { daysSince, daysUntil, hoursSince, formatDate } from './dates'

// מנוע האוטומציות: מעריך את ארבעת הכללים מהמפרט על הדאטה
// ומפיק רשימת התראות. זהו הבסיס ל"משימות אדומות" ולפיד ההתראות.

export interface AutomationRule {
  id: string
  name: string
  trigger: string
  action: string
  recipient: string
}

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'a-followup',
    name: 'Follow Up לליד חדש',
    trigger: 'ליד חדש נכנס',
    action: 'נוצרת משימת Follow Up אוטומטית ל-24 שעות',
    recipient: 'מנהל אירועים',
  },
  {
    id: 'a-event14',
    name: 'אירוע מתקרב',
    trigger: 'אירוע סגור בעוד 14 יום',
    action: 'התראה למנהל האירועים להתחיל תיאום',
    recipient: 'מנהל אירועים',
  },
  {
    id: 'a-lowreview',
    name: 'ביקורת שלילית',
    trigger: 'ביקורת בדירוג 1–3 כוכבים',
    action: 'התראה למנהל המסעדה לטיפול ומענה',
    recipient: 'מנהל מסעדה',
  },
  {
    id: 'a-staleissue',
    name: 'תקלה תקועה',
    trigger: 'תקלה פתוחה מעל 3 ימים',
    action: 'התראה למנהל התפעול',
    recipient: 'מנהל תפעול',
  },
]

export function runAutomations(d: PaseoData): Alert[] {
  const alerts: Alert[] = []

  // 1) ליד חדש -> Follow Up אוטומטי ל-24 שעות
  for (const e of d.events) {
    if (e.status === 'ליד חדש' && hoursSince(e.createdAt) <= 24) {
      const hoursLeft = Math.max(0, Math.round(24 - hoursSince(e.createdAt)))
      alerts.push({
        id: `al-fu-${e.id}`,
        rule: 'Follow Up לליד חדש',
        severity: 'high',
        title: `Follow Up: ${e.customer}`,
        detail: `ליד חדש (${e.eventType}, ${e.guests} אורחים). נותרו ${hoursLeft} שעות לחזור ללקוח.`,
        assignedTo: e.owner,
        createdAt: e.createdAt,
        link: '/events',
      })
    }
  }

  // 2) אירוע סגור בעוד 14 יום או פחות -> התראה למנהל אירועים
  for (const e of d.events) {
    const u = daysUntil(e.date)
    if (e.status === 'נסגר' && u >= 0 && u <= 14) {
      alerts.push({
        id: `al-ev-${e.id}`,
        rule: 'אירוע מתקרב',
        severity: u <= 7 ? 'high' : 'medium',
        title: `אירוע בעוד ${u} ימים: ${e.customer}`,
        detail: `${e.eventType} · ${e.guests} אורחים · ${formatDate(e.date)}. לוודא תיאום סופי.`,
        assignedTo: e.owner,
        createdAt: e.createdAt,
        link: '/events',
      })
    }
  }

  // 3) ביקורת 1–3 כוכבים שלא טופלה -> התראה למנהל מסעדה
  for (const r of d.reviews) {
    if (r.rating <= 3 && !r.handled) {
      alerts.push({
        id: `al-rv-${r.id}`,
        rule: 'ביקורת שלילית',
        severity: r.rating <= 2 ? 'high' : 'medium',
        title: `ביקורת ${r.rating}★ ב-${r.platform}`,
        detail: r.text ? `"${r.text}" — דורש מענה.` : 'ביקורת נמוכה דורשת מענה.',
        assignedTo: r.owner,
        createdAt: r.date,
        link: '/reviews',
      })
    }
  }

  // 4) תקלה פתוחה מעל 3 ימים -> התראה למנהל תפעול
  for (const m of d.maintenance) {
    const age = daysSince(m.openedDate)
    if (m.status !== 'סגור' && age > 3) {
      alerts.push({
        id: `al-mt-${m.id}`,
        rule: 'תקלה תקועה',
        severity: age > 7 ? 'high' : 'medium',
        title: `תקלה פתוחה ${age} ימים: ${m.issue}`,
        detail: `אזור ${m.area} · סטטוס ${m.status}. דורש טיפול.`,
        assignedTo: m.owner,
        createdAt: m.openedDate,
        link: '/maintenance',
      })
    }
  }

  // מיון: חומרה גבוהה קודם, ואז החדש ביותר
  const sev = { high: 0, medium: 1, info: 2 }
  return alerts.sort(
    (a, b) =>
      sev[a.severity] - sev[b.severity] || b.createdAt.localeCompare(a.createdAt),
  )
}

// "משימות אדומות" = התראות בחומרה גבוהה
export function redTasks(d: PaseoData): Alert[] {
  return runAutomations(d).filter((a) => a.severity === 'high')
}
