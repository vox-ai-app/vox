import { useState } from 'react'
import { Trash2, ToggleLeft, ToggleRight, X, Pencil } from 'lucide-react'
import { TYPE_BADGE, TYPE_LABELS } from './ToolList.constants'

export function SkeletonRow() {
  return (
    <div className="tools-row tools-cols tools-skel">
      <span className="tools-skel-bar" style={{ width: 110, height: 13 }} />
      <span className="tools-skel-bar" style={{ width: 46, height: 18, borderRadius: 999 }} />
      <span className="tools-skel-bar" style={{ flex: 1, height: 13, maxWidth: 280 }} />
      <span />
    </div>
  )
}

export function ToolRow({ tool, onDelete, onToggle, onEdit }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className={`tools-row tools-cols${tool.is_enabled ? '' : ' tools-row-disabled'}`}>
      <span className="tools-row-name">{tool.name}</span>
      <span className={`tools-badge tools-badge-${TYPE_BADGE[tool.source_type] ?? ''}`}>
        {TYPE_LABELS[tool.source_type] ?? tool.source_type}
      </span>
      <span className="tools-row-desc">{tool.description}</span>
      <div className="tools-row-actions">
        <button
          className={`tools-toggle${tool.is_enabled ? ' tools-toggle-on' : ''}`}
          onClick={() => onToggle(tool.id, !tool.is_enabled)}
          title={tool.is_enabled ? 'Disable' : 'Enable'}
          type="button"
        >
          {tool.is_enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>
        <button className="tools-icon-btn" onClick={() => onEdit(tool)} title="Edit" type="button">
          <Pencil size={13} />
        </button>
        {confirming ? (
          <>
            <button className="tools-confirm-chip" onClick={() => onDelete(tool.id)} type="button">
              Delete?
            </button>
            <button className="tools-icon-btn" onClick={() => setConfirming(false)} type="button">
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            className="tools-icon-btn tools-icon-btn-danger"
            onClick={() => setConfirming(true)}
            title="Delete"
            type="button"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
