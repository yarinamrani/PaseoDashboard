import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// קוראים את פרטי החיבור ממשתני סביבה (Vite). אם הם חסרים — נחזיר null
// והאפליקציה תיפול חזרה לנתוני דמה (Mock). כך הדשבורד תמיד עובד.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
