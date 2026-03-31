import { app } from 'electron'
import { join } from 'path'
import { totalmem } from 'os'
import { readdirSync, statSync, mkdirSync, existsSync } from 'fs'
import { storeGet, storeSet, storeDelete } from '../storage/store'
import { emitAll } from '../ipc/shared'
import { logger } from '../logger'

const STORE_KEY_ACTIVE = 'activeModelPath'
const STORE_KEY_REGISTRY = 'modelRegistry'

export function getModelsDir() {
  const dir = join(app.getPath('userData'), 'models')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getRegistry() {
  return storeGet(STORE_KEY_REGISTRY) || []
}

function saveRegistry(registry) {
  storeSet(STORE_KEY_REGISTRY, registry)
}

function upsertRegistryEntry(entry) {
  const registry = getRegistry()
  const idx = registry.findIndex((m) => m.path === entry.path)
  if (idx >= 0) registry[idx] = { ...registry[idx], ...entry }
  else registry.push(entry)
  saveRegistry(registry)
}

function removeRegistryEntry(path) {
  const registry = getRegistry().filter((m) => m.path !== path)
  saveRegistry(registry)
}

export function listModels() {
  const dir = getModelsDir()
  const registry = getRegistry()

  let diskFiles = []
  try {
    diskFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.gguf'))
      .map((filename) => {
        const path = join(dir, filename)
        const size = statSync(path).size
        return { filename, path, size }
      })
  } catch {
    diskFiles = []
  }

  const byPath = new Map(registry.map((r) => [r.path, r]))

  const localEntries = registry.filter(
    (r) => r.source === 'local' && !diskFiles.find((f) => f.path === r.path)
  )
  const localValid = localEntries.filter((r) => existsSync(r.path))

  const merged = [
    ...diskFiles.map((f) => ({
      ...f,
      source: byPath.get(f.path)?.source || 'managed',
      hfRepo: byPath.get(f.path)?.hfRepo,
      hfFile: byPath.get(f.path)?.hfFile,
      addedAt: byPath.get(f.path)?.addedAt || 0
    })),
    ...localValid
  ]

  return merged
}

export function getActiveModelPath() {
  const stored = storeGet(STORE_KEY_ACTIVE)
  if (stored && existsSync(stored)) return stored

  const models = listModels()
  if (models.length > 0) {
    storeSet(STORE_KEY_ACTIVE, models[0].path)
    return models[0].path
  }

  return null
}

export function setActiveModelPath(path) {
  if (!existsSync(path))
    throw Object.assign(new Error('Model file not found'), { code: 'MODEL_NOT_FOUND' })
  storeSet(STORE_KEY_ACTIVE, path)
}

const activeDownloads = new Map()

const downloadProgress = new Map()

export function getActiveDownloadProgress() {
  return Object.fromEntries(downloadProgress)
}

export async function downloadModel({ hfRepo, hfFile, onProgress } = {}) {
  const { createModelDownloader } = await import('node-llama-cpp')

  const dir = getModelsDir()
  const destPath = join(dir, hfFile)

  if (existsSync(destPath)) {
    logger.info('[models] Already exists:', destPath)
    emitAll('models:progress', { path: destPath, filename: hfFile, percent: 100 })
    return destPath
  }

  logger.info('[models] Starting download:', hfRepo, hfFile)

  const downloader = await createModelDownloader({
    modelUri: `hf:${hfRepo}/${hfFile}`,
    dirPath: dir
  })

  const controller = new AbortController()
  activeDownloads.set(destPath, controller)
  downloadProgress.set(hfFile, { percent: 0, path: destPath })

  let lastEmit = 0
  try {
    await downloader.download({
      signal: controller.signal,
      onProgress: (progress) => {
        const now = Date.now()
        const percent = Math.round((progress.downloadedSize / progress.totalSize) * 100)
        downloadProgress.set(hfFile, { percent, path: destPath })
        if (now - lastEmit > 250) {
          lastEmit = now
          onProgress?.(progress)
          emitAll('models:progress', {
            path: destPath,
            filename: hfFile,
            percent,
            downloadedBytes: progress.downloadedSize,
            totalBytes: progress.totalSize
          })
        }
      }
    })
  } finally {
    activeDownloads.delete(destPath)
    downloadProgress.delete(hfFile)
  }

  upsertRegistryEntry({
    filename: hfFile,
    path: destPath,
    size: statSync(destPath).size,
    source: 'huggingface',
    hfRepo,
    hfFile,
    addedAt: Date.now()
  })

  emitAll('models:progress', { path: destPath, filename: hfFile, percent: 100 })

  logger.info('[models] Download complete:', destPath)
  return destPath
}

export function cancelDownload(path) {
  activeDownloads.get(path)?.abort()
  activeDownloads.delete(path)
}

export function deleteModel(path) {
  const { unlinkSync } = require('fs')
  try {
    unlinkSync(path)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  removeRegistryEntry(path)

  const active = storeGet(STORE_KEY_ACTIVE)
  if (active === path) storeDelete(STORE_KEY_ACTIVE)
}

export function getRecommendedModel() {
  const gb = totalmem() / 1073741824
  if (gb >= 16)
    return {
      hfRepo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
      hfFile: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf'
    }
  if (gb >= 8)
    return {
      hfRepo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
      hfFile: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf'
    }
  return {
    hfRepo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    hfFile: 'Phi-3.5-mini-instruct-Q4_K_M.gguf'
  }
}

export async function pickLocalModel() {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    title: 'Select a GGUF model file',
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const path = result.filePaths[0]
  const filename = path.split('/').pop()
  const size = statSync(path).size

  upsertRegistryEntry({ filename, path, size, source: 'local', addedAt: Date.now() })
  return { filename, path, size }
}
