import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { num } from '../lib/format'
import { daysSince } from '../lib/dates'
import { dishGroup, DISH_GROUPS } from '../lib/dishGroups'
import type { DishSale } from '../types'

const DOW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const GROUPS = ['הכל', ...DISH_GROUPS]
const deptLabel = (s: string) => (s === 'kitchen' ? 'מטבח' : s === 'bar' ? 'בר' : s === 'other' ? 'אחר' : s)
const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
    active ? 'bg-paseo-gold text-paseo-bg' : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
  }`

interface WeeklyDish extends DishSale {
  perWeek: number // ממוצע שבועי
  par: number // מלאי ברזל מומלץ (ממוצע × מקדם ביטחון)
}

export function Purchasing() {
  const d = usePaseo()
  const [group, setGroup] = useState<string>('הכל')
  const [q, setQ] = useState('')

  // --- תחזית סועדים לפי יום בשבוע (28 ימים אחרונים) ---
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

  // --- תנודתיות שבועית: מקדם ביטחון = שבוע שיא / ממוצע (שבועות מלאים בלבד) ---
  const weekAgg = new Map<string, { diners: number; days: number }>()
  for (const s of d.sales) {
    if (daysSince(s.date) < 0) continue
    const dt = new Date(s.date + 'T12:00:00')
    const sun = new Date(dt)
    sun.setDate(dt.getDate() - dt.getDay())
    const key = sun.toISOString().slice(0, 10)
    const w = weekAgg.get(key) ?? { diners: 0, days: 0 }
    w.diners += s.diners
    w.days++
    weekAgg.set(key, w)
  }
  const fullWeeks = [...weekAgg.values()].filter((w) => w.days >= 6).map((w) => w.diners)
  const avgWeek = fullWeeks.length ? fullWeeks.reduce((a, b) => a + b, 0) / fullWeeks.length : 0
  const peakWeek = fullWeeks.length ? Math.max(...fullWeeks) : 0
  // מקדם ביטחון חסום לטווח סביר (1.15–1.6) כדי לא להגזים/לחסר
  const safety = avgWeek ? Math.min(1.6, Math.max(1.15, peakWeek / avgWeek)) : 1.25

  // --- מלאי ברזל לכל מנה ---
  const period = d.dishesPeriod
  const periodDays = period
    ? Math.max(1, Math.round((Date.parse(period.end) - Date.parse(period.start)) / 864e5) + 1)
    : 30
  const query = q.trim()
  const dishes: WeeklyDish[] = d.dishes
    .filter((x) => group === 'הכל' || dishGroup(x.category, x.department) === group)
    .filter((x) => !query || x.dishName.includes(query) || (x.category || '').includes(query))
    .map((x) => {
      const perWeek = Math.round((x.quantity / periodDays) * 7)
      return { ...x, perWeek, par: Math.ceil(perWeek * safety) }
    })
    .filter((x) => x.perWeek >= 1)
    .sort((a, b) => b.par - a.par)

  const cols: Column<WeeklyDish>[] = [
    { key: 'dishName', header: 'מנה', render: (r) => <span className="font-medium">{r.dishName}</span> },
    { key: 'category', header: 'קטגוריה', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.category || '—'}</span> },
    { key: 'department', header: 'מחלקה', render: (r) => deptLabel(r.department) },
    { key: 'perWeek', header: 'ממוצע/שבוע', render: (r) => <span className="text-paseo-muted tabular-nums">{num(r.perWeek)}</span> },
    { key: 'par', header: 'מלאי ברזל', render: (r) => <span className="font-bold text-paseo-gold tabular-nums">{num(r.par)}</span> },
  ]

  const hasData = d.dishes.length > 0 || recent.length > 0

  return (
    <div>
      <PageHeader
        title="תכנון רכש שבועי"
        subtitle="כמה להחזיק כדי לא להיתקל בחוסרים — לפי הביקוש והתנודתיות בפועל"
      />

      {!hasData ? (
        <div className="text-center text-paseo-muted py-16 text-sm">אין עדיין מספיק נתונים — יצטברו עם הסנכרון היומי.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Widget title="צפי סועדים לשבוע">
              <Stat value={num(weeklyDiners)} label="ממוצע לפי יום בשבוע" tone="text-paseo-green" />
            </Widget>
            <Widget title="שבוע שיא">
              <Stat value={num(Math.round(peakWeek))} label="העמוס ביותר עד היום" tone="text-paseo-gold" />
            </Widget>
            <Widget title="מקדם ביטחון">
              <Stat value={`×${safety.toFixed(2)}`} label="שיא שבועי מול ממוצע" tone="text-paseo-blue" />
            </Widget>
            <Widget title="היום העמוס">
              <Stat value={DOW[dowAvg.indexOf(dowMax)]} label={`~${num(dowMax)} סועדים`} tone="text-paseo-amber" />
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

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש מנה…"
              className="w-full sm:w-56 rounded-lg border border-paseo-border bg-paseo-bg px-3 py-1.5 text-sm text-paseo-text outline-none focus:border-paseo-gold"
            />
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((g) => (
                <button key={g} onClick={() => setGroup(g)} className={pill(group === g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <Widget title="מלאי ברזל שבועי לכל מנה">
            <DataTable columns={cols} rows={dishes} rowKey={(r) => r.dishName + r.category} empty="אין נתוני מנות" />
          </Widget>

          <div className="mt-3 space-y-1 text-[11px] text-paseo-muted">
            <p>
              <span className="text-paseo-text/80 font-medium">מלאי ברזל</span> = הכמות השבועית הממוצעת × מקדם הביטחון (×
              {safety.toFixed(2)}). המקדם נגזר מהיחס בין השבוע העמוס ביותר לממוצע, כדי שתהיה מכוסה גם בשבוע חזק.
            </p>
            <p>
              הכמויות הן ברמת <span className="text-paseo-text/80">המנה הנמכרת</span> — לא מצרך גלם. למעבר לרמת סחורה
              (ק״ג בשר, מארזים) או הזמנה לכל ספק בנפרד, צריך מיפוי מתכון (מנה → מצרכים) — אפשר להוסיף.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
