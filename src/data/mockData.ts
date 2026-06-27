import { addDays, addHours, formatISO } from 'date-fns'
import { TODAY } from '../lib/dates'
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

// עוזרים ליצירת תאריכים יחסית ל"היום" כדי שהדאטה והאוטומציות יהיו עקביים
const iso = (d: Date) => formatISO(d, { representation: 'date' })
const isoTime = (d: Date) => d.toISOString()
const dayOffset = (n: number) => iso(addDays(TODAY, n))
const hoursAgo = (h: number) => isoTime(addHours(TODAY, -h))

// --- מכירות: 100 ימים אחורה, עם תבנית שבועית ריאליסטית ורעש דטרמיניסטי ---
function buildSales(): SalesRecord[] {
  const out: SalesRecord[] = []
  for (let i = 100; i >= 1; i--) {
    const date = addDays(TODAY, -i)
    const dow = date.getDay() // 0=ראשון ... 6=שבת
    // בסיס סועדים לפי יום בשבוע (סופ"ש חזק יותר)
    const base = [70, 60, 65, 80, 120, 150, 140][dow]
    // רעש דטרמיניסטי בעזרת סינוס על האינדקס
    const wobble = Math.round(Math.sin(i * 1.7) * 18 + Math.cos(i * 0.6) * 10)
    const diners = Math.max(30, base + wobble)
    const avgPerDiner = 95 + ((i * 7) % 35) // ₪95-130
    const revenue = Math.round((diners * avgPerDiner) / 10) * 10
    const tablesEstimate = Math.max(1, Math.round(diners / 3.2))
    out.push({
      id: `s-${i}`,
      date: iso(date),
      revenue,
      diners,
      avgPerDiner,
      avgTable: Math.round(revenue / tablesEstimate),
      notes: dow === 5 ? 'שישי עמוס' : dow === 6 ? 'מוצ״ש' : undefined,
    })
  }
  return out
}

