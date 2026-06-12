import { useMemo, useState } from 'react'
import { AlertTriangle, Check, MessageCircle, ExternalLink } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo, useRefreshPaseo, useDataSource } from '../data/DataContext'
import { setReviewHandled } from '../data/repository'
import { buildPhoneIndex, matchPhone, type PhoneMatch } from '../lib/contacts'
import { GOOGLE_TARGET } from '../lib/metrics'
import { formatDate } from '../lib/dates'
import type { Review } from '../types'

// קישור וואטסאפ מהיר עם הודעת פנייה מוכנה (פיצוי + בקשה לעדכן/להסיר ביקורת)
function whatsappLink(phone: string, name?: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits
  if (intl.length < 11) return null
  const msg =
    `שלום ${name?.trim() || ''},`.trim() +
    ' כאן צוות מסעדת פסאו 🙏 ראינו את המשוב שהשארת ואנחנו מאוד מצטערים שהחוויה לא הייתה מושלמת.' +
    ' חשוב לנו לתקן ולפצות אותך — נשמח לדבר ולמצוא דרך שתחזיר/י אלינו חוויה טובה.'
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}

// בגוגל אין ערוץ פנייה פרטי — המבקרים אנונימיים. הערוץ הרשמי היחיד הוא מענה
// ציבורי דרך Google Business Profile (שם אפשר גם לבקש מהלקוח לעדכן/להסיר).
const GOOGLE_REPLY_URL = 'https://business.google.com/reviews'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-paseo-gold tabular-nums" title={`${rating}/5`}>
      {'★'.repeat(rating)}
      <span className="text-paseo-border">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

const platformColor: Record<string, string> = {
  Google: 'bg-paseo-blue/15 text-paseo-blue',
  OnTopo: 'bg-paseo-green/15 text-paseo-green',
  OnTop: 'bg-paseo-green/15 text-paseo-green',
  Facebook: 'bg-paseo-gold/15 text-paseo-gold',
}

