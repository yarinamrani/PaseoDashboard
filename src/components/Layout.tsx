import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Database, FlaskConical, LogOut, Menu, AlertTriangle } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { usePaseo, useDataSource } from '../data/DataContext'
import { useAuth } from '../data/AuthContext'
import { runAutomations } from '../lib/automations'
import { TODAY } from '../lib/dates'

const longDate = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(TODAY)

function SourceBadge() {
  const { source } = useDataSource()
  const live = source === 'supabase'
  return (
    <span
      title={live ? 'הנתונים נטענים מ-Supabase בזמן אמת' : 'מוצגים נתוני דמה (אין חיבור פעיל)'}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
        live
          ? 'bg-paseo-green/10 border-paseo-green/30 text-paseo-green'
          : 'bg-paseo-amber/10 border-paseo-amber/30 text-paseo-amber'
      }`}
    >
      {live ? <Database size={12} /> : <FlaskConical size={12} />}
      {live ? 'מחובר ל-Supabase' : 'נתוני דמה'}
    </span>
  )
}

// פס אזהרה כשחלק מהטבלאות נכשלו בטעינה — כדי לא להציג "0" שקט כאילו אין נתונים
function PartialFailureBanner() {
  const { source, error } = useDataSource()
  if (source !== 'supabase' || !error) return null
  return (
    <div className="flex items-start gap-2 border-b border-paseo-red/30 bg-paseo-red/10 px-4 md:px-6 py-2 text-xs text-paseo-red">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>
        חלק מהנתונים לא נטענו ({error}). המספרים בעמודים אלו עשויים להיות חלקיים — נסה לרענן.
      </span>
    </div>
  )
}

export function Layout() {
  const d = usePaseo()
  const { session, signOut } = useAuth()
  const alertCount = runAutomations(d).filter((a) => a.severity === 'high').length
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar alertCount={alertCount} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header
          className="min-h-[3.5rem] shrink-0 border-b border-paseo-border bg-paseo-surface/60 backdrop-blur flex items-center justify-between px-4 md:px-6"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setNavOpen(true)}
              className="md:hidden -mr-1 p-2 rounded-lg text-paseo-text hover:bg-white/5"
              aria-label="תפריט"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block text-sm text-paseo-muted truncate">{longDate} · 09:00</div>
            <SourceBadge />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden sm:block">
              <span className="text-paseo-muted">בוקר טוב,</span>{' '}
              <span className="font-bold">בעלי פסאו</span>
            </div>
            {session && (
              <button
                onClick={() => signOut()}
                title={`מחובר כ-${session.user.email} · התנתקות`}
                className="flex items-center gap-1 rounded-lg border border-paseo-border px-2 py-1 text-xs text-paseo-muted hover:text-paseo-text hover:bg-white/5 transition-colors"
              >
                <LogOut size={12} />
                <span className="hidden sm:inline">התנתקות</span>
              </button>
            )}
          </div>
        </header>
        <PartialFailureBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
