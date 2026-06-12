import type { PaseoData } from '../types'

// נרמול שם להשוואה: trim, איחוד רווחים, הסרת גרשיים, אותיות קטנות.
function norm(s?: string): string {
  return (s || '')
    .trim()
    .replace(/["'׳״`]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// שמות משפחה נפוצים מדי — לא אמינים להתאמה לפי משפחה בלבד (יותר מדי "קרובי משפחה" מקריים)
const COMMON_SURNAMES = new Set([
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אזולאי', 'גבאי', 'אברהם',
  'פרידמן', 'מלכה', 'חדד', 'אוחיון', 'אוחנה', 'דוד', 'בן', 'חן', 'שלום', 'גל',
])

export interface PhoneMatch {
  phone: string
  sourceName: string // השם המלא כפי שמופיע בהזמנה/סקר אונטופו
  kind: 'exact' | 'surname' // התאמה מלאה, או רק שם משפחה (ייתכן קרוב משפחה)
}

export interface PhoneIndex {
  byFull: Map<string, PhoneMatch>
  bySurname: Map<string, PhoneMatch[]>
}

// בונה אינדקס שם→טלפון מכל מקורות אונטופו שיש בהם טלפון: סקרים (dash_reviews) + הזמנות.
export function buildPhoneIndex(d: PaseoData): PhoneIndex {
  const byFull = new Map<string, PhoneMatch>()
  const bySurname = new Map<string, PhoneMatch[]>()

  const add = (name?: string, phone?: string) => {
    const ph = (phone || '').trim()
    const nm = (name || '').trim()
    if (!ph || ph.replace(/\D/g, '').length < 9 || !nm) return
    const key = norm(nm)
    if (!key) return
    if (!byFull.has(key)) byFull.set(key, { phone: ph, sourceName: nm, kind: 'exact' })
    const parts = key.split(' ')
    const surname = parts[parts.length - 1]
    if (parts.length >= 2 && surname.length >= 3 && !COMMON_SURNAMES.has(surname)) {
      const arr = bySurname.get(surname) ?? []
      if (!arr.some((m) => norm(m.sourceName) === key)) arr.push({ phone: ph, sourceName: nm, kind: 'surname' })
      bySurname.set(surname, arr)
    }
  }

  for (const r of d.reviews) {
    if ((r.platform === 'OnTopo' || r.platform === 'OnTop') && r.phone) add(r.author, r.phone)
  }
  for (const v of d.reservations) add(v.name, v.phone)
  return { byFull, bySurname }
}

// מחפש טלפון לביקורת (בעיקר גוגל) לפי שם המבקר.
// קודם התאמה מלאה; אחרת התאמת שם משפחה — אך ורק אם קיימת התאמה יחידה (להפחתת טעויות).
export function matchPhone(author: string | undefined, idx: PhoneIndex): PhoneMatch | null {
  const key = norm(author)
  if (!key) return null
  const exact = idx.byFull.get(key)
  if (exact) return exact

  const parts = key.split(' ')
  const surname = parts[parts.length - 1]
  if (parts.length >= 2 && surname.length >= 3 && !COMMON_SURNAMES.has(surname)) {
    const arr = idx.bySurname.get(surname)
    if (arr && arr.length === 1) return arr[0]
  }
  return null
}
