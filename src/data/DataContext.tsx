import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadPaseoData, type DataSource } from './repository'
import { paseoData as fallback } from './mockData'
import type { PaseoData } from '../types'

interface DataContextValue {
  data: PaseoData
  source: DataSource
  loading: boolean
  error?: string
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataContextValue>({
    data: fallback,
    source: 'mock',
    loading: true,
  })

  useEffect(() => {
    let alive = true
    loadPaseoData().then((res) => {
      if (!alive) return
      setState({ data: res.data, source: res.source, loading: false, error: res.error })
    })
    return () => {
      alive = false
    }
  }, [])

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paseo-bg text-paseo-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-paseo-gold border-t-transparent animate-spin" />
          <span className="text-sm">טוען נתוני פסאו…</span>
        </div>
      </div>
    )
  }

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>
}

function useDataContext() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('usePaseo must be used within <DataProvider>')
  return ctx
}

/** מחזיר את נתוני הדשבורד (Supabase או Mock לפי הזמינות). */
export function usePaseo(): PaseoData {
  return useDataContext().data
}

/** מחזיר את מקור הנתונים הנוכחי — לתצוגת אינדיקציה בממשק. */
export function useDataSource(): { source: DataSource; error?: string } {
  const { source, error } = useDataContext()
  return { source, error }
}
