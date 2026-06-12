import { type ReactNode } from 'react'
import { useAuth } from '../data/AuthContext'
import { isSupabaseConfigured } from '../data/supabaseClient'
import { Login } from '../pages/Login'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paseo-bg text-paseo-muted">
      <div className="h-8 w-8 rounded-full border-2 border-paseo-gold border-t-transparent animate-spin" />
    </div>
  )
}

/**
 * שער אימות: עוטף את כל האפליקציה.
 * שכבת הנתונים (DataProvider) נטענת רק אחרי שיש session מאומת — כך אין שליפה
 * כ-anon (שחסום עכשיו ב-RLS) ולא נופלים בשקט ל-Mock בגלל חוסר הרשאה.
 *
 * - בטעינה: AuthContext קורא ל-supabase.auth.getSession ומאזין ל-onAuthStateChange.
 * - אין session -> מסך התחברות.
 * - יש session -> מציג את הדשבורד (children).
 * - Supabase לא מוגדר -> ממשיך ישר (שכבת הנתונים תרוץ ב-Mock לפי ה-fallback הקיים).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (!isSupabaseConfigured) return <>{children}</>
  if (loading) return <Spinner />
  if (!session) return <Login />
  return <>{children}</>
}
