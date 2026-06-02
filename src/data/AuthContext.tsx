import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

interface AuthValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    if (!supabase) throw new Error('Supabase לא מוגדר')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
  }

  return (
    <AuthCtx.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthCtx.Provider>
  )
}

export function useAuth(): AuthValue {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth must be used within <AuthProvider>')
  return c
}
