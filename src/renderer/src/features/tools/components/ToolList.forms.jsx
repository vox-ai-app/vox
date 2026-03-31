import { useState } from 'react'
import { ChevronDown, KeyRound, X } from 'lucide-react'
import { CODE_PLACEHOLDERS, PARAM_TYPES, TYPE_BADGE, TYPE_LABELS } from './ToolList.constants'

const ipc = window.electron?.ipcRenderer
const invoke = (ch, p) => ipc?.invoke(ch, p).then((r) => r.data)

function Secrets({ secrets, onChange }) {
  const [open, setOpen] = useState(false)
  const add = () => {
    setOpen(true)
    onChange([...secrets, { key: '', value: '' }])
  }
  const remove = (i) => onChange(secrets.filter((_, idx) => idx !== i))
  const upd = (i, k, v) => onChange(secrets.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)))

  return (
    <div className="tf-accordion">
      <button className="tf-acc-trigger" onClick={() => setOpen((o) => !o)} type="button">
        <KeyRound size={11} />
        <span>Secrets</span>
        {secrets.length > 0 && <span className="tf-count">{secrets.length}</span>}
        <ChevronDown className={`tf-chevron${open ? ' tf-chevron-open' : ''}`} size={13} />
      </button>
      {open && (
        <div className="tf-acc-body">
          {secrets.map((s, i) => (
            <div className="tf-secret" key={i}>
              <input
                className="tf-input-sm tf-mono"
                onChange={(e) => upd(i, 'key', e.target.value)}
                placeholder="KEY"
                value={s.key}
              />

              <input
                className="tf-input-sm"
                onChange={(e) => upd(i, 'value', e.target.value)}
                placeholder="value"
                type="password"
                value={s.value}
              />

              <button className="tf-del" onClick={() => remove(i)} type="button">
                <X size={10} />
              </button>
            </div>
          ))}
          <button className="tf-add" onClick={add} type="button">
            + secret
          </button>
        </div>
      )}
    </div>
  )
}

function Parameters({ params, onChange }) {
  const [open, setOpen] = useState(false)
  const add = () => {
    setOpen(true)
    onChange([...params, { name: '', type: 'string', description: '', required: false }])
  }
  const remove = (i) => onChange(params.filter((_, idx) => idx !== i))
  const upd = (i, k, v) => onChange(params.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)))

  return (
    <div className="tf-accordion">
      <button className="tf-acc-trigger" onClick={() => setOpen((o) => !o)} type="button">
        <span>Parameters</span>
        {params.length > 0 && <span className="tf-count">{params.length}</span>}
        <ChevronDown className={`tf-chevron${open ? ' tf-chevron-open' : ''}`} size={13} />
      </button>
      {open && (
        <div className="tf-acc-body">
          {params.map((p, i) => (
            <div className="tf-param" key={i}>
              <div className="tf-param-top">
                <input
                  className="tf-input-sm tf-mono"
                  onChange={(e) => upd(i, 'name', e.target.value)}
                  placeholder="name"
                  value={p.name}
                />

                <select
                  className="tf-select"
                  onChange={(e) => upd(i, 'type', e.target.value)}
                  value={p.type}
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className={`tf-req${p.required ? ' tf-req-on' : ''}`}
                  onClick={() => upd(i, 'required', !p.required)}
                  title="Toggle required"
                  type="button"
                >
                  req
                </button>
                <button className="tf-del" onClick={() => remove(i)} type="button">
                  <X size={10} />
                </button>
              </div>
              <input
                className="tf-input-sm tf-param-desc"
                onChange={(e) => upd(i, 'description', e.target.value)}
                placeholder="description"
                value={p.description}
              />
            </div>
          ))}
          <button className="tf-add" onClick={add} type="button">
            + parameter
          </button>
        </div>
      )}
    </div>
  )
}

function paramsFromSchema(schema) {
  if (!schema) return []
  if (Array.isArray(schema)) return schema
  if (typeof schema !== 'object') return []
  const { properties = {}, required = [] } = schema
  return Object.entries(properties).map(([name, def]) => ({
    name,
    type: def.type ?? 'string',
    description: def.description ?? '',
    required: required.includes(name)
  }))
}

