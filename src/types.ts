// Core domain types for the Paseo management dashboard.
// All entities mirror the "פסאו - ניהול שוטף" board groups.

// --- קבוצה 1: מכירות ---
export interface SalesRecord {
  id: string
  date: string // ISO date
  revenue: number // מחזור (₪)
  diners: number // סועדים
  avgPerDiner: number // ממוצע לסועד (₪)
  avgTable: number // ממוצע שולחן (₪)
  notes?: string // הערות
}

// --- קבוצה 2: אירועים ---
export type EventStatus =
  | 'ליד חדש'
  | 'שיחה בוצעה'
  | 'פגישה'
  | 'הצעה נשלחה'
  | 'משא ומתן'
  | 'נסגר'
  | 'אבוד'

export const EVENT_STATUSES: EventStatus[] = [
  'ליד חדש',
  'שיחה בוצעה',
  'פגישה',
  'הצעה נשלחה',
  'משא ומתן',
  'נסגר',
  'אבוד',
]

export interface EventLead {
  id: string
  customer: string // לקוח
  phone: string // טלפון
  eventType: string // סוג אירוע
  guests: number // אורחים
  date: string // תאריך האירוע (ISO)
  status: EventStatus // סטטוס
  owner: string // אחראי
  createdAt: string // מתי נכנס הליד (ISO) — לצורך Follow Up
  value?: number // שווי משוער (₪) — לחישוב פייפליין
}

// --- קבוצה 3: שיווק ---
export type MarketingKind = 'תוכן' | 'ממומן'
export type MarketingType =
  // תוכן
  | 'פוסט שקיעה'
  | 'פוסט בראנץ׳'
  | 'פוסט אירועים'
  | 'רילס'
  // ממומן
  | 'קמפיין אירועים'
  | 'קמפיין שקיעה'
  | 'קמפיין בראנץ׳'

export type MarketingStatus = 'מתוכנן' | 'בעבודה' | 'פורסם' | 'פעיל' | 'הושהה'

export interface MarketingTask {
  id: string
  task: string // משימה
  kind: MarketingKind
  type: MarketingType // סוג
  publishDate: string // תאריך פרסום (ISO)
  budget: number // תקציב (₪)
  status: MarketingStatus // סטטוס
  leadsFromAd?: number // לידים שהגיעו מפרסום
}

// --- קבוצה 4: ביקורות ---
export type ReviewPlatform = 'Google' | 'OnTop' | 'Facebook'

export interface Review {
  id: string
  date: string // תאריך (ISO)
  platform: ReviewPlatform // פלטפורמה
  rating: number // דירוג (1-5)
  handled: boolean // טופל
  owner: string // אחראי
  text?: string
}

// --- קבוצה 5: תחזוקה ---
export type MaintenanceArea =
  | 'מטבח'
  | 'בר'
  | 'שירותים'
  | 'גג'
  | 'חשמל'
  | 'תאורה'
  | 'ריהוט'

export const MAINTENANCE_AREAS: MaintenanceArea[] = [
  'מטבח',
  'בר',
  'שירותים',
  'גג',
  'חשמל',
  'תאורה',
  'ריהוט',
]

export type MaintenanceStatus = 'פתוח' | 'בטיפול' | 'סגור'

export interface MaintenanceIssue {
  id: string
  issue: string // תקלה
  area: MaintenanceArea // אזור
  openedDate: string // נפתח (ISO)
  owner: string // אחראי
  cost: number // עלות (₪)
  status: MaintenanceStatus // סטטוס
}

// --- קבוצה 6: עובדים ---
export type EmployeeStatus = 'פעיל' | 'בחופשה' | 'סיים'

export interface Employee {
  id: string
  name: string // שם
  role: string // תפקיד
  startDate: string // תאריך התחלה (ISO)
  status: EmployeeStatus // סטטוס
}

// --- קבוצה 7: ספקים ---
export interface Supplier {
  id: string
  supplier: string // ספק
  domain: string // תחום
  contact: string // איש קשר
  phone: string // טלפון
  deliveryDays: string // ימי אספקה
}

// --- אוטומציות / התראות ---
export type AlertSeverity = 'high' | 'medium' | 'info'

export interface Alert {
  id: string
  rule: string // שם הכלל / האוטומציה
  severity: AlertSeverity
  title: string
  detail: string
  assignedTo: string // למי נשלחת ההתראה
  createdAt: string // ISO
  link?: string // נתיב פנימי לקבוצה הרלוונטית
}

export interface PaseoData {
  sales: SalesRecord[]
  events: EventLead[]
  marketing: MarketingTask[]
  reviews: Review[]
  maintenance: MaintenanceIssue[]
  employees: Employee[]
  suppliers: Supplier[]
}
