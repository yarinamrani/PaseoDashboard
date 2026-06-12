import { useState, type FormEvent } from 'react'
import { LogIn, FlaskConical } from 'lucide-react'
import { useAuth } from '../data/AuthContext'

export function Login({ onDemo }: { onDemo?: () => void }) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paseo-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-black text-paseo-gold">פסאו</div>
          <div className="text-sm text-paseo-muted mt-1">דשבורד ניהולי</div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-paseo-border bg-paseo-surface p-6 space-y-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-paseo-muted">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              required
              autoFocus
              className="w-full rounded-lg border border-paseo-border bg-paseo-bg px-3 py-2 text-sm text-paseo-text outline-none focus:border-paseo-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-paseo-muted">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              required
              className="w-full rounded-lg border border-paseo-border bg-paseo-bg px-3 py-2 text-sm text-paseo-text outline-none focus:border-paseo-gold"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-paseo-red/30 bg-paseo-red/10 px-3 py-2 text-xs text-paseo-red">
              התחברות נכשלה: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-paseo-gold px-4 py-2.5 text-sm font-bold text-paseo-bg hover:brightness-110 disabled:opacity-50 transition"
          >
            <LogIn size={16} />
            {busy ? 'מתחבר…' : 'כניסה'}
          </button>
        </form>

        {onDemo && (
          <button
            onClick={onDemo}
            className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-paseo-muted hover:text-paseo-text transition-colors"
          >
            <FlaskConical size={12} />
            המשך במצב דמה (ללא נתונים אמיתיים)
          </button>
        )}
      </div>
    </div>
  )
}