function paramsToSchema(params) {
  if (!params || params.length === 0) return undefined
  const properties = {}
  const required = []
  for (const p of params) {
    if (!p.name?.trim()) continue
    properties[p.name] = { type: p.type || 'string', description: p.description || '' }
    if (p.required) required.push(p.name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

export function AddForm({ onClose, onCreate }) {
  const [f, setF] = useState({
    name: '',
    description: '',
    source_type: 'js_function',
    source_code: '',
    webhook_url: '',
    tags: ''
  })
  const [params, setParams] = useState([])
  const [secrets, setSecrets] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const validParams = params.filter((p) => p.name.trim())
      const tool = await onCreate({
        name: f.name.trim(),
        description: f.description.trim(),
        source_type: f.source_type,
        source_code:
          f.source_type === 'js_function' || f.source_type === 'desktop'
            ? f.source_code
            : undefined,
        webhook_url: f.source_type === 'http_webhook' ? f.webhook_url.trim() : undefined,
        tags: f.tags
          ? f.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        parameters: paramsToSchema(validParams)
      })
      const pending = secrets.filter((s) => s.key.trim() && s.value)
      if (tool?.id && pending.length) {
        await Promise.all(
          pending.map((s) =>
            invoke('tools:secrets:upsert', { id: tool.id, key: s.key.trim(), value: s.value })
          )
        )
      }
      onClose()
    } catch (e) {
      setErr(e?.message || 'Failed to create tool')
    } finally {
      setSaving(false)
    }
  }

  const TYPES = [
    { value: 'js_function', label: 'JS' },
    { value: 'http_webhook', label: 'Webhook' },
    { value: 'desktop', label: 'Desktop' }
  ]

  return (
    <form className="tf" onSubmit={submit}>
      <input
        autoFocus
        className="tf-input tf-mono"
        onChange={set('name')}
        placeholder="tool_name"
        required
        value={f.name}
      />

      <textarea
        className="tf-input tf-desc"
        onChange={set('description')}
        placeholder="What this tool does — the agent reads this to decide when to call it"
        required
        rows={2}
        value={f.description}
      />

      <div className="tf-types">
        {TYPES.map((t) => (
          <button
            className={`tf-type${f.source_type === t.value ? ' tf-type-on' : ''}`}
            key={t.value}
            onClick={() => setF((p) => ({ ...p, source_type: t.value }))}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {(f.source_type === 'js_function' || f.source_type === 'desktop') && (
        <textarea
          className="tf-input tf-code"
          onChange={set('source_code')}
          placeholder={CODE_PLACEHOLDERS[f.source_type]}
          rows={7}
          value={f.source_code}
        />
      )}
      {f.source_type === 'http_webhook' && (
        <input
          className="tf-input"
          onChange={set('webhook_url')}
          placeholder="https://hooks.example.com/…"
          type="url"
          value={f.webhook_url}
        />
      )}

      <input
        className="tf-input tf-tags"
        onChange={set('tags')}
        placeholder="tags, comma-separated (optional)"
        value={f.tags}
      />

      <Parameters onChange={setParams} params={params} />
      <Secrets onChange={setSecrets} secrets={secrets} />

      {err && <p className="tf-err">{err}</p>}
      <button className="tf-submit" disabled={saving} type="submit">
        {saving ? 'Creating…' : 'Create Tool'}
      </button>
    </form>
  )
}

export function EditToolForm({ tool, onUpdate, onClose }) {
  const [f, setF] = useState({
    description: tool.description ?? '',
    source_code: tool.source_code ?? '',
    webhook_url: tool.webhook_url ?? '',
    tags: Array.isArray(tool.tags) ? tool.tags.join(', ') : (tool.tags ?? '')
  })
  const [params, setParams] = useState(() => paramsFromSchema(tool.parameters))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const data = { description: f.description.trim() }
      if (tool.source_type === 'js_function' || tool.source_type === 'desktop') {
        data.source_code = f.source_code
      }
      if (tool.source_type === 'http_webhook') data.webhook_url = f.webhook_url.trim()
      data.tags = f.tags
        ? f.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : []
      if (tool.source_type !== 'mcp' && tool.source_type !== 'desktop') {
        const validParams = params.filter((p) => p.name.trim())
        data.parameters = paramsToSchema(validParams) ?? {}
      }
      await onUpdate(tool.id, data)
      onClose()
    } catch (e) {
      setErr(e?.message || 'Failed to update tool')
    } finally {
      setSaving(false)
    }
  }

  const typeBadge = TYPE_BADGE[tool.source_type] ?? ''
  const typeLabel = TYPE_LABELS[tool.source_type] ?? tool.source_type

  return (
    <form className="tf" onSubmit={submit}>
      <div className="tf-identity">
        <span className="tf-identity-name">{tool.name}</span>
        <span className={`tools-badge tools-badge-${typeBadge}`}>{typeLabel}</span>
      </div>

      <textarea
        className="tf-input tf-desc"
        onChange={set('description')}
        placeholder="What this tool does"
        required
        rows={2}
        value={f.description}
      />

      {(tool.source_type === 'js_function' || tool.source_type === 'desktop') && (
        <textarea
          className="tf-input tf-code"
          onChange={set('source_code')}
          placeholder={CODE_PLACEHOLDERS[tool.source_type]}
          rows={10}
          value={f.source_code}
        />
      )}
      {tool.source_type === 'http_webhook' && (
        <input
          className="tf-input"
          onChange={set('webhook_url')}
          placeholder="https://…"
          type="url"
          value={f.webhook_url}
        />
      )}
      {tool.source_type === 'mcp' && (
        <p className="tf-mcp-notice">
          Managed by an MCP server — edit the server to change this tool.
        </p>
      )}

      {tool.source_type !== 'mcp' && tool.source_type !== 'desktop' && (
        <Parameters onChange={setParams} params={params} />
      )}

      {err && <p className="tf-err">{err}</p>}
      <button className="tf-submit" disabled={saving} type="submit">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
