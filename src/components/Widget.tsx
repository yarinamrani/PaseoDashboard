import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface WidgetProps {
  title: string
  children: ReactNode
  to?: string
  className?: string
  action?: ReactNode
}

export function Widget({ title, children, to, className = '', action }: WidgetProps) {
  return (
    <div
      className={`bg-paseo-card border border-paseo-border rounded-2xl p-5 shadow-card flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-paseo-text">{title}</h3>
        {action}
        {to && (
          <Link
            to={to}
            className="text-xs text-paseo-muted hover:text-paseo-gold flex items-center gap-1"
          >
            לפרטים <ArrowLeft size={14} />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export function Stat({
  value,
  label,
  tone = 'text-paseo-text',
}: {
  value: ReactNode
  label: string
  tone?: string
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-black tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-paseo-muted mt-1">{label}</div>
    </div>
  )
}
