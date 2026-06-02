// תגיות סטטוס צבעוניות לפי הסטטוסים השונים בלוח

const colorMap: Record<string, string> = {
  // אירועים
  'ליד חדש': 'bg-paseo-blue/15 text-paseo-blue',
  'שיחה בוצעה': 'bg-paseo-blue/15 text-paseo-blue',
  'פגישה': 'bg-paseo-amber/15 text-paseo-amber',
  'הצעה נשלחה': 'bg-paseo-amber/15 text-paseo-amber',
  'משא ומתן': 'bg-paseo-gold/15 text-paseo-gold',
  'נסגר': 'bg-paseo-green/15 text-paseo-green',
  'אבוד': 'bg-paseo-red/15 text-paseo-red',
  // שיווק
  'מתוכנן': 'bg-paseo-muted/15 text-paseo-muted',
  'בעבודה': 'bg-paseo-amber/15 text-paseo-amber',
  'פורסם': 'bg-paseo-green/15 text-paseo-green',
  'פעיל': 'bg-paseo-green/15 text-paseo-green',
  'הושהה': 'bg-paseo-red/15 text-paseo-red',
  // תחזוקה
  'פתוח': 'bg-paseo-red/15 text-paseo-red',
  'בטיפול': 'bg-paseo-amber/15 text-paseo-amber',
  'סגור': 'bg-paseo-green/15 text-paseo-green',
  // עובדים
  'בחופשה': 'bg-paseo-amber/15 text-paseo-amber',
  'סיים': 'bg-paseo-muted/15 text-paseo-muted',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = colorMap[status] ?? 'bg-white/5 text-paseo-text'
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
