import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { shekel, num } from '../lib/format'
import { formatDate } from '../lib/dates'
import { dishGroup, DISH_GROUPS } from '../lib/dishGroups'
import type { DishSale, HourlyBucket } from '../types'

const GROUPS = ['הכל', ...DISH_GROUPS]
const deptLabel = (d: string) => (d === 'kitchen' ? 'מטבח' : d === 'bar' ? 'בר' : d === 'other' ? 'אחר' : d)

function pill(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
    active ? 'bg-paseo-gold text-paseo-bg' : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
  }`
}

const dishCols: Column<DishSale>[] = [
  { key: 'dishName', header: 'מנה', render: (r) => <span className="font-medium">{r.dishName}</span> },
  { key: 'category', header: 'קטגוריה', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.category || '—'}</span> },
  { key: 'department', header: 'מחלקה', render: (r) => deptLabel(r.department) },
  { key: 'quantity', header: 'כמות', render: (r) => <span className="font-bold tabular-nums">{num(r.quantity)}</span> },
  { key: 'income', header: 'הכנסה', render: (r) => <span className="text-paseo-gold tabular-nums">{shekel(r.income)}</span> },
]

function PeakHours({ hourly }: { hourly: HourlyBucket[] }) {
  if (!hourly.length) return null
  const max = Math.max(...hourly.map((h) => h.diners), 1)
  const peak = hourly.reduce((a, h) => (h.diners > a.diners ? h : a), hourly[0])
  return (
    <Widget title={`פילוח לפי שעה · שעת שיא ${String(peak.hour).padStart(2, '0')}:00`}>
      <div className="flex items-end gap-1.5 h-40 pt-2">
        {hourly.map((h) => (
          <div key={h.hour} className="flex-1 flex flex-col items-center justify-end gap-1 group">
            <span className="text-[10px] text-paseo-muted opacity-0 group-hover:opacity-100 transition-opacity">{h.diners}</span>
            <div
              className={`w-full rounded-t ${h.hour === peak.hour ? 'bg-paseo-gold' : 'bg-paseo-blue/50'}`}
              style={{ height: `${Math.round((h.diners / max) * 100)}%` }}
              title={`${String(h.hour).padStart(2, '0')}:00 · ${h.diners} סועדים · ${h.orders} הזמנות · ${shekel(h.revenue)}`}
            />
            <span className="text-[10px] text-paseo-muted tabular-nums">{h.hour}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-paseo-muted mt-3 text-center">סועדים לפי שעה (סכום הטווח) — לתכנון משמרות וכוח אדם</p>
    </Widget>
  )
}

export function Menu() {
  const d = usePaseo()
  const [group, setGroup] = useState<string>('הכל')
  const [q, setQ] = useState('')

  const query = q.trim()
  const dishes = d.dishes
    .filter((x) => group === 'הכל' || dishGroup(x.category, x.department) === group)
    .filter((x) => !query || x.dishName.includes(query) || (x.category || '').includes(query))
  const sorted = [...dishes].sort((a, b) => b.quantity - a.quantity)
  const totalIncome = dishes.reduce((a, x) => a + x.income, 0)
  const totalQty = dishes.reduce((a, x) => a + x.quantity, 0)

  // מנות חלשות: נמכרו מעט בטווח (מועמדות לבחינה). מסננים פריטי קופה שאינם מנות
  // אמיתיות (חיוב/זיכוי מהיר, שתיית עובדים, הערות למטבח, קטגוריות ריקות/שונות).
  const JUNK = ['חיוב', 'זיכוי', 'הערה', 'שתיית עובדים', 'פריט כללי', 'ת.', 'קראף']
  const dead = [...dishes]
    .filter(
      (x) =>
        x.quantity > 0 &&
        (x.department === 'kitchen' || x.department === 'bar') &&
        x.category &&
        x.category !== 'שונות' &&
        x.category !== 'כללי' &&
        !JUNK.some((j) => x.dishName.startsWith(j)),
    )
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10)

  // הכנסה לפי קטגוריה
  const byCat = new Map<string, number>()
  for (const x of dishes) byCat.set(x.category || 'אחר', (byCat.get(x.category || 'אחר') ?? 0) + x.income)
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const catMax = cats.length ? cats[0][1] : 1

  const period = d.dishesPeriod
  const subtitle = period
    ? `מכירות ברמת המנה · ${formatDate(period.start)}–${formatDate(period.end)}`
    : 'מכירות ברמת המנה — 30 הימים האחרונים'

  if (!d.dishes.length) {
    return (
      <div>
        <PageHeader title="מנות" subtitle={subtitle} />
        <div className="text-center text-paseo-muted py-16 text-sm">אין נתוני מנות עדיין — הסנכרון מאלפרד ירוץ בקרוב.</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="מנות" subtitle={subtitle} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="מנות שונות">
          <Stat value={num(dishes.length)} label="פריטים בתפריט שנמכרו" tone="text-paseo-text" />
        </Widget>
        <Widget title="מנות שנמכרו">
          <Stat value={num(totalQty)} label="סה״כ יחידות" tone="text-paseo-blue" />
        </Widget>
        <Widget title="הכנסה מהמנות">
          <Stat value={shekel(totalIncome)} label="בטווח" tone="text-paseo-gold" />
        </Widget>
        <Widget title="המנה המובילה">
          <Stat value={sorted[0]?.dishName ?? '—'} label={sorted[0] ? `${num(sorted[0].quantity)} יח׳` : ''} tone="text-paseo-green" />
        </Widget>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <PeakHours hourly={d.hourly} />
        <Widget title="הכנסה לפי קטגוריה">
          <div className="space-y-2.5">
            {cats.map(([cat, income]) => (
              <div key={cat}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-paseo-text/90">{cat}</span>
                  <span className="text-paseo-gold tabular-nums">{shekel(income)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-paseo-gold/70" style={{ width: `${Math.round((income / catMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Widget>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Widget title="רבי-מכר (לפי כמות)">
          <DataTable columns={dishCols} rows={sorted.slice(0, 20)} rowKey={(r) => r.dishName + r.category} />
        </Widget>
        <Widget title="מנות חלשות — מועמדות לבחינה">
          <DataTable columns={dishCols} rows={dead} rowKey={(r) => r.dishName + r.category} />
        </Widget>
      </div>
    </div>
  )
}
