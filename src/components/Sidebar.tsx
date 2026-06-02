import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Gauge,
  TrendingUp,
  CalendarHeart,
  Megaphone,
  Star,
  Wrench,
  Users,
  Truck,
  Zap,
  CalendarCheck,
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
      { to: '/events', label: 'אירועים', icon: CalendarHeart },
      { to: '/marketing', label: 'שיווק', icon: Megaphone },
      { to: '/reviews', label: 'ביקורות', icon: Star },
      { to: '/maintenance', label: 'תחזוקה', icon: Wrench },
      { to: '/employees', label: 'עובדים', icon: Users },
      { to: '/suppliers', label: 'ספקים', icon: Truck },
    ],
  },
]

export function Sidebar({ alertCount }: { alertCount: number }) {
  const { source } = useDataSource()
  return (
    <aside className="w-60 shrink-0 bg-paseo-surface border-l border-paseo-border flex flex-col">
      <div className="px-5 py-5 border-b border-paseo-border">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-paseo-gold/15 grid place-items-center text-paseo-gold font-black text-lg">
            פ
          </div>
          <div>
            <div className="font-black text-lg leading-tight">פסאו</div>
            <div className="text-xs text-paseo-muted">ניהול שוטף</div>
          </div>
        </div>
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
  )
}
