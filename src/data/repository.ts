import { supabase, isSupabaseConfigured } from './supabaseClient'
import { paseoData } from './mockData'
import { dayKey, weekKey } from '../lib/dates'
import type {
  PaseoData,
  SalesRecord,
  EventLead,
  EventStatus,
  Employee,
  EmployeeStatus,
  MaintenanceIssue,
  Supplier,
  Review,
  Professional,
  Reservation,
  PayrollEntry,
  Task,
  TaskFrequency,
  MarketingTask,
  MarketingKind,
  MarketingType,
  MarketingStatus,
} from '../types'

export type DataSource = 'supabase' | 'mock'

export interface LoadResult {
  data: PaseoData
  source: DataSource
  error?: string
}

/** נזרק כשמנסים לשמור ואין חיבור פעיל ל-Supabase (מצב דמה). */
export class NoConnectionError extends Error {
  constructor() {
    super('אין חיבור פעיל ל-Supabase — לא ניתן לשמור נתונים במצב דמה')
    this.name = 'NoConnectionError'
  }
}

export const canWrite = isSupabaseConfigured

function client() {
  if (!supabase) throw new NoConnectionError()
  return supabase
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`

// --- ממירים שורות snake_case מ-Supabase לטיפוסי הדומיין (camelCase) ---
/* eslint-disable @typescript-eslint/no-explicit-any */
const mapSales = (r: any): SalesRecord => ({
  id: r.id,
  date: r.date,
  revenue: r.revenue,
  diners: r.diners,
  avgPerDiner: r.avg_per_diner,
  avgTable: r.avg_table,
  notes: r.notes ?? undefined,
  payments: r.payments ?? undefined,
})

// תרגום סטטוס ה-CRM (אנגלית) לסטטוס הדשבורד (עברית)
const CRM_STATUS: Record<string, EventStatus> = {
  new: 'ליד חדש',
  contacted: 'שיחה בוצעה',
  followup: 'שיחה בוצעה',
  meeting: 'פגישה',
  offer_sent: 'הצעה נשלחה',
  negotiation: 'משא ומתן',
  won: 'נסגר',
  lost: 'אבוד',
}

// מנרמל ערך תאריך (date / timestamp / ריק) למחרוזת ISO של יום (YYYY-MM-DD)
function isoDay(v: unknown): string {
  if (typeof v !== 'string' || !v) return ''
  const m = v.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

const numOr = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// ממפה שורת crm_leads (מערכת ה-CRM החיה) לטיפוס EventLead של הדשבורד
const mapCrmLead = (r: any): EventLead => ({
  id: String(r.id),
  customer: r.full_name || '(ליד ללא שם)',
  phone: r.phone || '',
  eventType: r.event_type || '',
  guests: numOr(r.guests_max ?? r.guests_min, 0),
  date: isoDay(r.event_date) || isoDay(r.event_date_raw),
  status: CRM_STATUS[String(r.status)] ?? 'ליד חדש',
  owner: r.assigned_to || r.hostess || '',
  createdAt: r.received_at || r.updated_at || new Date().toISOString(),
  value: r.price_quoted != null ? numOr(r.price_quoted) : undefined,
})

// ספקים אמיתיים מטבלת suppliers — תרגום קטגוריה וימי אספקה לעברית
const SUPPLIER_CAT: Record<string, string> = {
  food: 'מזון',
  logistics: 'לוגיסטיקה',
  alcohol: 'אלכוהול',
  beverages: 'משקאות',
  cleaning: 'ניקיון',
  packaging: 'אריזות',
  equipment: 'ציוד',
  services: 'שירותים',
}
const DAY_HE: Record<string, string> = {
  sun: 'א׳', mon: 'ב׳', tue: 'ג׳', wed: 'ד׳', thu: 'ה׳', fri: 'ו׳', sat: 'ש׳',
}
const heDays = (v: unknown): string =>
  Array.isArray(v) && v.length ? v.map((x: string) => DAY_HE[x] ?? x).join(', ') : ''

const mapSupplier = (r: any): Supplier => ({
  id: String(r.id),
  supplier: r.name || r.name_full || '(ספק)',
  domain: SUPPLIER_CAT[String(r.category)] ?? (r.category || '—'),
  contact: r.contact_name || '',
  phone: r.phone || '',
  deliveryDays: heDays(r.delivery_days) || heDays(r.order_days) || '—',
})

// ביקורת אמיתית מטבלת dash_reviews (כרגע Google; בעתיד גם OnTopo)
const mapReview = (r: any): Review => ({
  id: String(r.id),
  date: isoDay(r.date) || isoDay(r.created_at),
  platform: (r.platform as Review['platform']) || 'Google',
  rating: numOr(r.rating, 0),
  handled: !!r.handled,
  owner: r.owner || '',
  author: r.author ?? undefined,
  text: r.text ?? undefined,
})

const mapMarketing = (r: any): MarketingTask => ({
  id: String(r.id),
  task: r.task || '',
  kind: (r.kind as MarketingKind) || 'תוכן',
  type: (r.type as MarketingType) || 'פוסט שקיעה',
  publishDate: isoDay(r.publish_date),
  budget: numOr(r.budget, 0),
  status: (r.status as MarketingStatus) || 'מתוכנן',
})

const mapEmployee = (r: any): Employee => ({
  id: String(r.id),
  name: r.name || '',
  role: r.role || '',
  department: r.department || undefined,
  venue: r.venue || undefined,
  startDate: isoDay(r.start_date),
  status: (r.status as EmployeeStatus) || 'פעיל',
  hourlyRate: r.hourly_rate != null ? Number(r.hourly_rate) : undefined,
})

const mapTask = (r: any): Task => ({
  id: String(r.id),
  title: r.title || '',
  category: r.category || '',
  frequency: (r.frequency as TaskFrequency) || 'daily',
  role: r.role || 'כללי',
  sort: numOr(r.sort, 0),
})

const mapPayroll = (r: any): PayrollEntry => ({
  employeeId: String(r.employee_id),
  name: r.name || '',
  month: r.month || '',
  hours: numOr(r.hours, 0),
})

const mapReservation = (r: any): Reservation => ({
  id: String(r.id),
  date: isoDay(r.date),
  time: r.time || '',
  name: r.name || '',
  phone: r.phone || '',
  size: numOr(r.size, 0),
  status: r.status || '',
})

const mapProfessional = (r: any): Professional => ({
  id: String(r.id),
  name: r.name || '',
  profession: r.profession || '',
  phone: r.phone || '',
  notes: r.notes ?? undefined,
})

const mapMaintenance = (r: any): MaintenanceIssue => ({
  id: r.id,
  issue: r.issue,
  area: r.area,
  openedDate: r.opened_date,
  owner: r.owner,
  cost: r.cost,
  status: r.status,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * טוען את כל נתוני הדשבורד. מנסה קודם מ-Supabase; אם אין חיבור או שיש שגיאה,
 * נופל חזרה לנתוני הדמה כדי שהדשבורד תמיד יוצג.
 */
// אם Supabase לא מגיב תוך הזמן הזה — נופלים חזרה ל-Mock כדי שהדשבורד לא ייתקע
const LOAD_TIMEOUT_MS = 6000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ])
}

export async function loadPaseoData(demo = false): Promise<LoadResult> {
  if (demo || !isSupabaseConfigured || !supabase) {
    return { data: paseoData, source: 'mock' }
  }

  try {
    // קוראים רק את הטבלאות שיש להן מקור אמיתי בפרויקט:
    // אירועים מ-crm_leads (ה-CRM החי), מכירות/תחזוקה מטבלאות dash_.
    const [events, sales, maintenance, suppliers, reviews, meta, professionals, reservations, marketing, employees, payroll, tasks, taskLog] =
      await withTimeout(
        Promise.all([
          supabase.from('crm_leads').select('*'),
          supabase.from('dash_sales').select('*').order('date', { ascending: true }),
          supabase.from('dash_maintenance').select('*'),
          supabase.from('suppliers').select('*').eq('active', true),
          supabase.from('dash_reviews').select('*').order('date', { ascending: false }),
          supabase.from('dash_meta').select('key,value'),
          supabase.from('dash_professionals').select('*').eq('active', true),
          supabase.from('dash_reservations').select('*').order('time', { ascending: true }),
          supabase.from('dash_marketing').select('*').order('publish_date', { ascending: false }),
          supabase.from('dash_employees').select('*'),
          supabase.from('dash_payroll').select('*'),
          supabase.from('dash_tasks').select('*').eq('active', true).order('sort'),
          supabase.from('dash_task_log').select('id').eq('done', true).in('period_key', [dayKey(), weekKey()]),
        ]),
        LOAD_TIMEOUT_MS,
      )

    // דירוג גוגל האמיתי מטבלת המטא (4.3 / 665), לא ממוצע 5 הביקורות
    const metaMap: Record<string, string> = {}
    for (const m of meta.data ?? []) metaMap[m.key] = m.value
    const gRating = metaMap.google_rating ? Number(metaMap.google_rating) : undefined
    const gCount = metaMap.google_review_count ? Number(metaMap.google_review_count) : undefined

    // crm_leads הוא המקור הקריטי; אם הוא נכשל — נפילה מלאה ל-Mock
    if (events.error) throw events.error

    return {
      source: 'supabase',
      data: {
        // לידים אמיתיים מ-crm_leads — מסננים לידים שסומנו כלא רלוונטיים (ספאם)
        events: (events.data ?? [])
          .filter((r: any) => r.relevance !== 'irrelevant')
          .map(mapCrmLead),
        // כל המקורות אמיתיים — ללא נפילה לנתוני דמה (ריק אם יש שגיאה זמנית)
        sales: sales.error ? [] : (sales.data ?? []).map(mapSales),
        maintenance: maintenance.error ? [] : (maintenance.data ?? []).map(mapMaintenance),
        suppliers: suppliers.error ? [] : (suppliers.data ?? []).map(mapSupplier),
        marketing: marketing.error ? [] : (marketing.data ?? []).map(mapMarketing),
        reviews: reviews.error ? [] : (reviews.data ?? []).map(mapReview),
        // עובדים — לוח ידני אמיתי (dash_employees); ריק עד שתוסיף
        employees: employees.error ? [] : (employees.data ?? []).map(mapEmployee),
        professionals: professionals.error
          ? []
          : (professionals.data ?? []).map(mapProfessional),
        reservations: reservations.error
          ? []
          : (reservations.data ?? []).map(mapReservation),
        payroll: payroll.error ? [] : (payroll.data ?? []).map(mapPayroll),
        tasks: tasks.error ? [] : (tasks.data ?? []).map(mapTask),
        taskDone: taskLog.error ? [] : (taskLog.data ?? []).map((r: any) => String(r.id)),
        googleRating: gRating,
        googleReviewCount: gCount,
      },
    }
  } catch (e) {
    console.warn('[Paseo] נפילה חזרה לנתוני דמה — שגיאת Supabase:', e)
    return {
      data: paseoData,
      source: 'mock',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ============================================================================
// כתיבה — הוספה/עריכה של רשומות. דורש חיבור פעיל ל-Supabase.
// כל פונקציה זורקת NoConnectionError במצב דמה.
// ============================================================================

async function run<T extends { error: unknown }>(q: PromiseLike<T>): Promise<void> {
  const { error } = await q
  if (error) throw error instanceof Error ? error : new Error(String(error))
}

// --- מכירות: הוספת סיכום יומי ---
export type SalesInput = Omit<SalesRecord, 'id'>
export async function createSales(input: SalesInput): Promise<void> {
  await run(
    client()
      .from('dash_sales')
      .insert({
        id: newId('s'),
        date: input.date,
        revenue: input.revenue,
        diners: input.diners,
        avg_per_diner: input.avgPerDiner,
        avg_table: input.avgTable,
        notes: input.notes ?? null,
      }),
  )
}

export async function updateSales(id: string, input: SalesInput): Promise<void> {
  await run(
    client()
      .from('dash_sales')
      .update({
        date: input.date,
        revenue: input.revenue,
        diners: input.diners,
        avg_per_diner: input.avgPerDiner,
        avg_table: input.avgTable,
        notes: input.notes ?? null,
      })
      .eq('id', id),
  )
}

export async function deleteSales(id: string): Promise<void> {
  await run(client().from('dash_sales').delete().eq('id', id))
}

// --- ביקורות: סימון ביקורת כטופלה (לטיפול מול הלקוח) ---
export async function setReviewHandled(id: string, handled: boolean): Promise<void> {
  await run(client().from('dash_reviews').update({ handled }).eq('id', id))
}

// --- אירועים / לידים (כתיבה ל-crm_leads האמיתי) ---
// תרגום הפוך: סטטוס דשבורד (עברית) -> סטטוס CRM (אנגלית)
const STATUS_TO_CRM: Record<EventStatus, string> = {
  'ליד חדש': 'new',
  'שיחה בוצעה': 'contacted',
  פגישה: 'meeting',
  'הצעה נשלחה': 'offer_sent',
  'משא ומתן': 'negotiation',
  נסגר: 'won',
  אבוד: 'lost',
}

export type EventInput = Omit<EventLead, 'id' | 'createdAt'>
export async function createEvent(input: EventInput): Promise<void> {
  await run(
    client()
      .from('crm_leads')
      .insert({
        id: crypto.randomUUID(), // crm_leads.id הוא UUID
        source: 'paseo_form', // לפי מוסכמת המקורות של ה-CRM
        full_name: input.customer,
        phone: input.phone || null,
        event_type: input.eventType || null,
        event_date: input.date || null,
        guests_min: input.guests || null,
        guests_max: input.guests || null,
        status: STATUS_TO_CRM[input.status] ?? 'new',
        relevance: 'relevant',
        assigned_to: input.owner || null,
        price_quoted: input.value ?? null,
        raw_body: `נוצר ידנית מהדשבורד · ${input.customer}`,
        received_at: new Date().toISOString(),
      }),
  )
}

export async function updateEvent(id: string, patch: Partial<EventInput>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.customer !== undefined) row.full_name = patch.customer
  if (patch.phone !== undefined) row.phone = patch.phone
  if (patch.eventType !== undefined) row.event_type = patch.eventType
  if (patch.guests !== undefined) {
    row.guests_min = patch.guests
    row.guests_max = patch.guests
  }
  if (patch.date !== undefined) row.event_date = patch.date
  if (patch.status !== undefined) row.status = STATUS_TO_CRM[patch.status] ?? 'new'
  if (patch.owner !== undefined) row.assigned_to = patch.owner
  if (patch.value !== undefined) row.price_quoted = patch.value
  await run(client().from('crm_leads').update(row).eq('id', id))
}

// --- תחזוקה / תקלות ---
export type MaintenanceInput = Omit<MaintenanceIssue, 'id'>
export async function createMaintenance(input: MaintenanceInput): Promise<void> {
  await run(
    client()
      .from('dash_maintenance')
      .insert({
        id: newId('t'),
        issue: input.issue,
        area: input.area,
        opened_date: input.openedDate,
        owner: input.owner,
        cost: input.cost,
        status: input.status,
      }),
  )
}

export async function updateMaintenance(
  id: string,
  patch: Partial<MaintenanceInput>,
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.issue !== undefined) row.issue = patch.issue
  if (patch.area !== undefined) row.area = patch.area
  if (patch.openedDate !== undefined) row.opened_date = patch.openedDate
  if (patch.owner !== undefined) row.owner = patch.owner
  if (patch.cost !== undefined) row.cost = patch.cost
  if (patch.status !== undefined) row.status = patch.status
  await run(client().from('dash_maintenance').update(row).eq('id', id))
}

export async function deleteMaintenance(id: string): Promise<void> {
  await run(client().from('dash_maintenance').delete().eq('id', id))
}

// --- אנשי מקצוע ---
export type ProfessionalInput = Omit<Professional, 'id'>
export async function createProfessional(input: ProfessionalInput): Promise<void> {
  await run(
    client().from('dash_professionals').insert({
      id: newId('pro'),
      name: input.name,
      profession: input.profession,
      phone: input.phone,
      notes: input.notes ?? null,
      active: true,
    }),
  )
}
export async function updateProfessional(
  id: string,
  patch: Partial<ProfessionalInput>,
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.profession !== undefined) row.profession = patch.profession
  if (patch.phone !== undefined) row.phone = patch.phone
  if (patch.notes !== undefined) row.notes = patch.notes
  await run(client().from('dash_professionals').update(row).eq('id', id))
}
export async function deleteProfessional(id: string): Promise<void> {
  await run(client().from('dash_professionals').delete().eq('id', id))
}

// --- שיווק ---
export type MarketingInput = Omit<MarketingTask, 'id' | 'leadsFromAd'>
export async function createMarketing(input: MarketingInput): Promise<void> {
  await run(
    client().from('dash_marketing').insert({
      id: newId('mkt'),
      task: input.task,
      kind: input.kind,
      type: input.type,
      publish_date: input.publishDate || null,
      budget: input.budget || 0,
      status: input.status,
    }),
  )
}
export async function updateMarketing(id: string, patch: Partial<MarketingInput>): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.task !== undefined) row.task = patch.task
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.type !== undefined) row.type = patch.type
  if (patch.publishDate !== undefined) row.publish_date = patch.publishDate || null
  if (patch.budget !== undefined) row.budget = patch.budget
  if (patch.status !== undefined) row.status = patch.status
  await run(client().from('dash_marketing').update(row).eq('id', id))
}
export async function deleteMarketing(id: string): Promise<void> {
  await run(client().from('dash_marketing').delete().eq('id', id))
}

// --- עובדים ---
export type EmployeeInput = Omit<Employee, 'id'>
export async function createEmployee(input: EmployeeInput): Promise<void> {
  await run(
    client().from('dash_employees').insert({
      id: newId('emp'),
      name: input.name,
      role: input.role,
      department: input.department ?? null,
      venue: input.venue ?? null,
      start_date: input.startDate || null,
      status: input.status,
      hourly_rate: input.hourlyRate ?? null,
    }),
  )
}
export async function updateEmployee(id: string, patch: Partial<EmployeeInput>): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.role !== undefined) row.role = patch.role
  if (patch.department !== undefined) row.department = patch.department || null
  if (patch.venue !== undefined) row.venue = patch.venue || null
  if (patch.startDate !== undefined) row.start_date = patch.startDate || null
  if (patch.status !== undefined) row.status = patch.status
  if (patch.hourlyRate !== undefined) row.hourly_rate = patch.hourlyRate ?? null
  await run(client().from('dash_employees').update(row).eq('id', id))
}
export async function deleteEmployee(id: string): Promise<void> {
  await run(client().from('dash_employees').delete().eq('id', id))
}

// --- סימון ביצוע משימה לתקופה (יומי/שבועי) ---
export async function setTaskDone(
  taskId: string,
  periodKey: string,
  done: boolean,
): Promise<void> {
  const id = `${taskId}__${periodKey}`
  if (done) {
    await run(
      client().from('dash_task_log').upsert({
        id,
        task_id: taskId,
        period_key: periodKey,
        done: true,
        done_at: new Date().toISOString(),
      }),
    )
  } else {
    await run(client().from('dash_task_log').delete().eq('id', id))
  }
}
