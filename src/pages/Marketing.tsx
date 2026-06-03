import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { AddButton } from '../components/AddButton'
import { Modal } from '../components/Modal'
import { MarketingForm } from '../components/forms/MarketingForm'
import { usePaseo } from '../data/DataContext'
import { formatDate } from '../lib/dates'
import { shekel } from '../lib/format'
import type { MarketingTask } from '../types'

export function Marketing() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MarketingTask | null>(null)

  const columns: Column<MarketingTask>[] = [
    { key: 'task', header: 'משימה', render: (r) => <span className="font-medium">{r.task}</span> },
    {
      key: 'kind',
      header: 'קטגוריה',
      render: (r) => (
        <span className={`text-xs px-2 py-0.5 rounded ${r.kind === 'ממומן' ? 'bg-paseo-gold/15 text-paseo-gold' : 'bg-paseo-blue/15 text-paseo-blue'}`}>
          {r.kind}
        </span>
      ),
    },
    { key: 'type', header: 'סוג', render: (r) => r.type },
    { key: 'publishDate', header: 'תאריך פרסום', render: (r) => formatDate(r.publishDate) },
    { key: 'budget', header: 'תקציב', render: (r) => (r.budget ? shekel(r.budget) : '—') },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'עריכה',
      align: 'center',
      render: (r) => (
        <button
          onClick={() => setEditing(r)}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-paseo-muted hover:text-paseo-gold hover:bg-white/5 transition-colors"
          title="עריכה / מחיקה"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  const rows = [...d.marketing].sort((a, b) => b.publishDate.localeCompare(a.publishDate))

  return (
    <div>
      <PageHeader
        title="שיווק"
        subtitle="תוכן וממומן — הזנה ידנית"
        action={<AddButton label="פעילות חדשה" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="פעילות שיווקית חדשה" onClose={() => setAdding(false)}>
        <MarketingForm onClose={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} title="עריכת פעילות" onClose={() => setEditing(null)}>
        {editing && <MarketingForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <Widget title="כל הפעילות השיווקית">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="אין פעילות עדיין — הוסף פוסט שקיעה / רילס / קמפיין"
        />
      </Widget>
    </div>
  )
}