const events: EventLead[] = [
  // לידים טריים (פחות מ-24 שעות) -> מפעילים אוטומציית Follow Up
  { id: 'e-1', customer: 'משפחת לוי', phone: '052-1112233', eventType: 'בר מצווה', guests: 120, date: dayOffset(40), status: 'ליד חדש', owner: 'דנה', createdAt: hoursAgo(6), value: 38000 },
  { id: 'e-2', customer: 'חברת Wix', phone: '054-9988776', eventType: 'אירוע חברה', guests: 200, date: dayOffset(55), status: 'ליד חדש', owner: 'דנה', createdAt: hoursAgo(20), value: 75000 },
  // ליד שנכנס לפני יומיים (לא מפעיל Follow Up)
  { id: 'e-3', customer: 'רונית כהן', phone: '050-4455667', eventType: 'יום הולדת', guests: 45, date: dayOffset(21), status: 'שיחה בוצעה', owner: 'אבי', createdAt: hoursAgo(48), value: 14000 },
  { id: 'e-4', customer: 'משרד עו״ד שטרן', phone: '053-2233445', eventType: 'כנס', guests: 80, date: dayOffset(12), status: 'פגישה', owner: 'דנה', createdAt: hoursAgo(96), value: 29000 },
  { id: 'e-5', customer: 'משפחת אזולאי', phone: '052-7766554', eventType: 'חתונה קטנה', guests: 110, date: dayOffset(70), status: 'הצעה נשלחה', owner: 'אבי', createdAt: hoursAgo(120), value: 62000 },
  { id: 'e-6', customer: 'סטארטאפ Lumen', phone: '054-1212343', eventType: 'השקת מוצר', guests: 150, date: dayOffset(9), status: 'הצעה נשלחה', owner: 'דנה', createdAt: hoursAgo(168), value: 48000 },
  { id: 'e-7', customer: 'משפחת פרץ', phone: '050-9090112', eventType: 'ברית', guests: 60, date: dayOffset(5), status: 'משא ומתן', owner: 'אבי', createdAt: hoursAgo(200), value: 18000 },
  { id: 'e-8', customer: 'עיריית הרצליה', phone: '09-9123456', eventType: 'ערב גלריה', guests: 180, date: dayOffset(26), status: 'משא ומתן', owner: 'דנה', createdAt: hoursAgo(240), value: 55000 },
  // אירוע שנסגר וקרוב (בעוד 14 יום בדיוק) -> מפעיל התראת "אירוע בעוד 14 יום"
  { id: 'e-9', customer: 'משפחת ביטון', phone: '052-3434565', eventType: 'בת מצווה', guests: 130, date: dayOffset(14), status: 'נסגר', owner: 'אבי', createdAt: hoursAgo(720), value: 41000 },
  { id: 'e-10', customer: 'חברת מובייל איי', phone: '054-5656787', eventType: 'אירוע עובדים', guests: 220, date: dayOffset(13), status: 'נסגר', owner: 'דנה', createdAt: hoursAgo(800), value: 88000 },
  { id: 'e-11', customer: 'משפחת חדד', phone: '050-1313242', eventType: 'אירוסין', guests: 90, date: dayOffset(3), status: 'נסגר', owner: 'אבי', createdAt: hoursAgo(960), value: 33000 },
  { id: 'e-12', customer: 'בית ספר אלון', phone: '03-5443322', eventType: 'מסיבת סיום', guests: 160, date: dayOffset(28), status: 'נסגר', owner: 'דנה', createdAt: hoursAgo(1100), value: 52000 },
  { id: 'e-13', customer: 'משפחת שמש', phone: '052-8787656', eventType: 'יום הולדת 50', guests: 70, date: dayOffset(-6), status: 'נסגר', owner: 'אבי', createdAt: hoursAgo(1300), value: 22000 },
  { id: 'e-14', customer: 'גיא ולנה', phone: '054-2323454', eventType: 'מסיבת רווקים', guests: 30, date: dayOffset(2), status: 'אבוד', owner: 'אבי', createdAt: hoursAgo(400), value: 9000 },
  { id: 'e-15', customer: 'חברת אינפיניטי', phone: '053-6767878', eventType: 'כנס מכירות', guests: 250, date: dayOffset(45), status: 'אבוד', owner: 'דנה', createdAt: hoursAgo(500), value: 95000 },
  { id: 'e-16', customer: 'משפחת נחום', phone: '050-7878989', eventType: 'בר מצווה', guests: 140, date: dayOffset(18), status: 'פגישה', owner: 'אבי', createdAt: hoursAgo(72), value: 44000 },
  { id: 'e-17', customer: 'קליניקת דר׳ רז', phone: '054-9191020', eventType: 'ערב לקוחות', guests: 65, date: dayOffset(33), status: 'שיחה בוצעה', owner: 'דנה', createdAt: hoursAgo(50), value: 21000 },
]

const marketing: MarketingTask[] = [
  // תוכן
  { id: 'm-1', task: 'פוסט שקיעה על הגג', kind: 'תוכן', type: 'פוסט שקיעה', publishDate: dayOffset(-3), budget: 0, status: 'פורסם' },
  { id: 'm-2', task: 'רילס אווירה ערב', kind: 'תוכן', type: 'רילס', publishDate: dayOffset(-1), budget: 0, status: 'פורסם' },
  { id: 'm-3', task: 'פוסט תפריט בראנץ׳ חדש', kind: 'תוכן', type: 'פוסט בראנץ׳', publishDate: dayOffset(2), budget: 0, status: 'בעבודה' },
  { id: 'm-4', task: 'רילס מאחורי הקלעים במטבח', kind: 'תוכן', type: 'רילס', publishDate: dayOffset(4), budget: 0, status: 'מתוכנן' },
  { id: 'm-5', task: 'פוסט אירועים פרטיים', kind: 'תוכן', type: 'פוסט אירועים', publishDate: dayOffset(-8), budget: 0, status: 'פורסם' },
  { id: 'm-6', task: 'פוסט שקיעה סופ״ש', kind: 'תוכן', type: 'פוסט שקיעה', publishDate: dayOffset(-12), budget: 0, status: 'פורסם' },
  { id: 'm-7', task: 'רילס קוקטיילים בבר', kind: 'תוכן', type: 'רילס', publishDate: dayOffset(-5), budget: 0, status: 'פורסם' },
  // ממומן
  { id: 'm-8', task: 'קמפיין אירועים Q2', kind: 'ממומן', type: 'קמפיין אירועים', publishDate: dayOffset(-20), budget: 6000, status: 'פעיל', leadsFromAd: 34 },
  { id: 'm-9', task: 'קמפיין שקיעה אינסטגרם', kind: 'ממומן', type: 'קמפיין שקיעה', publishDate: dayOffset(-10), budget: 3500, status: 'פעיל', leadsFromAd: 12 },
  { id: 'm-10', task: 'קמפיין בראנץ׳ סופ״ש', kind: 'ממומן', type: 'קמפיין בראנץ׳', publishDate: dayOffset(-15), budget: 2800, status: 'פעיל', leadsFromAd: 9 },
  { id: 'm-11', task: 'קמפיין אירועי קיץ', kind: 'ממומן', type: 'קמפיין אירועים', publishDate: dayOffset(3), budget: 5000, status: 'מתוכנן' },
  { id: 'm-12', task: 'קמפיין שקיעה — הושהה', kind: 'ממומן', type: 'קמפיין שקיעה', publishDate: dayOffset(-30), budget: 4000, status: 'הושהה', leadsFromAd: 7 },
]