const columns: Column<Review>[] = [
  { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  {
    key: 'platform',
    header: 'פלטפורמה',
    render: (r) => (
      <span className={`text-xs px-2 py-0.5 rounded ${platformColor[r.platform] ?? 'bg-white/5'}`}>{r.platform}</span>
    ),
  },
  { key: 'author', header: 'שם', render: (r) => <span className="text-paseo-text/90">{r.author || '—'}</span> },
  { key: 'rating', header: 'דירוג', render: (r) => <Stars rating={r.rating} /> },
  { key: 'text', header: 'תוכן', render: (r) => <span className="text-paseo-muted">{r.text ?? '—'}</span> },
  {
    key: 'handled',
    header: 'טופל',
    render: (r) =>
      r.handled ? (
        <span className="text-paseo-green">✓ טופל</span>
      ) : (
        <span className="text-paseo-red font-bold">✗ פתוח</span>
      ),
  },
]

const isOntopo = (r: Review) => r.platform === 'OnTopo' || r.platform === 'OnTop'
const avg = (arr: Review[]) =>
  arr.length ? Math.round((arr.reduce((a, r) => a + r.rating, 0) / arr.length) * 10) / 10 : 0

type Filter = 'הכל' | 'Google' | 'OnTopo'

export function Reviews() {
  const d = usePaseo()
  const refresh = useRefreshPaseo()
  const { source } = useDataSource()
  const isMock = source === 'mock'
  const [filter, setFilter] = useState<Filter>('הכל')
  const [busy, setBusy] = useState<string | null>(null)
  // אינדקס שם→טלפון מאונטופו (סקרים + הזמנות) — להצלבה עם ביקורות גוגל
  const phoneIdx = useMemo(() => buildPhoneIndex(d), [d])

  // רק ביקורות עדכניות (24 החודשים האחרונים)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 24)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const recent = d.reviews.filter((r) => r.date >= cutoffIso)

  const google = recent.filter((r) => r.platform === 'Google')
  const ontopo = recent.filter(isOntopo)

  const googleRatingVal = d.googleRating ?? avg(google)
  const ontopoRatingVal = avg(ontopo)

  // חריגים לטיפול: ביקורות שליליות (1-3★) שטרם טופלו — אונטופו + גוגל, מהחדש לישן
  const anomalies = recent
    .filter((r) => r.rating <= 3 && !r.handled)
    .sort((a, b) => b.date.localeCompare(a.date))

  const filtered = filter === 'Google' ? google : filter === 'OnTopo' ? ontopo : recent
  const rows = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
  const untreated = filtered.filter((r) => r.rating <= 3 && !r.handled).length

  const filters: { key: Filter; count: number }[] = [
    { key: 'הכל', count: recent.length },
    { key: 'Google', count: google.length },
    { key: 'OnTopo', count: ontopo.length },
  ]

  async function markHandled(r: Review) {
    if (isMock || busy) return
    setBusy(r.id)
    try {
      await setReviewHandled(r.id, true)
      await refresh()
    } catch {
      /* ignore */
    }
    setBusy(null)
  }

  return (
    <div>
      <PageHeader title="ביקורות" subtitle="מפולג לפי Google ו-OnTopo · מתעדכן כל 3 שעות" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="דירוג גוגל">
          <Stat
            value={googleRatingVal.toFixed(1)}
            label={d.googleReviewCount ? `${d.googleReviewCount} ביקורות · יעד ${GOOGLE_TARGET}+` : `יעד ${GOOGLE_TARGET}+`}
            tone={googleRatingVal >= GOOGLE_TARGET ? 'text-paseo-green' : 'text-paseo-amber'}
          />
        </Widget>
        <Widget title="דירוג אונטופו">
          <Stat
            value={ontopoRatingVal ? ontopoRatingVal.toFixed(1) : '—'}
            label={`${ontopo.length} סקרי אורחים`}
            tone={ontopoRatingVal >= 4 ? 'text-paseo-green' : 'text-paseo-amber'}
          />
        </Widget>
        <Widget title="ביקורות שליליות">
          <Stat
            value={filtered.filter((r) => r.rating <= 2).length}
            label="1-2 כוכבים"
            tone="text-paseo-red"
          />
        </Widget>
        <Widget title="ממתינות לטיפול">
          <Stat value={untreated} label="1-3★ לא טופלו" tone={untreated ? 'text-paseo-red' : 'text-paseo-green'} />
        </Widget>
      </div>

      {/* חריגים לטיפול מול הלקוחה — סקרי אונטופו שליליים שטרם טופלו */}
      {anomalies.length > 0 && (
        <div className="mb-6 rounded-2xl border border-paseo-red/30 bg-paseo-red/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-paseo-red shrink-0" />
            <h2 className="font-bold text-paseo-text">חריגים לטיפול מול הלקוחה</h2>
            <span className="text-xs font-bold bg-paseo-red text-white rounded-full px-2 py-0.5">{anomalies.length}</span>
            <span className="text-xs text-paseo-muted mr-auto">ביקורות 1-3★ שטרם טופלו · אונטופו + גוגל</span>
          </div>
          <div className="space-y-2">
            {anomalies.map((r) => {
              const direct: PhoneMatch | null = r.phone
                ? { phone: r.phone, sourceName: r.author || '', kind: 'exact' }
                : null
              const match = direct ?? matchPhone(r.author, phoneIdx)
              const wa = match ? whatsappLink(match.phone, r.author) : null
              const viaCrossRef = !!match && !r.phone // טלפון שנמצא בהצלבה (לא ישירות מהביקורת)
              const isGoogle = r.platform === 'Google'
              return (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-xl border border-paseo-border bg-paseo-surface p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-paseo-text">{r.author || 'אורח/ת'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${platformColor[r.platform] ?? 'bg-white/5'}`}>{r.platform}</span>
                      <Stars rating={r.rating} />
                      <span className="text-xs text-paseo-muted">{formatDate(r.date)}</span>
                    </div>
                    {r.text && <p className="text-sm text-paseo-text/80 leading-relaxed">{r.text}</p>}
                    {viaCrossRef && match && (
                      <p className="text-[11px] text-paseo-blue/90 mt-1">
                        📞 נמצא טלפון דרך אונטופו: {match.sourceName}
                        {match.kind === 'surname' ? ' · ייתכן קרוב/ת משפחה — כדאי לוודא' : ''}
                      </p>
                    )}
                    {isGoogle && !match && (
                      <p className="text-[11px] text-paseo-muted mt-1">
                        בגוגל אין פנייה פרטית — המענה הוא ציבורי דרך Google Business (אפשר לבקש שם עדכון/הסרה).
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-paseo-green/15 px-3 py-1.5 text-xs font-medium text-paseo-green hover:bg-paseo-green/25 transition-colors"
                        title={`וואטסאפ ל-${r.phone}`}
                      >
                        <MessageCircle size={14} />
                        וואטסאפ
                      </a>
                    )}
                    {isGoogle && (
                      <a
                        href={GOOGLE_REPLY_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-paseo-blue/15 px-3 py-1.5 text-xs font-medium text-paseo-blue hover:bg-paseo-blue/25 transition-colors"
                        title="מענה ציבורי בגוגל ביזנס"
                      >
                        <ExternalLink size={14} />
                        מענה בגוגל
                      </a>
                    )}
                    <button
                      onClick={() => markHandled(r)}
                      disabled={isMock || busy === r.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-paseo-muted hover:text-paseo-green hover:bg-paseo-green/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="סמן שטופל מול הלקוחה"
                    >
                      <Check size={14} />
                      {busy === r.id ? '…' : 'טופל'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {isMock && (
            <p className="text-xs text-paseo-amber mt-3">מצב דמה — הסימון מושבת. התחבר כדי לסמן טיפול.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {f.key} <span className="opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      <Widget title={`ביקורות ${filter === 'הכל' ? '' : filter}`.trim()}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין ביקורות בקטגוריה זו" />
      </Widget>
    </div>
  )
}
