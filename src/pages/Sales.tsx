import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { paseoData } from '../data/mockData'
import { weekRevenue, monthRevenue, weekAvgPerDiner } from '../lib/metrics'
import { shekel, num } from '../lib/format'
import { formatDate, daysSince } from '../lib/dates'
import type { SalesRecord } from '../types'

const columns: Column<SalesRecord>[] = [
  { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  { key: 'revenue', header: 'מחזור', render: (r) => <span className="font-bold text-paseo-gold">{shekel(r.revenue)}</span> },
  { key: 'diners', header: 'סועדים', render: (r) => num(r.diners) },
  { key: 'avgPerDiner', header: 'ממוצע לסועד', render: (r) => shekel(r.avgPerDiner) },
  { key: 'avgTable', header: 'ממוצע שולחן', render: (r) => shekel(r.avgTable) },
  { key: 'notes', header: 'הערות', render: (r) => <span className="text-paseo-muted">{r.notes ?? '—'}</span> },
]

export function Sales() {
  const d = paseoData
  // 30 הימים האחרונים, מהחדש לישן
  const rows = d.sales
    .filter((s) => daysSince(s.date) <= 30)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <PageHeader title="מכירות" subtitle="סיכום מכירות יומי · שבועי · חודשי" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Widget title="מחזור חודשי">
          <Stat value={shekel(monthRevenue(d))} label="החודש" tone="text-paseo-gold" />
        </Widget>
        <Widget title="מחזור שבועי">
          <Stat value={shekel(weekRevenue(d))} label="השבוע" tone="text-paseo-text" />
        </Widget>
        <Widget title="ממוצע לסועד">
          <Stat value={shekel(weekAvgPerDiner(d))} label="השבוע" tone="text-paseo-blue" />
        </Widget>
      </div>

      <Widget title="סיכום מכירות יומי — 30 ימים אחרונים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
