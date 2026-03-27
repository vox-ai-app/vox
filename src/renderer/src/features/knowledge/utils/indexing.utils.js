export const EMPTY_INDEXING_STATUS = {
  running: false,
  watching: false,
  reconciling: false,
  cancelling: false,
  startedAt: null,
  finishedAt: null,
  lastReconciledAt: null,
  activeFolders: [],
  pendingScopes: 0,
  queueSize: 0,
  scannedFiles: 0,
  queuedFiles: 0,
  processedFiles: 0,
  indexedFiles: 0,
  skippedUnchanged: 0,
  skippedUnsupported: 0,
  failedFiles: 0,
  removedStale: 0,
  message: '',
  events: []
}

export const normalizeIndexingStatus = (status) => ({
  ...EMPTY_INDEXING_STATUS,
  ...(status || {}),
  events: Array.isArray(status?.events) ? status.events : []
})
