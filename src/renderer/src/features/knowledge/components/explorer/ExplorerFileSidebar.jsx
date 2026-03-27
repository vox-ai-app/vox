import { X } from 'lucide-react'
import { formatBytes, formatIndexedTime, getStatusLabel } from './explorer.utils'

export default function ExplorerFileSidebar({ selectedFile, onClose }) {
  return (
    <>
      {selectedFile ? (
        <button
          aria-label="Close file info"
          className="indexed-file-sidebar-scrim"
          onClick={onClose}
          type="button"
        />
      ) : null}

      <aside className={`indexed-file-sidebar ${selectedFile ? 'is-open' : ''}`}>
        <div className="indexed-file-sidebar-header">
          <div>
            <p className="indexed-file-meta-kicker">Selected file</p>
            <p className="indexed-file-meta-name">{selectedFile?.name || 'No file selected'}</p>
          </div>

          <button
            aria-label="Close file info"
            className="secondary-button indexed-file-sidebar-close"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        {selectedFile ? (
          <dl className="indexed-file-meta-grid">
            <div>
              <dt>Status</dt>
              <dd>{getStatusLabel(selectedFile.status)}</dd>
            </div>

            <div>
              <dt>Type</dt>
              <dd>
                {selectedFile.fileKind === 'image'
                  ? 'Image'
                  : selectedFile.fileKind === 'text'
                    ? 'Text'
                    : 'Unsupported'}
              </dd>
            </div>

            <div>
              <dt>Size</dt>
              <dd>{formatBytes(selectedFile.size)}</dd>
            </div>

            <div>
              <dt>Indexed</dt>
              <dd>{formatIndexedTime(selectedFile.indexedAt)}</dd>
            </div>

            <div className="indexed-file-meta-path">
              <dt>Path</dt>
              <dd>{selectedFile.path}</dd>
            </div>

            {selectedFile.statusReason ? (
              <div className="indexed-file-meta-path">
                <dt>Reason</dt>
                <dd>{selectedFile.statusReason}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </aside>
    </>
  )
}
