import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { monthRevenue } from '../lib/metrics'
import { shekel } from '../lib/format'
import { formatDate, daysSince } from '../lib/dates'
import type { PriceAnomaly } from '../types'

const HE_MONTH = (ym: string) => {
  const [y, m] = ym.split('-')
  const names = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return `${names[Number(m) - 1] ?? m} ${y}`
}

export function Costs() {
  const d = usePaseo()
  const invoices = d.invoices

  const cost30 = invoices.filter((i) => daysSince(i.date) <= 30 && daysSince(i.date) >= 0).reduce((a, i) => a + i.total, 0)
  const rev30 = monthRevenue(d)
  const foodCostPct = cost30 && rev30 ? (cost30 / rev30) * 100 : 0

  const anomalies = [...d.priceAnomalies].filter((a) => a.pctChange > 0).sort((a, b) => b.pctChange - a.pctChange)
  const openAnoms = anomalies.filter((a) => !a.acknowledged)

  // מגמת עלויות לפי חודש
  const byMonth = new Map<string, number>()
  for (const i of invoices) {
    const m = (i.date || '').slice(0, 7)
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + i.total)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  const maxM = months.length ? Math.max(...months.map((m) => m[1]), 1) : 1

  const cols: Column<PriceAnomaly>[] = [
    { key: 'productName', header: 'מצרך', render: (r) => <span className="font-medium">{r.productName}</span> },
    { key: 'supplierName', header: 'ספק', render: (r) => <span className="text-paseo-muted">{r.supplierName || '—'}</span> },
    { key: 'change', header: 'מחיר', render: (r) => <span className="tabular-nums">{shekel(r.prevPrice)} ← {shekel(r.currentPrice)}</span> },
    { key: 'pct', header: 'שינוי', render: (r) => <span className={`font-bold tabular-nums ${r.pctChange >= 50 ? 'text-paseo-red' : 'text-paseo-amber'}`}>+{Math.round(r.pctChange)}%</span> },
    { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  ]

  return (
    <div>
      <PageHeader title="עלויות ומחירים" subtitle="עלות רכש מהחשבוניות + חריגות מחיר ספקים" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Widget title="עלות רכש · 30 יום">
          <Stat value={cost30 ? shekel(cost30) : '—'} label={`${invoices.length} חשבוניות סה״כ`} tone="text-paseo-gold" />
        </Widget>
        <Widget title="חריגות מחיר">
          <Stat value={openAnoms.length} label="מצרכים שהתייקרו" tone={openAnoms.length ? 'text-paseo-red' : 'text-paseo-green'} />
        </Widget>
        <Widget title="Food Cost משוער">
          <Stat value={cost30 && rev30 ? `${foodCostPct.toFixed(1)}%` : '—'} label="עלות רכש מול מחזור" tone="text-paseo-blue" />
        </Widget>
      </div>

      <Widget title="חריגות מחיר — מצרכים שהתייקרו אצל הספקים" className="mb-6">
        <DataTable
          columns={cols}
          rows={anomalies}
          rowKey={(r) => r.productName + r.date + r.supplierName}
          empty="אין חריגות מחיר כרגע 👍"
        />
      </Widget>

      {months.length > 0 && (
        <Widget title="עלות רכש לפי חודש" className="mb-3">
          <div className="space-y-2">
            {months.map(([ym, total]) => (
              <div key={ym} className="flex items-center gap-3">
                <span className="w-24 text-xs text-paseo-muted shrink-0">{HE_MONTH(ym)}</span>
                <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-paseo-gold/70" style={{ width: `${Math.round((total / maxM) * 100)}%` }} />
                </div>
                <span className="w-20 text-xs tabular-nums text-paseo-text/90 text-left shrink-0">{shekel(total)}</span>
              </div>
            ))}
          </div>
        </Widget>
      )}

      <p className="text-[11px] text-paseo-muted mt-3">
        העלויות מבוססות על החשבוניות שנקלטו בוואטסאפ. ככל שתצלם יותר חשבוניות לבוט — ה-Food Cost והמגמה יהיו מדויקים
        ושלמים יותר. חריגות המחיר מזוהות אוטומטית (קפיצה מעל 30% מהממוצע האחרון).
      </p>
    </div>
  )
}
