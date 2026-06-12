import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Gauge,
  TrendingUp,
  UtensilsCrossed,
  CalendarHeart,
  CalendarClock,
  Megaphone,
  Star,
  Wrench,
  HardHat,
  Users,
  Truck,
  ShoppingCart,
  Zap,
  CalendarCheck,
  ListChecks,
  X,
} from 'lucide-react'
import { useDataSource } from '../data/DataContext'

interface NavItem {
  to: string
  label: string
  icon: typeof Gauge
  badge?: number
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'בקרה',
    items: [
      { to: '/', label: 'בקרת בעלים', icon: Gauge },
      { to: '/ceo', label: 'דשבורד מנכ״ל', icon: LayoutDashboard },
      { to: '/weekly', label: 'KPI שבועי', icon: CalendarCheck },
      { to: '/automations', label: 'אוטומציות והתראות', icon: Zap },
    ],
  },
  {
    title: 'קבוצות',
    items: [
      { to: '/sales', label: 'מכירות', icon: TrendingUp },
      { to: '/menu', label: 'מנות', icon: UtensilsCrossed },
      { to: '/events', label: 'אירועים', icon: CalendarHeart },
      { to: '/guests', label: 'אורחים', icon: CalendarClock },
      { to: '/marketing', label: 'שיווק', icon: Megaphone },
      { to: '/reviews', label: 'ביקורות', icon: Star },
      { to: '/maintenance', label: 'תחזוקה', icon: Wrench },
      { to: '/professionals', label: 'אנשי מקצוע', icon: HardHat },
      { to: '/tasks', label: 'משימות', icon: ListChecks },
      { to: '/employees', label: 'עובדים', icon: Users },
      { to: '/suppliers', label: 'ספקים', icon: Truck },
      { to: '/purchasing', label: 'תכנון רכש', icon: ShoppingCart },
    ],
  },
]

export function Sidebar({
  alertCount,
  open = false,
  onClose,
}: {
  alertCount: number
  open?: boolean
  onClose?: () => void
}) {
  const { source } = useDataSource()
  return (
    <>
      {/* רקע כהה בנייד כשהמגירה פתוחה */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-60 bg-paseo-surface border-l border-paseo-border flex flex-col transform transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
      <div className="px-5 py-5 border-b border-paseo-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-paseo-gold/15 grid place-items-center text-paseo-gold font-black text-lg">
            פ
          </div>
          <div>
            <div className="font-black text-lg leading-tight">פסאו</div>
            <div className="text-xs text-paseo-muted">ניהול שוטף</div>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden p-1 text-paseo-muted hover:text-paseo-text" aria-label="סגירה">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-5 mb-1 text-[11px] font-bold uppercase tracking-wider text-paseo-muted">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon
              const showBadge = item.to === '/automations' && alertCount > 0
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-paseo-gold/10 text-paseo-gold border-r-2 border-paseo-gold'
                        : 'text-paseo-text/80 hover:bg-white/5'
                    }`
                  }
                >
                  <Icon size={18} />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className="text-xs font-bold bg-paseo-red text-white rounded-full px-2 py-0.5">
                      {alertCount}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-paseo-border text-[11px] text-paseo-muted">
        {source === 'supabase' ? 'מחובר ל-PaseoCRM' : 'נתוני דמה'} · MVP
      </div>
      </aside>
    </>
  )
}
