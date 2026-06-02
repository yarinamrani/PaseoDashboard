import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createSales } from '../../data/repository'
import { Field, TextInput, Textarea } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })

export function SalesForm({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayStr)
  const [revenue, setRevenue] = useState('')
  const [diners, setDiners] = useState('')
  const [notes, setNotes] = useState('')

  async function submit() {
    const rev = Number(revenue)
    const din = Number(diners)
    const tables = Math.max(1, Math.round(din / 3.2))
    await createSales({
      date,
      revenue: rev,
      diners: din,
      avgPerDiner: din ? Math.round(rev / din) : 0,
      avgTable: Math.round(rev / tables),
      notes: notes.trim() || undefined,
    })
  }

  return (
    <FormShell submitLabel="הוסף סיכום" onClose={onClose} onSubmit={submit}>
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
