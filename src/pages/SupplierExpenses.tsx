import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Receipt, Banknote, Truck, CalendarDays } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { KpiCard } from '../components/KpiCard'
import { usePaseo } from '../data/DataContext'
import { shekel, shekelShort } from '../lib/format'

const chartTheme = { grid: '#2c313c', axis: '#8b93a7', gold: '#d4af37', blue: '#60a5fa' }

const monthKey = (d: string) => (d || '').slice(0, 7) // YYYY-MM
const monthLabel = (k: string) => {
  const [y, m] = k.split('-')
  return `${m}/${y.slice(2)}`
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-paseo-bg border border-paseo-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-paseo-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="font-bold" style={{ color: p.color }}>
          {shekel(p.value)}
        </div>
      ))}
    </div>
  )
}

export function SupplierExpenses() {
  const d = usePaseo()
  const exp = d.supplierExpenses

  const total = exp.reduce((a, e) => a + e.total, 0)
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7)
  const monthTotal = exp.filter((e) => monthKey(e.date) === thisMonth).reduce((a, e) => a + e.total, 0)

  // הוצאה מצטברת לכל ספק
  const bySupplier = Object.values(
    exp.reduce<Record<string, { name: string; total: number; count: number }>>((acc, e) => {
      const k = e.supplierName
      acc[k] = acc[k] || { name: k, total: 0, count: 0 }
      acc[k].total += e.total
      acc[k].count += 1
      return acc
    }, {}),
  ).sort((a, b) => b.total - a.total)

  // מגמת הוצאות חודשית
  const byMonth = Object.entries(
    exp.reduce<Record<string, number>>((acc, e) => {
      const k = monthKey(e.date)
      if (!k) return acc
      acc[k] = (acc[k] || 0) + e.total
      return acc
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ month: monthLabel(k), 'הוצאה': Math.round(v) }))

  const supplierBars = bySupplier.slice(0, 10).map((s) => ({ name: s.name, 'הוצאה': Math.round(s.total) }))
  const recent = [...exp].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)

  return (
    <div>
      <PageHeader
        title="הוצאות ספקים"
        subtitle="לפי חשבוניות מאושרות בלבד — נצבר אוטומטית מכל חשבונית שאתה שולח ומאשר בוואטסאפ"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="סה״כ הוצאות" value={shekel(total)} icon={Banknote} tone="neutral" sub="כל החשבוניות המאושרות" />
        <KpiCard label="החודש" value={shekel(monthTotal)} icon={CalendarDays} tone="neutral" sub="חודש נוכחי" />
        <KpiCard label="ספקים פעילים" value={String(bySupplier.length)} icon={Truck} tone="neutral" sub="עם חשבונית מאושרת" />
        <KpiCard label="חשבוניות" value={String(exp.length)} icon={Receipt} tone="neutral" sub="מאושרות במערכת" />
      </div>

      {exp.length === 0 ? (
        <Widget title="אין עדיין נתונים">
          <div className="text-sm text-paseo-muted py-8 text-center leading-relaxed">
            עדיין אין חשבוניות מאושרות. <br />
            שלח חשבונית לבוט בוואטסאפ ואשר אותה (שלח "אישור") — היא תופיע כאן אוטומטית עם גרפים.
          </div>
        </Widget>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Widget title="הוצאה לפי ספק (טופ 10)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierBars} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: chartTheme.axis, fontSize: 10 }} tickFormatter={(v) => shekelShort(v)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: chartTheme.axis, fontSize: 11 }}
                    width={110}
                    orientation="right"
                  />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="הוצאה" fill={chartTheme.gold} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Widget>

          <Widget title="מגמת הוצאות חודשית">
            {byMonth.length >= 2 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={byMonth} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="expg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartTheme.blue} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={chartTheme.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: chartTheme.axis, fontSize: 10 }} reversed />
                    <YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} tickFormatter={(v) => shekelShort(v)} width={48} orientation="right" />
                    <Tooltip content={<MoneyTooltip />} />
                    <Area type="monotone" dataKey="הוצאה" stroke={chartTheme.blue} strokeWidth={2} fill="url(#expg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-paseo-muted py-12 text-center">צריך לפחות חודשיים של נתונים לגרף מגמה</div>
            )}
          </Widget>

          <Widget title="פירוט ספקים" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-paseo-muted text-xs border-b border-paseo-border">
                    <th className="text-right font-medium py-2">ספק</th>
                    <th className="text-right font-medium py-2">חשבוניות</th>
                    <th className="text-right font-medium py-2">סה״כ הוצאה</th>
                    <th className="text-right font-medium py-2">% מסך הכל</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplier.map((s) => (
                    <tr key={s.name} className="border-b border-paseo-border/50">
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2 text-paseo-muted">{s.count}</td>
                      <td className="py-2 font-bold text-paseo-gold">{shekel(s.total)}</td>
                      <td className="py-2 text-paseo-muted">{total ? Math.round((s.total / total) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>

          <Widget title="חשבוניות אחרונות" className="lg:col-span-2">
            <div className="space-y-1.5">
              {recent.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-paseo-border/40 pb-1.5">
                  <span className="font-medium">{e.supplierName}</span>
                  <span className="text-paseo-muted text-xs">
                    {e.invoiceRef ? `#${e.invoiceRef} · ` : ''}
                    {e.date}
                  </span>
                  <span className="font-bold tabular-nums">{shekel(e.total)}</span>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      )}
    </div>
  )
}
