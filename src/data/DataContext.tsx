import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { loadPaseoData, type DataSource } from './repository'
import { paseoData as fallback } from './mockData'
import type { PaseoData } from '../types'

interface DataContextValue {
  data: PaseoData
  source: DataSource
  loading: boolean
  error?: string
  refresh: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const [state, setState] = useState<Omit<DataContextValue, 'refresh'>>({
    data: fallback,
    source: 'mock',
    loading: true,
  })

  const refresh = useCallback(async () => {
    const res = await loadPaseoData(demo)
    setState({ data: res.data, source: res.source, loading: false, error: res.error })
  }, [demo])

  useEffect(() => {
    let alive = true
    loadPaseoData(demo).then((res) => {
      if (!alive) return
      setState({ data: res.data, source: res.source, loading: false, error: res.error })
    })
    return () => {
      alive = false
    }
  }, [demo])

  if (state.loading) return <DashboardSkeleton />

  return <DataContext.Provider value={{ ...state, refresh }}>{children}</DataContext.Provider>
}

// שלד טעינה — תמונת דשבורד מהבהבת במקום ספינר בודד
function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-paseo-bg p-5">
      <div className="animate-pulse max-w-6xl mx-auto">
        <div className="h-7 w-40 rounded-lg bg-white/10 mb-2" />
        <div className="h-4 w-64 rounded bg-white/5 mb-6" />
        <div className="h-24 rounded-2xl bg-white/[0.06] border border-paseo-border mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/[0.06] border border-paseo-border" />
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 text-paseo-muted text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-paseo-gold border-t-transparent animate-spin" />
          טוען נתוני פסאו…
        </div>
      </div>
    </div>
  )
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

/** רענון הנתונים מהמקור — נקרא אחרי שמירה מטופס. */
export function useRefreshPaseo(): () => Promise<void> {
  return useDataContext().refresh
}
