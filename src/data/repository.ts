import { supabase, isSupabaseConfigured } from './supabaseClient'
import { paseoData } from './mockData'
import type {
  PaseoData,
  SalesRecord,
  EventLead,
  MarketingTask,
  Review,
  MaintenanceIssue,
  Employee,
  Supplier,
} from '../types'

export type DataSource = 'supabase' | 'mock'

export interface LoadResult {
  data: PaseoData
  source: DataSource
  error?: string
}

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

const mapEvent = (r: any): EventLead => ({
  id: r.id,
  customer: r.customer,
  phone: r.phone,
  eventType: r.event_type,
  guests: r.guests,
  date: r.date,
  status: r.status,
  owner: r.owner,
  createdAt: r.created_at,
  value: r.value ?? undefined,
})

const mapMarketing = (r: any): MarketingTask => ({
  id: r.id,
  task: r.task,
  kind: r.kind,
  type: r.type,
  publishDate: r.publish_date,
  budget: r.budget,
  status: r.status,
  leadsFromAd: r.leads_from_ad ?? undefined,
})

const mapReview = (r: any): Review => ({
  id: r.id,
  date: r.date,
  platform: r.platform,
  rating: r.rating,
  handled: r.handled,
  owner: r.owner,
  text: r.text ?? undefined,
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

const mapEmployee = (r: any): Employee => ({
  id: r.id,
  name: r.name,
  role: r.role,
  startDate: r.start_date,
  status: r.status,
})

const mapSupplier = (r: any): Supplier => ({
  id: r.id,
  supplier: r.supplier,
  domain: r.domain,
  contact: r.contact,
  phone: r.phone,
  deliveryDays: r.delivery_days,
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

export async function loadPaseoData(): Promise<LoadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: paseoData, source: 'mock' }
  }

  try {
    const [sales, events, marketing, reviews, maintenance, employees, suppliers] =
      await withTimeout(
        Promise.all([
          supabase.from('sales').select('*').order('date', { ascending: true }),
          supabase.from('events').select('*'),
          supabase.from('marketing').select('*'),
          supabase.from('reviews').select('*'),
          supabase.from('maintenance').select('*'),
          supabase.from('employees').select('*'),
          supabase.from('suppliers').select('*'),
        ]),
        LOAD_TIMEOUT_MS,
      )

    const firstError =
      sales.error ||
      events.error ||
      marketing.error ||
      reviews.error ||
      maintenance.error ||
      employees.error ||
      suppliers.error

    if (firstError) throw firstError

    return {
      source: 'supabase',
      data: {
        sales: (sales.data ?? []).map(mapSales),
        events: (events.data ?? []).map(mapEvent),
        marketing: (marketing.data ?? []).map(mapMarketing),
        reviews: (reviews.data ?? []).map(mapReview),
        maintenance: (maintenance.data ?? []).map(mapMaintenance),
        employees: (employees.data ?? []).map(mapEmployee),
        suppliers: (suppliers.data ?? []).map(mapSupplier),
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
