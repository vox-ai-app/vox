import {
  BookOpen,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Radio,
  Settings,
  Wrench,
  Zap
} from 'lucide-react'
import { APP_ROUTES } from '../../app/route-config'

const PRIMARY_TABS = [
  { key: APP_ROUTES.CHAT, label: 'Chat', icon: MessageSquare },
  { key: APP_ROUTES.ACTIVITY, label: 'Activity', icon: Zap },
  { key: APP_ROUTES.KNOWLEDGE, label: 'Knowledge', icon: BookOpen },
  { key: APP_ROUTES.TOOLS, label: 'Tools', icon: Wrench },
  { key: APP_ROUTES.CHANNELS, label: 'Channels', icon: Radio },
  { key: APP_ROUTES.SETTINGS, label: 'Settings', icon: Settings }
]

function LeftRail({ activeRoute, collapsed, onRouteChange, onToggleCollapse }) {
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
        {PRIMARY_TABS.map((tab) => {
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

      <hr className="workspace-nav-divider" />
      <div className="workspace-profile-menu">
        <div className={`workspace-user-row${collapsed ? ' workspace-user-row-collapsed' : ''}`}>
          <div className="workspace-user-avatar">V</div>
          {!collapsed && <span className="workspace-user-name">Vox Local</span>}
        </div>
      </div>
    </aside>
  )
}

export default LeftRail
