import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'

const getInitials = (user) => {
  const firstName = String(user?.firstName || '').trim()
  const lastName = String(user?.lastName || '').trim()

  if (firstName || lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'VX'
  }

  return String(user?.email || 'VX')
    .slice(0, 2)
    .toUpperCase()
}

export default function UserMenu({ collapsed, onLogout, user }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Vox User'

  useEffect(() => {
    if (!open) return undefined

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }

    window.addEventListener('mousedown', closeOnOutsideClick)
    return () => window.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open])

  const logout = async () => {
    setOpen(false)
    await onLogout?.()
  }

  if (collapsed) {
    return (
      <div className="workspace-profile-menu workspace-profile-menu-collapsed">
        <div className="workspace-user-row workspace-user-row-collapsed" title={displayName}>
          <div className="workspace-user-avatar">{getInitials(user)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-profile-menu" ref={menuRef}>
      <button
        className="workspace-user-row"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <div className="workspace-user-avatar">{getInitials(user)}</div>
        <span className="workspace-user-name">{displayName}</span>
      </button>

      {open ? (
        <div className="workspace-profile-dropdown">
          <button className="workspace-profile-danger" onClick={logout} type="button">
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
