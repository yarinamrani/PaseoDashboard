const ILS = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
})

const ILS_PRECISE = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 1,
})

const NUM = new Intl.NumberFormat('he-IL')

export function shekel(n: number, precise = false) {
  return (precise ? ILS_PRECISE : ILS).format(n)
}

export function num(n: number) {
  return NUM.format(n)
}

// קיצור מספרים גדולים: 12500 -> ₪12.5K
export function shekelShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1000) return `₪${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return shekel(n)
}

export function pct(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}
