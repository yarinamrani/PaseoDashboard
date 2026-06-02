import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const toneStyles: Record<Tone, { ring: string; text: string; iconBg: string }> = {
  neutral: { ring: 'border-paseo-border', text: 'text-paseo-text', iconBg: 'bg-white/5 text-paseo-blue' },
  good: { ring: 'border-paseo-green/30', text: 'text-paseo-green', iconBg: 'bg-paseo-green/10 text-paseo-green' },
  warn: { ring: 'border-paseo-amber/30', text: 'text-paseo-amber', iconBg: 'bg-paseo-amber/10 text-paseo-amber' },
  bad: { ring: 'border-paseo-red/30', text: 'text-paseo-red', iconBg: 'bg-paseo-red/10 text-paseo-red' },
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: Tone
  to?: string
  trend?: string
  trendTone?: Tone
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  to,
  trend,
  trendTone = 'neutral',
}: KpiCardProps) {
  const s = toneStyles[tone]
  const body = (
    <div
      className={`bg-paseo-card border ${s.ring} rounded-2xl p-5 h-full shadow-card transition-transform hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-paseo-muted font-medium">{label}</span>
        <span className={`w-9 h-9 grid place-items-center rounded-xl ${s.iconBg}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className={`text-3xl font-black ${s.text} tabular-nums`}>{value}</div>
      <div className="mt-2 flex items-center gap-2">
        {sub && <span className="text-xs text-paseo-muted">{sub}</span>}
        {trend && (
          <span className={`text-xs font-bold ${toneStyles[trendTone].text}`}>{trend}</span>
        )}
      </div>
    </div>
  )
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}
