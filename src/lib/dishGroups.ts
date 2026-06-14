// קיבוץ מנות לקבוצות-על נגזרות מהקטגוריה והמחלקה של אלפרד.
// הערה: "בשרי/חלבי" אינו קיים בנתוני אלפרד, ולכן אינו נגזר אוטומטית — דורש תיוג ידני.
export type DishGroup = 'מטבח' | 'סושי' | 'קינוחים' | 'שתייה קלה' | 'אלכוהול' | 'אחר'

export const DISH_GROUPS: DishGroup[] = ['מטבח', 'סושי', 'קינוחים', 'שתייה קלה', 'אלכוהול']

const ALC = ['קוקטייל', 'בירות', 'וודקה', 'יינות', 'וויסקי', 'טקילה', 'גין', "ג'ין", 'רום', 'אניס', 'ליקר', 'אפריטיף', 'מבעבעים']
const FOOD = ['ראשונות', 'עיקריות', 'סלטים', 'בראנץ']

export function dishGroup(category: string, department: string): DishGroup {
  const c = (category || '').trim()
  if (c.includes('קינוח')) return 'קינוחים'
  if (c === 'ניגירי' || c.includes('סושי')) return 'סושי'
  if (c.includes('שתיה קלה') || c.includes('שתיה חמה')) return 'שתייה קלה'
  if (department === 'bar') return 'אלכוהול'
  if (department === 'kitchen') return 'מטבח'
  // אין מחלקה — נגזור מהקטגוריה
  if (ALC.some((a) => c.includes(a))) return 'אלכוהול'
  if (FOOD.some((f) => c.includes(f))) return 'מטבח'
  return 'אחר'
}
