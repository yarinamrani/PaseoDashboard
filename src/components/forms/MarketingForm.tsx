import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createMarketing, updateMarketing, deleteMarketing } from '../../data/repository'
import {
  CONTENT_TYPES,
  SPONSORED_TYPES,
  MARKETING_STATUSES,
  type MarketingTask,
  type MarketingKind,
  type MarketingType,
  type MarketingStatus,
} from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })

export function MarketingForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: MarketingTask
}) {
  const editing = !!initial
  const [task, setTask] = useState(initial?.task ?? '')
  const [kind, setKind] = useState<MarketingKind>(initial?.kind ?? 'תוכן')
  const [type, setType] = useState<MarketingType>(initial?.type ?? CONTENT_TYPES[0])
  const [publishDate, setPublishDate] = useState(initial?.publishDate || todayStr)
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '')
  const [status, setStatus] = useState<MarketingStatus>(initial?.status ?? 'מתוכנן')

  const types = kind === 'ממומן' ? SPONSORED_TYPES : CONTENT_TYPES

  function changeKind(k: MarketingKind) {
    setKind(k)
    const list = k === 'ממומן' ? SPONSORED_TYPES : CONTENT_TYPES
    if (!list.includes(type)) setType(list[0])
  }

  async function submit() {
    const payload = { task: task.trim(), kind, type, publishDate, budget: Number(budget) || 0, status }
    if (editing) await updateMarketing(initial!.id, payload)
    else await createMarketing(payload)
  }

  return (
    <FormShell
      submitLabel={editing ? 'שמור שינויים' : 'הוסף פעילות'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={editing ? () => deleteMarketing(initial!.id) : undefined}
    >
      <Field label="משימה">
        <TextInput value={task} onChange={(e) => setTask(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="קטגוריה">
          <Select value={kind} onChange={(e) => changeKind(e.target.value as MarketingKind)}>
            <option value="תוכן">תוכן</option>
            <option value="ממומן">ממומן</option>
          </Select>
        </Field>
        <Field label="סוג">
          <Select value={type} onChange={(e) => setType(e.target.value as MarketingType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך פרסום">
          <TextInput type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
        </Field>
        <Field label="תקציב (₪)">
          <TextInput type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
      </div>
      <Field label="סטטוס">
        <Select value={status} onChange={(e) => setStatus(e.target.value as MarketingStatus)}>
          {MARKETING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
    </FormShell>
  )
}
