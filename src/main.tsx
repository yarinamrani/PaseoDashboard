import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { isSupabaseConfigured } from './data/supabaseClient'
import { AuthProvider, useAuth } from './data/AuthContext'
import { DataProvider } from './data/DataContext'
import { Login } from './pages/Login'
import { Layout } from './components/Layout'
import { OwnerControl } from './pages/OwnerControl'
import { CeoDashboard } from './pages/CeoDashboard'
import { WeeklyKpi } from './pages/WeeklyKpi'
import { Automations } from './pages/Automations'
import { Sales } from './pages/Sales'
import { Events } from './pages/Events'
import { Guests } from './pages/Guests'
import { Reviews } from './pages/Reviews'
import { Maintenance } from './pages/Maintenance'
import { Employees } from './pages/Employees'
import { Suppliers } from './pages/Suppliers'
import { Professionals } from './pages/Professionals'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <OwnerControl /> },
      { path: 'ceo', element: <CeoDashboard /> },
      { path: 'weekly', element: <WeeklyKpi /> },
      { path: 'automations', element: <Automations /> },
      { path: 'sales', element: <Sales /> },
      { path: 'events', element: <Events /> },
      { path: 'guests', element: <Guests /> },
      { path: 'reviews', element: <Reviews /> },
      { path: 'maintenance', element: <Maintenance /> },
      { path: 'professionals', element: <Professionals /> },
      { path: 'employees', element: <Employees /> },
      { path: 'suppliers', element: <Suppliers /> },
    ],
  },
], {
  // תומך גם בהרצה מקומית (base '/') וגם בפרסום ל-GitHub Pages תחת תת-נתיב
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paseo-bg text-paseo-muted">
      <div className="h-8 w-8 rounded-full border-2 border-paseo-gold border-t-transparent animate-spin" />
    </div>
  )
}

// שער כניסה: ללא Supabase מוגדר -> ישר לדשבורד (דמה). עם Supabase -> דורש התחברות,
// עם אפשרות "מצב דמה" שעוקף את ההתחברות ומשתמש בנתוני דמה בלבד.
function Gate() {
  const { session, loading } = useAuth()
  const [demo, setDemo] = useState(false)

  if (!isSupabaseConfigured) {
    return (
      <DataProvider>
        <RouterProvider router={router} />
      </DataProvider>
    )
  }
  if (loading) return <Spinner />
  if (!session && !demo) return <Login onDemo={() => setDemo(true)} />

  return (
    <DataProvider demo={demo}>
      <RouterProvider router={router} />
    </DataProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </React.StrictMode>,
)
