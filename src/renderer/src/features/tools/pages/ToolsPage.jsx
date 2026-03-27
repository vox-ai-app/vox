import { useState, useCallback } from 'react'
import { ToolList } from '../components/ToolList'
import { McpPanel } from '../components/McpPanel'
import { useToolsStore, useMcpStore } from '../hooks/useToolsStore'

const TABS = [
  { key: 'tools', label: 'My Tools' },
  { key: 'mcp', label: 'MCP Servers' }
]

function ToolsPage() {
  const [tab, setTab] = useState('tools')

  const {
    tools,
    hasMore,
    loading,
    searching,
    query,
    error,
    handleQueryChange,
    loadMore,
    fetchPage,
    createTool,
    updateTool,
    deleteTool,
    toggleTool
  } = useToolsStore()

  const {
    servers,
    loading: mcpLoading,
    syncing,
    error: mcpError,
    syncErrors,
    create: createServer,
    remove: removeServer,
    update: updateServer,
    sync: syncServer
  } = useMcpStore()

  const handleSync = useCallback(
    (id) => syncServer(id, () => fetchPage(null, true)),
    [syncServer, fetchPage]
  )

  return (
    <section className="tools-page">
      <div className="tools-page-header">
        <h1 className="tools-page-title">Tools</h1>
      </div>

      <nav className="tools-tabs" aria-label="Tools sections">
        {TABS.map((t) => (
          <button
            className={`tools-tab${tab === t.key ? ' tools-tab-active' : ''}`}
            key={t.key}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'tools' && (
        <ToolList
          error={error}
          hasMore={hasMore}
          loading={loading}
          onCreate={createTool}
          onDelete={deleteTool}
          onLoadMore={loadMore}
          onQueryChange={handleQueryChange}
          onToggle={toggleTool}
          onUpdate={updateTool}
          query={query}
          searching={searching}
          tools={tools}
        />
      )}

      {tab === 'mcp' && (
        <McpPanel
          error={mcpError}
          loading={mcpLoading}
          onCreate={createServer}
          onRemove={removeServer}
          onSync={handleSync}
          onUpdate={updateServer}
          servers={servers}
          syncErrors={syncErrors}
          syncing={syncing}
        />
      )}
    </section>
  )
}

export default ToolsPage
