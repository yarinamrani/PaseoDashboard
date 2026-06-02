import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { DataProvider } from './data/DataContext'
import { Layout } from './components/Layout'
import { OwnerControl } from './pages/OwnerControl'
import { CeoDashboard } from './pages/CeoDashboard'
import { WeeklyKpi } from './pages/WeeklyKpi'
import { Automations } from './pages/Automations'
import { Sales } from './pages/Sales'
import { Events } from './pages/Events'
import { Marketing } from './pages/Marketing'
import { Reviews } from './pages/Reviews'
import { Maintenance } from './pages/Maintenance'
import { Employees } from './pages/Employees'
import { Suppliers } from './pages/Suppliers'

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
      { path: 'marketing', element: <Marketing /> },
      { path: 'reviews', element: <Reviews /> },
      { path: 'maintenance', element: <Maintenance /> },
      { path: 'employees', element: <Employees /> },
      { path: 'suppliers', element: <Suppliers /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataProvider>
      <RouterProvider router={router} />
    </DataProvider>
  </React.StrictMode>,
)
