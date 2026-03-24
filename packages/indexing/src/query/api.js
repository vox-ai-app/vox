import path from 'node:path'
import { detectFileKind, readTextFileForIndex } from '../ingest/files.js'
import {
  dbGetEntry,
  dbLoadAllEntries,
  dbLoadEntriesByPathPrefix,
  openKnowledgeDb
} from '../db/db.js'
import { removeKnowledgeDocuments } from '../db/search.js'
import { appendEvent, state } from '../runtime/core/state.js'
import {
  dbLoadEntryPathsByFolder,
  dbLoadPendingDeletePathsByFolder,
  removeIndexedEntries,
  removePendingDeletes
} from '../db/metadata.js'
export { getIndexedChildren } from './explorer/children.js'
export const removeIndexedFolderData = async (payload) => {
  const rawFolderPath = String(payload?.folderPath || '').trim()
  if (!rawFolderPath) {
    throw new Error('Folder path is required.')
  }
  if (state.indexingStatus.reconciling || state.indexingStatus.cancelling) {
    throw new Error('Wait for indexing to settle before removing a folder.')
  }
  const normalizedFolderPath = path.resolve(rawFolderPath)
  await openKnowledgeDb()
  const folderIndexedPaths = dbLoadEntryPathsByFolder(normalizedFolderPath)
  const folderQueuedPaths = dbLoadPendingDeletePathsByFolder(normalizedFolderPath)
  if (!folderIndexedPaths.length && !folderQueuedPaths.length) {
    return {
      folderPath: normalizedFolderPath,
      removedCount: 0
    }
  }
  if (folderIndexedPaths.length) {
    await removeKnowledgeDocuments(folderIndexedPaths)
    removeIndexedEntries(folderIndexedPaths, false)
  }
  if (folderQueuedPaths.length) {
    removePendingDeletes(folderQueuedPaths)
  }
  appendEvent(
    'info',
    `Removed ${folderIndexedPaths.length} indexed files from ${normalizedFolderPath}.`
  )
  state.deletionSweepByFolder.delete(normalizedFolderPath)
  return {
    folderPath: normalizedFolderPath,
    removedCount: folderIndexedPaths.length
  }
}
export const listIndexedFilesForTool = async (payload = {}) => {
  await openKnowledgeDb()
  const prefix = String(payload?.prefix || '').trim()
  const normalizedPrefix = prefix ? path.resolve(prefix) : ''
  const query = String(payload?.query || '')
    .trim()
    .toLowerCase()
  const page = Math.max(1, Number(payload?.page || 1))
  const pageSize = Math.min(200, Math.max(1, Number(payload?.pageSize || 50)))
  const allItems = (
    normalizedPrefix ? dbLoadEntriesByPathPrefix(normalizedPrefix) : dbLoadAllEntries()
  )
    .map((row) => ({
      path: row.path,
      folderPath: row.folder_path,
      kind: row.kind,
      size: Number(row.size || 0),
      mtimeMs: Number(row.mtime_ms || 0),
      indexedAt: row.indexed_at || null
    }))
    .filter((item) => {
      if (!query) {
        return true
      }
      const normalizedItemPath = String(item.path || '').toLowerCase()
      const fileName = path.basename(item.path).toLowerCase()
      return normalizedItemPath.includes(query) || fileName.includes(query)
    })
    .sort((left, right) => {
      if (query) {
        const leftPath = String(left.path || '').toLowerCase()
        const rightPath = String(right.path || '').toLowerCase()
        const leftName = path.basename(left.path).toLowerCase()
        const rightName = path.basename(right.path).toLowerCase()
        const rank = (fileName, filePath) => {
          if (fileName === query) return 0
          if (fileName.startsWith(query)) return 1
          if (fileName.includes(query)) return 2
          if (filePath.includes(query)) return 3
          return 4
        }
        const leftRank = rank(leftName, leftPath)
        const rightRank = rank(rightName, rightPath)
        if (leftRank !== rightRank) {
          return leftRank - rightRank
        }
      }
      const leftTime = new Date(left.indexedAt || 0).getTime()
      const rightTime = new Date(right.indexedAt || 0).getTime()
      return rightTime - leftTime
    })
  const total = allItems.length
  const offset = (page - 1) * pageSize
  const items = allItems.slice(offset, offset + pageSize)
  return {
    page,
    pageSize,
    total,
    query: query || null,
    items
  }
}
export const readIndexedFileForTool = async (payload = {}) => {
  const rawPath = String(payload?.path || '').trim()
  if (!rawPath) {
    throw new Error('Path is required.')
  }
  const normalizedPath = path.resolve(rawPath)
  const reqOffset = Number(payload?.offset)
  const offset = Number.isFinite(reqOffset) && reqOffset > 0 ? Math.floor(reqOffset) : 0
  const reqLen = Number(payload?.length)
  const length = Number.isFinite(reqLen) && reqLen > 0 ? Math.min(Math.floor(reqLen), 60000) : 30000
  await openKnowledgeDb()
  const row = dbGetEntry(normalizedPath)
  const entry = row
    ? {
        folderPath: row.folder_path,
        kind: row.kind,
        size: row.size,
        mtimeMs: row.mtime_ms,
        indexedAt: row.indexed_at
      }
    : null
  if (!entry) {
    throw new Error('Path is not indexed.')
  }
  const fileKind = detectFileKind(normalizedPath)
  if (fileKind !== 'text') {
    return {
      path: normalizedPath,
      kind: fileKind || entry.kind || 'unknown',
      content: '',
      message: 'File format not supported for text extraction.'
    }
  }
  const readResult = await readTextFileForIndex(normalizedPath)
  if (readResult?.unsupported) {
    return {
      path: normalizedPath,
      kind: fileKind,
      content: '',
      message: readResult.unsupportedReason || 'File format not supported for text extraction.',
      indexedAt: entry.indexedAt || null
    }
  }
  if (readResult?.containsBinary) {
    return {
      path: normalizedPath,
      kind: fileKind,
      content: '',
      message: 'Text extraction failed: file appears to be binary.',
      indexedAt: entry.indexedAt || null
    }
  }
  const fullText = String(readResult?.text || '')
  const content = fullText.slice(offset, offset + length)
  const remaining = Math.max(0, fullText.length - offset - content.length)
  return {
    path: normalizedPath,
    kind: fileKind,
    content,
    offset,
    length: content.length,
    remaining,
    total: fullText.length,
    indexedAt: entry.indexedAt || null
  }
}
