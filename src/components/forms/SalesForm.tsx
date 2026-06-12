import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createSales, updateSales, deleteSales } from '../../data/repository'
import type { SalesRecord } from '../../types'
import { Field, TextInput, Textarea } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })

// טופס אחד להוספה ולעריכה: אם מועבר `initial` — מצב עריכה (עם מחיקה).
export function SalesForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: SalesRecord
}) {
  const editing = !!initial
  const [date, setDate] = useState(initial?.date ?? todayStr)
  const [revenue, setRevenue] = useState(initial != null ? String(initial.revenue) : '')
  const [diners, setDiners] = useState(initial != null ? String(initial.diners) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  async function submit() {
    const rev = Number(revenue)
    const din = Number(diners)
    const tables = Math.max(1, Math.round(din / 3.2))
    const payload = {
      date,
      revenue: rev,
      diners: din,
      avgPerDiner: din ? Math.round(rev / din) : 0,
      avgTable: Math.round(rev / tables),
      notes: notes.trim() || undefined,
    }
    if (editing) {
      await updateSales(initial!.id, payload)
    } else {
      await createSales(payload)
    }
  }

  return (
    <FormShell
      submitLabel={editing ? 'שמור שינויים' : 'הוסף סיכום'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={editing ? () => deleteSales(initial!.id) : undefined}
    >
      <Field label="תאריך">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מחזור (₪)">
          <TextInput
            type="number"
            min="0"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            required
          />
        </Field>
        <Field label="סועדים">
          <TextInput
            type="number"
            min="0"
            value={diners}
            onChange={(e) => setDiners(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field label="הערות">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="אופציונלי" />
      </Field>
      <p className="text-[11px] text-paseo-muted">ממוצע לסועד וממוצע שולחן יחושבו אוטומטית.</p>
    </FormShell>
  )
}
