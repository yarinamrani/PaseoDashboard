import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { AddButton } from '../components/AddButton'
import { Modal } from '../components/Modal'
import { SalesForm } from '../components/forms/SalesForm'
import { usePaseo } from '../data/DataContext'
import { weekRevenue, monthRevenue, weekAvgPerDiner } from '../lib/metrics'
import { shekel, num } from '../lib/format'
import { formatDate, daysSince } from '../lib/dates'
import type { SalesRecord, Cancellations } from '../types'

const CANCEL_LABELS: { key: keyof Cancellations; label: string }[] = [
  { key: 'cancelOrder', label: 'ביטולי הזמנה' },
  { key: 'cancelItem', label: 'ביטולי פריט' },
  { key: 'itemDiscount', label: 'הנחות' },
  { key: 'itemPriceChange', label: 'שינויי מחיר' },
  { key: 'other', label: 'אחר' },
]
const cancelTotal = (c?: Cancellations) =>
  c ? c.cancelOrder + c.cancelItem + c.itemDiscount + c.itemPriceChange + c.other : 0

export function Sales() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  // הרשומה שנמצאת בעריכה כרגע (null = אין). פותח את אותו טופס במצב עריכה/מחיקה.
  const [editing, setEditing] = useState<SalesRecord | null>(null)

  const columns: Column<SalesRecord>[] = [
    { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
    { key: 'revenue', header: 'מחזור', render: (r) => <span className="font-bold text-paseo-gold">{shekel(r.revenue)}</span> },
    { key: 'diners', header: 'סועדים', render: (r) => num(r.diners) },
    { key: 'avgPerDiner', header: 'ממוצע לסועד', render: (r) => shekel(r.avgPerDiner) },
    { key: 'avgTable', header: 'ממוצע שולחן', render: (r) => shekel(r.avgTable) },
    {
      key: 'cancellations',
      header: 'ביטולים/הנחות',
      render: (r) => {
        const t = cancelTotal(r.cancellations)
        if (!t) return <span className="text-paseo-muted">—</span>
        const ratio = r.revenue ? t / r.revenue : 0
        const tip = CANCEL_LABELS.filter((l) => r.cancellations![l.key] > 0)
          .map((l) => `${l.label}: ${shekel(r.cancellations![l.key])}`)
          .join(' · ')
        return (
          <span className={`tabular-nums ${ratio >= 0.05 ? 'text-paseo-red font-bold' : 'text-paseo-amber'}`} title={tip}>
            {shekel(t)}
          </span>
        )
      },
    },
    { key: 'notes', header: 'הערות', render: (r) => <span className="text-paseo-muted">{r.notes ?? '—'}</span> },
    {
      key: 'actions',
      header: 'עריכה',
      align: 'center',
      render: (r) => (
        <button
          onClick={() => setEditing(r)}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-paseo-muted hover:text-paseo-gold hover:bg-white/5 transition-colors"
          aria-label="עריכת סיכום"
          title="עריכה / מחיקה"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  // 30 הימים האחרונים, מהחדש לישן
  const rows = d.sales
    .filter((s) => daysSince(s.date) <= 30)
    .sort((a, b) => b.date.localeCompare(a.date))

  // בקרה: סך הביטולים/הנחות ב-30 הימים, ואחוז מהמחזור
  const cancelSum = rows.reduce((a, r) => a + cancelTotal(r.cancellations), 0)
  const revSum = rows.reduce((a, r) => a + r.revenue, 0)
  const cancelPct = revSum ? (cancelSum / revSum) * 100 : 0
  const hasCancel = rows.some((r) => r.cancellations)

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

      <Modal open={!!editing} title="עריכת סיכום יומי" onClose={() => setEditing(null)}>
        {editing && <SalesForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <div className={`grid grid-cols-2 gap-4 mb-6 ${hasCancel ? 'md:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <Widget title="מחזור חודשי">
          <Stat value={shekel(monthRevenue(d))} label="החודש" tone="text-paseo-gold" />
        </Widget>
        <Widget title="מחזור שבועי">
          <Stat value={shekel(weekRevenue(d))} label="השבוע" tone="text-paseo-text" />
        </Widget>
        <Widget title="ממוצע לסועד">
          <Stat value={shekel(weekAvgPerDiner(d))} label="השבוע" tone="text-paseo-blue" />
        </Widget>
        {hasCancel && (
          <Widget title="ביטולים והנחות">
            <Stat
              value={shekel(cancelSum)}
              label={`${cancelPct.toFixed(1)}% מהמחזור · 30 ימים`}
              tone={cancelPct >= 5 ? 'text-paseo-red' : 'text-paseo-amber'}
            />
          </Widget>
        )}
      </div>

      <Widget title="סיכום מכירות יומי — 30 ימים אחרונים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
