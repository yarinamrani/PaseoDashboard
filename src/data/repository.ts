import { supabase, isSupabaseConfigured } from './supabaseClient'
import { paseoData } from './mockData'
import type {
  PaseoData,
  SalesRecord,
  EventLead,
  EventStatus,
  MaintenanceIssue,
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
    const [events, sales, maintenance] = await withTimeout(
      Promise.all([
        supabase.from('crm_leads').select('*'),
        supabase.from('dash_sales').select('*').order('date', { ascending: true }),
        supabase.from('dash_maintenance').select('*'),
      ]),
      LOAD_TIMEOUT_MS,
    )

    // crm_leads הוא המקור הקריטי; אם הוא נכשל — נפילה מלאה ל-Mock
    if (events.error) throw events.error

    return {
      source: 'supabase',
      data: {
        // לידים אמיתיים מ-crm_leads — מסננים לידים שסומנו כלא רלוונטיים (ספאם)
        events: (events.data ?? [])
          .filter((r: any) => r.relevance !== 'irrelevant')
          .map(mapCrmLead),
        // מכירות/תחזוקה מ-dash_; אם הטבלה לא זמינה — דמה
        sales: sales.error ? paseoData.sales : (sales.data ?? []).map(mapSales),
        maintenance: maintenance.error
          ? paseoData.maintenance
          : (maintenance.data ?? []).map(mapMaintenance),
        // קבוצות שעדיין ללא מקור אמיתי — נתוני דמה
        marketing: paseoData.marketing,
        reviews: paseoData.reviews,
        employees: paseoData.employees,
        suppliers: paseoData.suppliers,
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
