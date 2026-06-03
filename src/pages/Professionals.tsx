import { useState } from 'react'
import { Pencil, Phone, MessageCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { AddButton } from '../components/AddButton'
import { Modal } from '../components/Modal'
import { ProfessionalForm } from '../components/forms/ProfessionalForm'
import { usePaseo } from '../data/DataContext'
import type { Professional } from '../types'

function waLink(phone: string) {
  const p = phone.replace(/[^0-9]/g, '')
  const full = p.startsWith('972') ? p : '972' + p.replace(/^0/, '')
  return `https://wa.me/${full}`
}

const iconBtn =
  'inline-flex items-center justify-center rounded-lg p-1.5 text-paseo-muted hover:bg-white/5 transition-colors'

export function Professionals() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Professional | null>(null)

  const columns: Column<Professional>[] = [
    { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'profession', header: 'תחום', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.profession}</span> },
    { key: 'phone', header: 'טלפון', render: (r) => <span dir="ltr" className="text-paseo-muted">{r.phone || '—'}</span> },
    { key: 'notes', header: 'הערות', render: (r) => <span className="text-paseo-muted">{r.notes ?? '—'}</span> },
    {
      key: 'actions',
      header: 'פעולות',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          {r.phone && (
            <>
              <a href={`tel:${r.phone}`} className={`${iconBtn} hover:text-paseo-green`} title="חיוג">
                <Phone size={15} />
              </a>
              <a href={waLink(r.phone)} target="_blank" rel="noreferrer" className={`${iconBtn} hover:text-paseo-green`} title="וואטסאפ">
                <MessageCircle size={15} />
              </a>
            </>
          )}
          <button onClick={() => setEditing(r)} className={`${iconBtn} hover:text-paseo-gold`} title="עריכה / מחיקה">
            <Pencil size={15} />
          </button>
        </div>
      ),
    },
  ]

  const rows = [...d.professionals].sort((a, b) => a.name.localeCompare(b.name, 'he'))

  return (
    <div>
      <PageHeader
        title="אנשי מקצוע"
        subtitle={`${d.professionals.length} אנשי מקצוע · חיוג/וואטסאפ בלחיצה · שייכו לתקלות`}
        action={<AddButton label="איש מקצוע חדש" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="איש מקצוע חדש" onClose={() => setAdding(false)}>
        <ProfessionalForm onClose={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} title="עריכת איש מקצוע" onClose={() => setEditing(null)}>
        {editing && <ProfessionalForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <Widget title="רשימת אנשי מקצוע">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="אין אנשי מקצוע עדיין — הוסף את החשמלאי / אינסטלטור / טכנאי המזגנים שלך"
        />
      </Widget>
    </div>
  )
}
