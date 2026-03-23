import { PanelLeft, PanelLeftClose } from 'lucide-react'
import UserMenu from '../UserMenu'

export default function LeftRail({
  activeRoute,
  banner,
  collapsed,
  navItems = [],
  onLogout,
  onRouteChange,
  onToggleCollapse,
  user
}) {
  const CollapseIcon = collapsed ? PanelLeft : PanelLeftClose

  return (
    <aside className={`workspace-sidebar${collapsed ? ' workspace-sidebar-collapsed' : ''}`}>
      <div className="workspace-sidebar-header">
        {!collapsed && <p className="workspace-wordmark">VOX</p>}
        <button
          className="workspace-collapse-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          <CollapseIcon size={16} />
        </button>
      </div>

      <nav aria-label="Primary" className="workspace-nav">
        {navItems.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              className={`workspace-nav-item${activeRoute === tab.key ? ' workspace-nav-item-active' : ''}`}
              key={tab.key}
              onClick={() => onRouteChange(tab.key)}
              title={collapsed ? tab.label : undefined}
              type="button"
            >
              <Icon size={16} />
              {!collapsed && <span>{tab.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="workspace-sidebar-spacer" />

      {!collapsed && banner}
      <hr className="workspace-nav-divider" />
      <UserMenu collapsed={collapsed} onLogout={onLogout} user={user} />
    </aside>
  )
}
