import {
  addIndexFolder,
  getTrackedIndexFolders,
  getIndexedChildren,
  getIndexingStatus,
  pickIndexFolder,
  rebuildIndexing,
  removeIndexFolder,
  resetIndexingState
} from '@vox-ai-app/indexing'
import { setOnStatusChange } from '@vox-ai-app/indexing/process'
import { createHandler, emitAll, registerHandler } from './shared'

export function registerIndexingIpc() {
  registerHandler(
    'indexing:get-folders',
    createHandler(async () => ({ folders: await getTrackedIndexFolders() }))
  )
  registerHandler(
    'indexing:add-folder',
    createHandler(async (_e, p) => addIndexFolder(p || {}))
  )
  registerHandler(
    'indexing:remove-folder',
    createHandler(async (_e, p) => removeIndexFolder(p || {}))
  )
  registerHandler(
    'indexing:rebuild',
    createHandler(async () => ({ status: await rebuildIndexing() }))
  )
  registerHandler(
    'indexing:get-status',
    createHandler(async () => ({ status: await getIndexingStatus() }))
  )
  registerHandler(
    'indexing:pick-folder',
    createHandler(async () => pickIndexFolder())
  )
  registerHandler(
    'indexing:get-indexed-children',
    createHandler(async (_e, p) => getIndexedChildren(p || {}))
  )
  registerHandler(
    'indexing:reset-state',
    createHandler(async () => ({ status: await resetIndexingState() }))
  )
}

export function initIndexingStatusPush() {
  setOnStatusChange((status) => {
    emitAll('indexing:status-change', status)
  })
}