const reviews: Review[] = [
  { id: 'r-1', date: dayOffset(-1), platform: 'Google', rating: 5, handled: true, owner: 'מאיה', text: 'אוכל מדהים ונוף עוצר נשימה' },
  { id: 'r-2', date: dayOffset(-2), platform: 'Google', rating: 4, handled: true, owner: 'מאיה' },
  // ביקורות 1-3 כוכבים -> מפעילות התראה למנהל מסעדה
  { id: 'r-3', date: dayOffset(-2), platform: 'Google', rating: 2, handled: false, owner: 'מאיה', text: 'שירות איטי בשישי בערב' },
  { id: 'r-4', date: dayOffset(-4), platform: 'OnTop', rating: 3, handled: false, owner: 'מאיה', text: 'אוכל טוב אבל יקר' },
  { id: 'r-5', date: dayOffset(-6), platform: 'Facebook', rating: 1, handled: false, owner: 'מאיה', text: 'חיכינו 40 דקות לשולחן עם הזמנה' },
  { id: 'r-6', date: dayOffset(-7), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-7', date: dayOffset(-9), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-8', date: dayOffset(-11), platform: 'OnTop', rating: 4, handled: true, owner: 'מאיה' },
  { id: 'r-9', date: dayOffset(-13), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-10', date: dayOffset(-16), platform: 'Facebook', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-11', date: dayOffset(-18), platform: 'Google', rating: 4, handled: true, owner: 'מאיה' },
  { id: 'r-12', date: dayOffset(-20), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-13', date: dayOffset(-24), platform: 'OnTop', rating: 3, handled: true, owner: 'מאיה' },
  { id: 'r-14', date: dayOffset(-28), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
  { id: 'r-15', date: dayOffset(-40), platform: 'Google', rating: 5, handled: true, owner: 'מאיה' },
]

const maintenance: MaintenanceIssue[] = [
  // תקלות פתוחות מעל 3 ימים -> מפעילות התראה למנהל תפעול
  { id: 't-1', issue: 'מזגן בר לא מקרר', area: 'בר', openedDate: dayOffset(-6), owner: 'יוסי', cost: 1200, status: 'פתוח' },
  { id: 't-2', issue: 'נזילה בתקרת שירותים', area: 'שירותים', openedDate: dayOffset(-9), owner: 'יוסי', cost: 800, status: 'בטיפול' },
  { id: 't-3', issue: 'תאורת גג מהבהבת', area: 'תאורה', openedDate: dayOffset(-4), owner: 'יוסי', cost: 450, status: 'פתוח' },
  // תקלות טריות (פחות מ-3 ימים) — לא מפעילות התראה
  { id: 't-4', issue: 'דלת מקרר מטבח לא נסגרת', area: 'מטבח', openedDate: dayOffset(-1), owner: 'יוסי', cost: 0, status: 'פתוח' },
  { id: 't-5', issue: 'כסא שבור באזור גג', area: 'ריהוט', openedDate: dayOffset(-2), owner: 'יוסי', cost: 300, status: 'פתוח' },
  // סגורות
  { id: 't-6', issue: 'קצר בלוח חשמל ראשי', area: 'חשמל', openedDate: dayOffset(-14), owner: 'חשמלאי חוץ', cost: 2400, status: 'סגור' },
  { id: 't-7', issue: 'ברז מטבח דולף', area: 'מטבח', openedDate: dayOffset(-20), owner: 'יוסי', cost: 180, status: 'סגור' },
  { id: 't-8', issue: 'איטום גג לפני חורף', area: 'גג', openedDate: dayOffset(-30), owner: 'קבלן', cost: 5500, status: 'סגור' },
]

const employees: Employee[] = [
  { id: 'w-1', name: 'דנה מזרחי', role: 'מנהלת אירועים', startDate: dayOffset(-540), status: 'פעיל' },
  { id: 'w-2', name: 'אבי לוגסי', role: 'מנהל מכירות אירועים', startDate: dayOffset(-380), status: 'פעיל' },
  { id: 'w-3', name: 'מאיה שרון', role: 'מנהלת מסעדה', startDate: dayOffset(-720), status: 'פעיל' },
  { id: 'w-4', name: 'יוסי בן דוד', role: 'מנהל תפעול', startDate: dayOffset(-900), status: 'פעיל' },
  { id: 'w-5', name: 'נועה כץ', role: 'שף', startDate: dayOffset(-650), status: 'פעיל' },
  { id: 'w-6', name: 'איתי גל', role: 'ברמן ראשי', startDate: dayOffset(-200), status: 'פעיל' },
  { id: 'w-7', name: 'שירן עזרא', role: 'מלצרית', startDate: dayOffset(-120), status: 'בחופשה' },
  { id: 'w-8', name: 'עומר דהן', role: 'מלצר', startDate: dayOffset(-90), status: 'פעיל' },
  { id: 'w-9', name: 'ליאור אבני', role: 'מארחת', startDate: dayOffset(-45), status: 'פעיל' },
  { id: 'w-10', name: 'תום פלד', role: 'סו-שף', startDate: dayOffset(-400), status: 'סיים' },
]

const suppliers: Supplier[] = [
  { id: 'sp-1', supplier: 'בשר הגליל', domain: 'בשר', contact: 'משה', phone: '04-6543210', deliveryDays: 'א׳, ד׳' },
  { id: 'sp-2', supplier: 'ירקות השדה', domain: 'ירקות ופירות', contact: 'רחל', phone: '08-9876543', deliveryDays: 'א׳, ג׳, ה׳' },
  { id: 'sp-3', supplier: 'יקב נחל', domain: 'יין ואלכוהול', contact: 'דוד', phone: '04-1234567', deliveryDays: 'ב׳' },
  { id: 'sp-4', supplier: 'מאפיית לחם הארץ', domain: 'מאפים', contact: 'סיגל', phone: '03-7778889', deliveryDays: 'כל יום' },
  { id: 'sp-5', supplier: 'דגי הים התיכון', domain: 'דגים', contact: 'אבי', phone: '04-5556667', deliveryDays: 'ג׳, ו׳' },
  { id: 'sp-6', supplier: 'חלב ומחלבות', domain: 'מוצרי חלב', contact: 'מירי', phone: '09-3334445', deliveryDays: 'א׳, ד׳' },
  { id: 'sp-7', supplier: 'קפה רוסטרס', domain: 'קפה', contact: 'יואב', phone: '03-2221110', deliveryDays: 'ב׳, ה׳' },
]

export const paseoData: PaseoData = {
  sales: buildSales(),
  events,
  marketing,
  reviews,
  maintenance,
  employees,
  suppliers,
  professionals: [],
  reservations: [],
  payroll: [],
  tasks: [],
  taskDone: [],
  dishes: [],
  hourly: [],
  ingredients: [],
  recipes: [],
  invoices: [],
  priceAnomalies: [],
}
