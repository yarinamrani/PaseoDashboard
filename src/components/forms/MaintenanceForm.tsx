import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createMaintenance } from '../../data/repository'
import { MAINTENANCE_AREAS, type MaintenanceArea, type MaintenanceStatus } from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })
const STATUSES: MaintenanceStatus[] = ['פתוח', 'בטיפול', 'סגור']

export function MaintenanceForm({ onClose }: { onClose: () => void }) {
  const [issue, setIssue] = useState('')
  const [area, setArea] = useState<MaintenanceArea>('מטבח')
  const [openedDate, setOpenedDate] = useState(todayStr)
  const [owner, setOwner] = useState('')
  const [cost, setCost] = useState('')
  const [status, setStatus] = useState<MaintenanceStatus>('פתוח')

  async function submit() {
    await createMaintenance({
      issue: issue.trim(),
      area,
      openedDate,
      owner: owner.trim(),
      cost: Number(cost) || 0,
      status,
    })
  }

  return (
    <FormShell submitLabel="הוסף תקלה" onClose={onClose} onSubmit={submit}>
      <Field label="תקלה">
        <TextInput value={issue} onChange={(e) => setIssue(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אזור">
          <Select value={area} onChange={(e) => setArea(e.target.value as MaintenanceArea)}>
            {MAINTENANCE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="נפתח">
          <TextInput
            type="date"
            value={openedDate}
            onChange={(e) => setOpenedDate(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אחראי">
          <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label="עלות (₪)">
          <TextInput type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
      <Field label="סטטוס">
        <Select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
    </FormShell>
  )
}
