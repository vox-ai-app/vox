import { useEffect, useRef } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import ExplorerTile from './explorer/ExplorerTile'
import ExplorerFileSidebar from './explorer/ExplorerFileSidebar'
import { useIndexedExplorer } from '../hooks/useIndexedExplorer'

function IndexedFilesExplorer({ folders, onGetIndexedChildren, lastReconciledAt }) {
  const {
    selectedFile,
    setSelectedFile,
    selectedRoot,
    explorerItems,
    activeNodeState,
    isLoadingRootData,
    canGoBack,
    currentTitle,
    currentPathDescription,
    handleOpenRoot,
    handleOpenDirectory,
    handleGoBack,
    handleRefresh,
    getPathLabel,
    getStatusLabel
  } = useIndexedExplorer({ folders, onGetIndexedChildren })

  const prevReconciledAtRef = useRef(lastReconciledAt)
  useEffect(() => {
    if (lastReconciledAt && lastReconciledAt !== prevReconciledAtRef.current) {
      prevReconciledAtRef.current = lastReconciledAt
      handleRefresh()
    }
  }, [lastReconciledAt, handleRefresh])

  return (
    <article className="knowledge-explorer">
      <header className="knowledge-explorer-header">
        <button
          aria-label="Back"
          className="knowledge-explorer-back"
          disabled={!canGoBack}
          onClick={handleGoBack}
          type="button"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="knowledge-explorer-crumb">
          <h2>{currentTitle}</h2>
          {currentPathDescription && <p>{currentPathDescription}</p>}
        </div>

        <button
          aria-label="Refresh"
          className="knowledge-explorer-refresh"
          onClick={handleRefresh}
          type="button"
        >
          <RefreshCw className={isLoadingRootData ? 'knowledge-explorer-spin' : ''} size={15} />
        </button>
      </header>

      <section className="knowledge-explorer-content">
        {!folders.length ? (
          <p className="knowledge-explorer-empty">
            Add a folder in the panel on the left to get started.
          </p>
        ) : !selectedRoot ? (
          folders.map((fp) => (
            <ExplorerTile
              key={fp}
              variant="root"
              label={getPathLabel(fp)}
              subtitle={fp}
              onClick={() => handleOpenRoot(fp)}
              title={fp}
            />
          ))
        ) : (isLoadingRootData && !activeNodeState.loaded) || activeNodeState.loading ? (
          <div className="knowledge-explorer-spinner" role="status" aria-label="Loading">
            <span aria-hidden="true" className="workspace-button-loader" />
            <span>Loading…</span>
          </div>
        ) : activeNodeState.error ? (
          <p className="knowledge-explorer-empty">{activeNodeState.error}</p>
        ) : explorerItems.length ? (
          explorerItems.map((node) =>
            node.type === 'directory' ? (
              <ExplorerTile
                key={node.path}
                variant="directory"
                label={node.name}
                subtitle={getStatusLabel(node.status)}
                status={node.status}
                onClick={() => void handleOpenDirectory(node)}
                title={node.path}
              />
            ) : (
              <ExplorerTile
                key={node.path}
                variant="file"
                label={node.name}
                subtitle={getStatusLabel(node.status)}
                status={node.status}
                selected={selectedFile?.path === node.path}
                onClick={() => setSelectedFile(node)}
                title={node.path}
              />
            )
          )
        ) : (
          <p className="knowledge-explorer-empty">No files in this location yet.</p>
        )}
      </section>

      <ExplorerFileSidebar selectedFile={selectedFile} onClose={() => setSelectedFile(null)} />
    </article>
  )
}

export default IndexedFilesExplorer
