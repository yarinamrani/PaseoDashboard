import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { AddButton } from '../components/AddButton'
import { Modal } from '../components/Modal'
import { SalesForm } from '../components/forms/SalesForm'
import { usePaseo } from '../data/DataContext'
import {
  weekRevenue,
  monthRevenue,
  weekAvgPerDiner,
  paymentBreakdown,
  MONTHLY_TARGET,
} from '../lib/metrics'
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
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const mRev = monthRevenue(d)
  const pay = paymentBreakdown(d)
  const targetPct = MONTHLY_TARGET ? (mRev / MONTHLY_TARGET) * 100 : 0
  // 30 הימים האחרונים, מהחדש לישן
  const rows = d.sales
    .filter((s) => daysSince(s.date) <= 30)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <PageHeader
        title="מכירות"
        subtitle="סיכום מכירות יומי · שבועי · חודשי"
        action={<AddButton label="סיכום יומי" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="סיכום מכירות יומי" onClose={() => setAdding(false)}>
        <SalesForm onClose={() => setAdding(false)} />
      </Modal>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Widget title="מחזור חודשי">
          <Stat value={shekel(mRev)} label="החודש" tone="text-paseo-gold" />
        </Widget>
        <Widget title="מחזור שבועי">
          <Stat value={shekel(weekRevenue(d))} label="השבוע" tone="text-paseo-text" />
        </Widget>
        <Widget title="ממוצע לסועד">
          <Stat value={shekel(weekAvgPerDiner(d))} label="השבוע" tone="text-paseo-blue" />
        </Widget>
      </div>

      {/* יעד מחזור חודשי — בסגנון Alfred */}
      <div className="mb-6">
        <Widget title="יעד חודשי">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-paseo-muted">
              {shekel(mRev)} מתוך {shekel(MONTHLY_TARGET)}
            </span>
            <span className="font-bold text-paseo-gold">{targetPct.toFixed(0)}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-paseo-gold transition-all"
              style={{ width: `${Math.min(100, targetPct)}%` }}
            />
          </div>
        </Widget>
      </div>

      {/* פילוח אמצעי תשלום — מדוח ה-Z */}
      {pay.length > 0 && (
        <div className="mb-6">
          <Widget title="פילוח אמצעי תשלום">
            <div className="space-y-3">
              {pay.map((p) => (
                <div key={p.method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-paseo-text">{p.label}</span>
                    <span className="text-paseo-muted">
                      {shekel(p.amount)} · {p.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-paseo-gold"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      )}

      <Widget title="סיכום מכירות יומי — 30 ימים אחרונים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
