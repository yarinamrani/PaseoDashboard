import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'right' | 'left' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty?: string
}

export function DataTable<T>({ columns, rows, rowKey, empty = 'אין נתונים' }: DataTableProps<T>) {
  if (!rows.length) {
    return <div className="text-center text-paseo-muted py-12 text-sm">{empty}</div>
  }
  return (
    <>
      {/* דסקטופ/טאבלט — טבלה */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-paseo-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-paseo-surface text-paseo-muted text-xs">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-semibold whitespace-nowrap text-${c.align ?? 'right'}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-paseo-border hover:bg-white/[0.03]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 whitespace-nowrap text-${c.align ?? 'right'}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* מובייל — כרטיסים (טבלאות נחתכות במסך צר) */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            className="rounded-xl border border-paseo-border bg-paseo-surface p-3 space-y-1.5"
          >
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-xs text-paseo-muted shrink-0 pt-0.5">{c.header}</span>
                <span className="text-left min-w-0 break-words">{c.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
