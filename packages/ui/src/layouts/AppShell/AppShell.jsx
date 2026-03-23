import { useCallback, useState } from 'react'
import { ToastLayer } from '../../primitives/Toast'

export default function AppShell({
  activeRoute,
  children,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapseChange,
  sidebar,
  toasts,
  onDismissToast
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed)
  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    if (controlledCollapsed === undefined) setInternalCollapsed(next)
    onCollapseChange?.(next)
  }, [collapsed, controlledCollapsed, onCollapseChange])

  const sidebarElement = typeof sidebar === 'function'
    ? sidebar({ collapsed, onToggleCollapse: toggleCollapsed })
    : sidebar

  return (
    <section className="workspace-shell" data-sidebar-collapsed={collapsed || undefined}>
      <div className={`workspace-layout${collapsed ? ' workspace-layout-collapsed' : ''}`}>
        {sidebarElement}
        <main className="workspace-main">
          <div className="workspace-page">{children}</div>
        </main>
      </div>
      {toasts && onDismissToast && (
        <ToastLayer toasts={toasts} onDismiss={onDismissToast} />
      )}
    </section>
  )
}
