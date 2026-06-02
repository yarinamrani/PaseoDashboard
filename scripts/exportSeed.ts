// יוצר קובץ SQL לזריעת נתוני הדמה לתוך Supabase.
// הרצה: npx tsx scripts/exportSeed.ts  ->  scripts/seed.sql
import { writeFileSync } from 'fs'
import { paseoData } from '../src/data/mockData'

type Val = string | number | boolean | null | undefined

const sql = (v: Val): string => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${v.replace(/'/g, "''")}'`
}

const insert = (table: string, cols: string[], rows: Val[][]): string => {
  const values = rows.map((r) => `  (${r.map(sql).join(', ')})`).join(',\n')
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n${values};\n`
}

const d = paseoData
const parts: string[] = ['BEGIN;', '']

// מנקים קודם כדי שהזריעה תהיה idempotent
const tables = ['sales', 'events', 'marketing', 'reviews', 'maintenance', 'employees', 'suppliers']
parts.push(`TRUNCATE ${tables.join(', ')};`, '')

parts.push(
  insert(
    'sales',
    ['id', 'date', 'revenue', 'diners', 'avg_per_diner', 'avg_table', 'notes'],
    d.sales.map((s) => [s.id, s.date, s.revenue, s.diners, s.avgPerDiner, s.avgTable, s.notes ?? null]),
  ),
)

parts.push(
  insert(
    'events',
    ['id', 'customer', 'phone', 'event_type', 'guests', 'date', 'status', 'owner', 'created_at', 'value'],
    d.events.map((e) => [e.id, e.customer, e.phone, e.eventType, e.guests, e.date, e.status, e.owner, e.createdAt, e.value ?? null]),
  ),
)

parts.push(
  insert(
    'marketing',
    ['id', 'task', 'kind', 'type', 'publish_date', 'budget', 'status', 'leads_from_ad'],
    d.marketing.map((m) => [m.id, m.task, m.kind, m.type, m.publishDate, m.budget, m.status, m.leadsFromAd ?? null]),
  ),
)

parts.push(
  insert(
    'reviews',
    ['id', 'date', 'platform', 'rating', 'handled', 'owner', 'text'],
    d.reviews.map((r) => [r.id, r.date, r.platform, r.rating, r.handled, r.owner, r.text ?? null]),
  ),
)

parts.push(
  insert(
    'maintenance',
    ['id', 'issue', 'area', 'opened_date', 'owner', 'cost', 'status'],
    d.maintenance.map((t) => [t.id, t.issue, t.area, t.openedDate, t.owner, t.cost, t.status]),
  ),
)

parts.push(
  insert(
    'employees',
    ['id', 'name', 'role', 'start_date', 'status'],
    d.employees.map((w) => [w.id, w.name, w.role, w.startDate, w.status]),
  ),
)

parts.push(
  insert(
    'suppliers',
    ['id', 'supplier', 'domain', 'contact', 'phone', 'delivery_days'],
    d.suppliers.map((p) => [p.id, p.supplier, p.domain, p.contact, p.phone, p.deliveryDays]),
  ),
)

parts.push('COMMIT;')

writeFileSync('scripts/seed.sql', parts.join('\n'))
console.log('wrote scripts/seed.sql')
