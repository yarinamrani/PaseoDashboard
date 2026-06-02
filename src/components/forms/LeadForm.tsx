import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createEvent } from '../../data/repository'
import { EVENT_STATUSES, type EventStatus } from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })

export function LeadForm({ onClose }: { onClose: () => void }) {
  const [customer, setCustomer] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('')
  const [guests, setGuests] = useState('')
  const [date, setDate] = useState(todayStr)
  const [status, setStatus] = useState<EventStatus>('ליד חדש')
  const [owner, setOwner] = useState('')
  const [value, setValue] = useState('')

  async function submit() {
    await createEvent({
      customer: customer.trim(),
      phone: phone.trim(),
      eventType: eventType.trim(),
      guests: Number(guests) || 0,
      date,
      status,
      owner: owner.trim(),
      value: value ? Number(value) : undefined,
    })
  }

  return (
    <FormShell submitLabel="הוסף ליד" onClose={onClose} onSubmit={submit}>
      <Field label="לקוח">
        <TextInput value={customer} onChange={(e) => setCustomer(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
        </Field>
        <Field label="סוג אירוע">
          <TextInput value={eventType} onChange={(e) => setEventType(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אורחים">
          <TextInput type="number" min="0" value={guests} onChange={(e) => setGuests(e.target.value)} />
        </Field>
        <Field label="תאריך אירוע">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="סטטוס">
          <Select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="אחראי">
          <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
      </div>
      <Field label="שווי משוער (₪)">
        <TextInput type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="אופציונלי" />
      </Field>
    </FormShell>
  )
}
