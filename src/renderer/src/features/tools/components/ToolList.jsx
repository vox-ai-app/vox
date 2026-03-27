import { useCallback, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import Drawer from '../../../shared/components/Drawer'
import { AddForm, EditToolForm } from './ToolList.forms'
import { SkeletonRow, ToolRow } from './ToolList.rows'

export function ToolList({
  tools,
  hasMore,
  loading,
  searching,
  query,
  error,
  onQueryChange,
  onLoadMore,
  onCreate,
  onUpdate,
  onDelete,
  onToggle
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const observerRef = useRef(null)

  const observeSentinel = useCallback(
    (el) => {
      if (observerRef.current) observerRef.current.disconnect()
      if (!el) return
      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) onLoadMore()
        },
        { threshold: 0.1 }
      )
      observerRef.current.observe(el)
    },
    [onLoadMore]
  )

  const showSkeleton = loading && tools.length === 0
  const showEmpty = !loading && tools.length === 0

  return (
    <div className="tools-panel">
      <div className="tools-toolbar">
        <div className="tools-search-wrap">
          <Search size={13} />
          <input
            className="tools-search"
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search tools…"
            value={query}
          />

          {searching && <span className="tools-search-spinner" />}
        </div>
        <button className="tools-primary-btn" onClick={() => setDrawerOpen(true)} type="button">
          <Plus size={13} /> Add Tool
        </button>
      </div>

      {error && <p className="tools-error-bar">{error}</p>}

      <div className="tools-table">
        {(showSkeleton || tools.length > 0) && (
          <div className="tools-thead tools-cols">
            <span className="tools-th">Name</span>
            <span className="tools-th">Type</span>
            <span className="tools-th">Description</span>
            <span />
          </div>
        )}
        <div className="tools-tbody">
          {showSkeleton && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)}
          {showEmpty && (
            <p className="tools-empty">No tools yet. Add one or connect an MCP server.</p>
          )}
          {tools.map((t) => (
            <ToolRow
              key={t.id}
              onDelete={onDelete}
              onEdit={setEditingTool}
              onToggle={onToggle}
              tool={t}
            />
          ))}
          {hasMore && !query && <div className="tools-sentinel" ref={observeSentinel} />}
          {loading && tools.length > 0 && <p className="tools-load-more">Loading…</p>}
        </div>
      </div>

      <Drawer onClose={() => setDrawerOpen(false)} open={drawerOpen} title="New Tool" width="460px">
        {drawerOpen && <AddForm onClose={() => setDrawerOpen(false)} onCreate={onCreate} />}
      </Drawer>

      <Drawer
        onClose={() => setEditingTool(null)}
        open={editingTool !== null}
        title={editingTool ? `Edit · ${editingTool.name}` : 'Edit Tool'}
        width="460px"
      >
        {editingTool && (
          <EditToolForm
            onClose={() => setEditingTool(null)}
            onUpdate={onUpdate}
            tool={editingTool}
          />
        )}
      </Drawer>
    </div>
  )
}
