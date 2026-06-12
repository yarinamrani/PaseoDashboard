// גרף קו פשוט (SVG) למגמה — ללא תלות חיצונית.
export function Sparkline({
  values,
  height = 56,
  className = '',
  stroke = '#d4af37',
}: {
  values: number[]
  height?: number
  className?: string
  stroke?: string
}) {
  const W = 240
  const H = height
  const pad = 4
  if (values.length < 2) {
    return <div className={`text-xs text-paseo-muted ${className}`}>אין מספיק נתונים לגרף</div>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (W - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (H - pad * 2) * (1 - (v - min) / span)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} preserveAspectRatio="none" style={{ height }}>
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={stroke} />
    </svg>
  )
}
