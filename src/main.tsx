import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './data/AuthContext'
import { AuthGate } from './components/AuthGate'
import { DataProvider } from './data/DataContext'
import { Layout } from './components/Layout'
import { OwnerControl } from './pages/OwnerControl'
import { CeoDashboard } from './pages/CeoDashboard'
import { WeeklyKpi } from './pages/WeeklyKpi'
import { Automations } from './pages/Automations'
import { Sales } from './pages/Sales'
import { Menu } from './pages/Menu'
import { Events } from './pages/Events'
import { Guests } from './pages/Guests'
import { Marketing } from './pages/Marketing'
import { Reviews } from './pages/Reviews'
import { Maintenance } from './pages/Maintenance'
import { Employees } from './pages/Employees'
import { Suppliers } from './pages/Suppliers'
import { Purchasing } from './pages/Purchasing'
import { Recipes } from './pages/Recipes'
import { Professionals } from './pages/Professionals'
import { Tasks } from './pages/Tasks'

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
      { path: 'menu', element: <Menu /> },
      { path: 'events', element: <Events /> },
      { path: 'guests', element: <Guests /> },
      { path: 'marketing', element: <Marketing /> },
      { path: 'reviews', element: <Reviews /> },
      { path: 'maintenance', element: <Maintenance /> },
      { path: 'professionals', element: <Professionals /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'employees', element: <Employees /> },
      { path: 'suppliers', element: <Suppliers /> },
      { path: 'purchasing', element: <Purchasing /> },
      { path: 'recipes', element: <Recipes /> },
    ],
  },
], {
  // תומך גם בהרצה מקומית (base '/') וגם בפרסום ל-GitHub Pages תחת תת-נתיב
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})

// שכבת הנתונים (DataProvider) ממוקמת בתוך ה-AuthGate בכוונה: היא נטענת ומריצה
// שליפות רק כשיש session מאומת, כך שהקריאות יוצאות עם ה-role 'authenticated'.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <DataProvider>
          <RouterProvider router={router} />
        </DataProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)

// רישום Service Worker ל-PWA (התקנה במסך הבית + אופליין בסיסי)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {})
  })
}
