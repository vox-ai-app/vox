import { useState } from 'react'
import { RefreshCw, Trash2, Plus, X, Pencil, AlertCircle } from 'lucide-react'
import Drawer from '../../../shared/components/Drawer'

const TRANSPORT_LABELS = { stdio: 'stdio', sse: 'SSE', http: 'HTTP' }

function SkeletonRow() {
  return (
    <div className="tools-row tools-cols tools-skel">
      <span className="tools-skel-bar" style={{ width: 110, height: 13 }} />
      <span className="tools-skel-bar" style={{ width: 46, height: 18, borderRadius: 999 }} />
      <span className="tools-skel-bar" style={{ flex: 1, height: 13, maxWidth: 200 }} />
      <span />
    </div>
  )
}

function McpRow({ server, onRemove, onSync, syncing, onEdit, syncError }) {
  const [confirming, setConfirming] = useState(false)
  const spinning = syncing === server.id
  return (
    <div className="tools-row tools-cols">
      <span className="tools-row-name">{server.name}</span>
      <span className={`tools-badge tools-badge-${server.transport}`}>
        {TRANSPORT_LABELS[server.transport] ?? server.transport}
      </span>
      <span className={`tools-row-desc${syncError ? ' tools-row-desc-error' : ''}`}>
        {syncError ? (
          <>
            <AlertCircle
              size={12}
              style={{ marginRight: 5, flexShrink: 0, verticalAlign: 'middle' }}
            />

            {syncError}
          </>
        ) : server.last_synced_at ? (
          `Synced ${new Date(server.last_synced_at).toLocaleString()}`
        ) : (
          'Never synced'
        )}
      </span>
      <div className="tools-row-actions">
        <button
          className="tools-icon-btn"
          disabled={spinning}
          onClick={() => onSync(server.id)}
          title="Sync tools"
          type="button"
        >
          <RefreshCw className={spinning ? 'tools-spin' : ''} size={13} />
        </button>
        <button
          className="tools-icon-btn"
          onClick={() => onEdit(server)}
          title="Edit"
          type="button"
        >
          <Pencil size={13} />
        </button>
        {confirming ? (
          <>
            <button
              className="tools-confirm-chip"
              onClick={() => onRemove(server.id)}
              type="button"
            >
              Remove?
            </button>
            <button className="tools-icon-btn" onClick={() => setConfirming(false)} type="button">
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            className="tools-icon-btn tools-icon-btn-danger"
            onClick={() => setConfirming(true)}
            title="Remove"
            type="button"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

function ConnectMcpForm({ onCreate, onClose }) {
  const [form, setForm] = useState({
    name: '',
    transport: 'stdio',
    command: '',
    url: '',
    auth_header: ''
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      await onCreate({
        name: form.name.trim(),
        transport: form.transport,
        command: form.transport === 'stdio' ? form.command.trim() : undefined,
        url: form.transport !== 'stdio' ? form.url.trim() : undefined,
        auth_header: form.auth_header.trim() || undefined
      })
      onClose()
    } catch (e) {
      setErr(e?.message || 'Failed to connect server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="tform" onSubmit={submit}>
      <input
        className="tform-input"
        onChange={set('name')}
        placeholder="Server name"
        required
        value={form.name}
      />

      <div className="tform-seg">
        {[
          { value: 'stdio', label: 'stdio', sub: 'local process' },
          { value: 'sse', label: 'SSE', sub: 'streaming' },
          { value: 'http', label: 'HTTP', sub: 'stateless' }
        ].map((t) => (
          <button
            className={`tform-seg-btn${form.transport === t.value ? ' tform-seg-btn-active' : ''}`}
            key={t.value}
            onClick={() => setForm((f) => ({ ...f, transport: t.value }))}
            type="button"
          >
            {t.label}
            <span className="tform-seg-sub">{t.sub}</span>
          </button>
        ))}
      </div>
      {form.transport === 'stdio' ? (
        <input
          className="tform-input tform-mono"
          onChange={set('command')}
          placeholder="npx -y @modelcontextprotocol/server-git"
          required
          value={form.command}
        />
      ) : (
        <input
          className="tform-input"
          onChange={set('url')}
          placeholder="https://mcp.example.com"
          required
          type="url"
          value={form.url}
        />
      )}
      <input
        className="tform-input"
        onChange={set('auth_header')}
        placeholder="Auth token (optional)"
        type="password"
        value={form.auth_header}
      />

      {err && <p className="tform-err">{err}</p>}
      <button disabled={saving} type="submit">
        {saving ? 'Connecting…' : 'Connect Server'}
      </button>
    </form>
  )
}

function EditMcpForm({ server, onUpdate, onClose }) {
  const [form, setForm] = useState({
    name: server.name ?? '',
    command: server.command ?? '',
    url: server.url ?? '',
    auth_header: ''
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const data = { name: form.name.trim() }
      if (server.transport === 'stdio') data.command = form.command.trim()
      else data.url = form.url.trim()
      if (form.auth_header.trim()) data.auth_header = form.auth_header.trim()
      await onUpdate(server.id, data)
      onClose()
    } catch (e) {
      setErr(e?.message || 'Failed to update server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="tform" onSubmit={submit}>
      <input
        className="tform-input"
        onChange={set('name')}
        placeholder="Server name"
        required
        value={form.name}
      />

      {server.transport === 'stdio' ? (
        <input
          className="tform-input tform-mono"
          onChange={set('command')}
          placeholder="Command"
          required
          value={form.command}
        />
      ) : (
        <input
          className="tform-input"
          onChange={set('url')}
          placeholder="Server URL"
          required
          type="url"
          value={form.url}
        />
      )}
      <input
        className="tform-input"
        onChange={set('auth_header')}
        placeholder="Auth token (leave blank to keep)"
        type="password"
        value={form.auth_header}
      />

      {err && <p className="tform-err">{err}</p>}
      <button disabled={saving} type="submit">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}

export function McpPanel({
  servers,
  loading,
  syncing,
  syncErrors = {},
  error,
  onCreate,
  onRemove,
  onSync,
  onUpdate
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingServer, setEditingServer] = useState(null)
  const showSkeleton = loading && servers.length === 0
  const showEmpty = !loading && servers.length === 0

  return (
    <div className="tools-panel">
      <div className="tools-toolbar">
        <span style={{ flex: 1 }} />
        <button className="tools-primary-btn" onClick={() => setDrawerOpen(true)} type="button">
          <Plus size={13} /> Connect Server
        </button>
      </div>

      {error && <p className="tools-error-bar">{error}</p>}

      <div className="tools-table">
        {(showSkeleton || servers.length > 0) && (
          <div className="tools-thead tools-cols">
            <span className="tools-th">Name</span>
            <span className="tools-th">Transport</span>
            <span className="tools-th">Last Synced</span>
            <span />
          </div>
        )}
        <div className="tools-tbody">
          {showSkeleton && Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} />)}
          {showEmpty && (
            <p className="tools-empty">
              No MCP servers connected. Connect one to import its tools automatically.
            </p>
          )}
          {servers.map((s) => (
            <McpRow
              key={s.id}
              onEdit={setEditingServer}
              onRemove={onRemove}
              onSync={onSync}
              server={s}
              syncError={syncErrors[s.id]}
              syncing={syncing}
            />
          ))}
        </div>
      </div>

      <Drawer
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Connect MCP Server"
        width="420px"
      >
        {drawerOpen && <ConnectMcpForm onClose={() => setDrawerOpen(false)} onCreate={onCreate} />}
      </Drawer>

      <Drawer
        onClose={() => setEditingServer(null)}
        open={editingServer !== null}
        title="Edit MCP Server"
        width="420px"
      >
        {editingServer && (
          <EditMcpForm
            onClose={() => setEditingServer(null)}
            onUpdate={onUpdate}
            server={editingServer}
          />
        )}
      </Drawer>
    </div>
  )
}
