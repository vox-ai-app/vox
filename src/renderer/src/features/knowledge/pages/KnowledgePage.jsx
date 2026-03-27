import FolderSettingsPanel from '../components/FolderSettingsPanel'
import IndexedFilesExplorer from '../components/IndexedFilesExplorer'

function KnowledgePage({
  folders,
  indexingStatus,
  onGetIndexedChildren,
  onPickAndAddFolder,
  onRebuildIndexing,
  onRemoveFolder
}) {
  return (
    <section className="knowledge-page">
      <FolderSettingsPanel
        folders={folders}
        onPickAndAddFolder={onPickAndAddFolder}
        onRebuildIndexing={onRebuildIndexing}
        onRemoveFolder={onRemoveFolder}
        status={indexingStatus}
      />

      <IndexedFilesExplorer
        folders={folders}
        lastReconciledAt={indexingStatus.lastReconciledAt}
        onGetIndexedChildren={onGetIndexedChildren}
      />
    </section>
  )
}

export default KnowledgePage
