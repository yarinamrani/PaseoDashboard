import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { num } from '../lib/format'
import { daysSince } from '../lib/dates'
import type { DishSale } from '../types'

const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const DEPTS = [
  { key: 'הכל', label: 'הכל' },
  { key: 'kitchen', label: 'מטבח' },
  { key: 'bar', label: 'בר' },
]
const deptLabel = (s: string) => (s === 'kitchen' ? 'מטבח' : s === 'bar' ? 'בר' : s === 'other' ? 'אחר' : s)
const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
    active ? 'bg-paseo-gold text-paseo-bg' : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
  }`

interface WeeklyDish extends DishSale {
  perWeek: number
}

export function Purchasing() {
  const d = usePaseo()
  const [dept, setDept] = useState('הכל')

  // --- תחזית סועדים לשבוע הקרוב, לפי ממוצע יום-בשבוע מ-28 הימים האחרונים ---
  const recent = d.sales.filter((s) => daysSince(s.date) <= 28 && daysSince(s.date) >= 0)
  const byDow = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))
  for (const s of recent) {
    const dow = new Date(s.date + 'T12:00:00').getDay()
    byDow[dow].sum += s.diners
    byDow[dow].count++
  }
  const dowAvg = byDow.map((x) => (x.count ? Math.round(x.sum / x.count) : 0))
  const weeklyDiners = dowAvg.reduce((a, b) => a + b, 0)
  const dowMax = Math.max(...dowAvg, 1)

  // --- "מלאי ברזל": כמות שבועית ממוצעת לכל מנה, מנורמל מטווח נתוני המנות ---
  const period = d.dishesPeriod
  const periodDays = period
    ? Math.max(1, Math.round((Date.parse(period.end) - Date.parse(period.start)) / 864e5) + 1)
    : 30
  const dishes: WeeklyDish[] = (dept === 'הכל' ? d.dishes : d.dishes.filter((x) => x.department === dept))
    .map((x) => ({ ...x, perWeek: Math.round((x.quantity / periodDays) * 7) }))
    .filter((x) => x.perWeek >= 1)
    .sort((a, b) => b.perWeek - a.perWeek)

  const cols: Column<WeeklyDish>[] = [
    { key: 'dishName', header: 'מנה', render: (r) => <span className="font-medium">{r.dishName}</span> },
    { key: 'category', header: 'קטגוריה', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.category || '—'}</span> },
    { key: 'department', header: 'מחלקה', render: (r) => deptLabel(r.department) },
    { key: 'perWeek', header: 'לשבוע (ממוצע)', render: (r) => <span className="font-bold text-paseo-gold tabular-nums">{num(r.perWeek)}</span> },
  ]

  const hasData = d.dishes.length > 0 || recent.length > 0

  return (
    <div>
      <PageHeader
        title="תכנון רכש שבועי"
        subtitle="כמה נכון להזמין השבוע — לפי הביקוש בשבועות האחרונים"
      />

      {!hasData ? (
        <div className="text-center text-paseo-muted py-16 text-sm">אין עדיין מספיק נתונים — יצטברו עם הסנכרון היומי.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Widget title="צפי סועדים לשבוע">
              <Stat value={num(weeklyDiners)} label="לפי ממוצע 4 השבועות" tone="text-paseo-green" />
            </Widget>
            <Widget title="ממוצע ליום">
              <Stat value={num(Math.round(weeklyDiners / 7))} label="סועדים" tone="text-paseo-blue" />
            </Widget>
            <Widget title="היום העמוס">
              <Stat value={DOW[dowAvg.indexOf(dowMax)]} label={`~${num(dowMax)} סועדים`} tone="text-paseo-gold" />
            </Widget>
          </div>

          <Widget title="צפי סועדים לפי יום בשבוע" className="mb-6">
            <div className="space-y-2">
              {dowAvg.map((v, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-paseo-muted shrink-0">{DOW[i]}</span>
                  <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-paseo-gold/70" style={{ width: `${Math.round((v / dowMax) * 100)}%` }} />
                  </div>
                  <span className="w-10 text-xs tabular-nums text-paseo-text/90 text-left shrink-0">{num(v)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-paseo-muted mt-3">לפי מספר הסועדים בפועל (מאלפרד) ב-28 הימים האחרונים.</p>
          </Widget>

          <div className="flex flex-wrap gap-2 mb-4">
            {DEPTS.map((x) => (
              <button key={x.key} onClick={() => setDept(x.key)} className={pill(dept === x.key)}>
                {x.label}
              </button>
            ))}
          </div>

          <Widget title="מלאי ברזל שבועי — כמות ממוצעת למנה">
            <DataTable columns={cols} rows={dishes} rowKey={(r) => r.dishName + r.category} empty="אין נתוני מנות" />
          </Widget>

          <p className="text-[11px] text-paseo-muted mt-3">
            הכמויות הן ברמת המנה הנמכרת (לא מצרך גלם). לקבלת המלצה לכל ספק בנפרד צריך למפות אילו מנות/קטגוריות כל ספק
            מספק — אם תרצה, אפשר להוסיף מיפוי כזה.
          </p>
        </>
      )}
    </div>
  )
}
