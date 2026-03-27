import { FileText, Folder } from 'lucide-react'

export default function ExplorerTile({
  variant,
  label,
  subtitle,
  status,
  selected,
  onClick,
  title
}) {
  const isDirectory = variant === 'directory' || variant === 'root'

  const rowClass = ['knowledge-file-row', selected ? 'knowledge-file-row-selected' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <button className={rowClass} onClick={onClick} title={title} type="button">
      <span
        aria-hidden="true"
        className={`knowledge-file-icon ${isDirectory ? 'knowledge-file-icon-folder' : 'knowledge-file-icon-file'}`}
      >
        {isDirectory ? <Folder size={14} /> : <FileText size={13} />}
      </span>

      <span className="knowledge-file-body">
        <span className="knowledge-file-name">{label}</span>
        {variant === 'root' && (
          <span className="knowledge-file-sub" title={subtitle}>
            {subtitle}
          </span>
        )}
      </span>

      {variant !== 'root' && (
        <span className={`knowledge-file-status knowledge-file-status-${status || 'not_indexed'}`}>
          {subtitle}
        </span>
      )}
    </button>
  )
}
