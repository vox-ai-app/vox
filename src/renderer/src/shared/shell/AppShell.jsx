import { useCallback, useEffect, useState } from 'react'
import LeftRail from './LeftRail'
import ToastLayer from './ToastLayer'

function AppShell({ activeRoute, children, onRouteChange }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.store.get('vox.sidebar.collapsed').then((value) => {
      if (!cancelled && typeof value === 'boolean') setCollapsed(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      window.api.store.set('vox.sidebar.collapsed', next)
      return next
    })
  }, [])

  return (
    <section className="workspace-shell" data-sidebar-collapsed={collapsed || undefined}>
      <div className={`workspace-layout${collapsed ? ' workspace-layout-collapsed' : ''}`}>
        <LeftRail
          activeRoute={activeRoute}
          collapsed={collapsed}
          onRouteChange={onRouteChange}
          onToggleCollapse={toggleCollapsed}
        />

        <main className="workspace-main">
          <div className="workspace-page">{children}</div>
        </main>
      </div>
      <ToastLayer />
    </section>
  )
}

export default AppShell
