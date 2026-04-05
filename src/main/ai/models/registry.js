import { app } from 'electron'
import { join, basename } from 'path'
import { totalmem } from 'os'
import { readdirSync, statSync, mkdirSync, existsSync, unlinkSync, createWriteStream } from 'fs'
import { execSync } from 'child_process'
import { storeGet, storeSet, storeDelete } from '../../storage/store'
import { emitAll } from '../../ipc/shared'
import { logger } from '../../core/logger'

const STORE_KEY_ACTIVE = 'activeModelPath'
const STORE_KEY_REGISTRY = 'modelRegistry'
const MIN_FREE_DISK_GB = 1

export function getModelsDir() {
  const dir = join(app.getPath('userData'), 'models')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getRegistry() {
  const stored = storeGet(STORE_KEY_REGISTRY)
  return Array.isArray(stored) ? stored : []
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

function getFreeDiskBytes() {
  try {
    const output = execSync("df -k / | tail -1 | awk '{print $4}'", { encoding: 'utf-8' })
    return parseInt(output.trim(), 10) * 1024
  } catch {
    return Infinity
  }
}

export function listModels() {
  const dir = getModelsDir()
  const registry = getRegistry()

  let diskFiles = []
  try {
    diskFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.gguf'))
      .map((filename) => {
        const filePath = join(dir, filename)
        const size = statSync(filePath).size
        return { filename, path: filePath, size }
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

  const dir = getModelsDir()
  try {
    const gguf = readdirSync(dir).find((f) => f.endsWith('.gguf'))
    if (gguf) {
      const found = join(dir, gguf)
      const size = statSync(found).size
      if (size > 1024) {
        logger.info('[models] Auto-recovered active model:', found)
        storeSet(STORE_KEY_ACTIVE, found)
        return found
      }
    }
  } catch {
    /* models dir may not exist yet */
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
  const dir = getModelsDir()
  const destPath = join(dir, hfFile)

  if (existsSync(destPath)) {
    const fileSize = statSync(destPath).size
    if (fileSize < 1024) {
      logger.warn('[models] Existing file too small, re-downloading:', destPath)
      try {
        unlinkSync(destPath)
      } catch {
        /* ignore */
      }
    } else {
      logger.info('[models] Already exists:', destPath)
      const active = getActiveModelPath()
      if (!active) {
        storeSet(STORE_KEY_ACTIVE, destPath)
        emitAll('models:auto-activated', { path: destPath, filename: hfFile })
      }
      emitAll('models:progress', { path: destPath, filename: hfFile, percent: 100 })
      return destPath
    }
  }

  const freeBytes = getFreeDiskBytes()
  const curated = (await import('./curated.js')).CURATED_MODELS
  const match = curated.find((m) => m.hfFile === hfFile)
  const requiredBytes = (match?.sizeGB || 5) * 1e9 + MIN_FREE_DISK_GB * 1e9
  if (freeBytes < requiredBytes) {
    const freeGB = (freeBytes / 1e9).toFixed(1)
    const needGB = (requiredBytes / 1e9).toFixed(1)
    throw new Error(`Not enough disk space. Need ~${needGB} GB free, only ${freeGB} GB available.`)
  }

  logger.info('[models] Starting download:', hfRepo, hfFile)

  const controller = new AbortController()
  activeDownloads.set(destPath, controller)
  downloadProgress.set(hfFile, { percent: 0, path: destPath })

  const url = `https://huggingface.co/${hfRepo}/resolve/main/${hfFile}`
  let lastEmit = 0

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow'
    })
    if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`)

    const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10)
    let downloadedBytes = 0

    const tmpPath = destPath + '.tmp'
    const fileStream = createWriteStream(tmpPath)

    const writable = new WritableStream({
      write(chunk) {
        downloadedBytes += chunk.byteLength
        fileStream.write(Buffer.from(chunk))

        const now = Date.now()
        const percent =
          totalBytes > 0
            ? Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)))
            : 0

        downloadProgress.set(hfFile, {
          percent,
          path: destPath,
          downloadedBytes,
          totalBytes
        })

        if (now - lastEmit > 250) {
          lastEmit = now
          onProgress?.({ downloadedSize: downloadedBytes, totalSize: totalBytes })
          emitAll('models:progress', {
            path: destPath,
            filename: hfFile,
            percent,
            downloadedBytes,
            totalBytes
          })
        }
      },
      close() {
        fileStream.end()
      },
      abort(err) {
        fileStream.destroy(err)
      }
    })

    await resp.body.pipeTo(writable)

    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve)
      fileStream.on('error', reject)
      if (fileStream.writableFinished) resolve()
    })

    const { renameSync } = await import('fs')
    renameSync(tmpPath, destPath)
  } catch (err) {
    const tmpPath = destPath + '.tmp'
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    emitAll('models:progress', {
      path: destPath,
      filename: hfFile,
      percent: -1,
      error: err.message
    })
    throw err
  } finally {
    activeDownloads.delete(destPath)
    downloadProgress.delete(hfFile)
  }

  upsertRegistryEntry({
    filename: basename(destPath),
    path: destPath,
    size: statSync(destPath).size,
    source: 'huggingface',
    hfRepo,
    hfFile,
    addedAt: Date.now()
  })

  emitAll('models:progress', { path: destPath, filename: hfFile, percent: 100 })

  const active = getActiveModelPath()
  if (!active) {
    storeSet(STORE_KEY_ACTIVE, destPath)
    emitAll('models:auto-activated', { path: destPath, filename: hfFile })
    logger.info('[models] Auto-activated first model:', destPath)
  }

  logger.info('[models] Download complete:', destPath)
  return destPath
}

export function cancelDownload(path) {
  activeDownloads.get(path)?.abort()
  activeDownloads.delete(path)
}

export async function deleteModel(path) {
  const active = storeGet(STORE_KEY_ACTIVE)
  const isActive = active === path

  if (isActive) {
    const { clearChat } = await import('../llm/bridge.js')
    try {
      await clearChat()
    } catch {
      /* worker may not be running */
    }
    storeDelete(STORE_KEY_ACTIVE)
  }

  try {
    unlinkSync(path)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  removeRegistryEntry(path)

  if (isActive) {
    emitAll('models:no-model', {})
  }
}

export function getRecommendedModel() {
  const gb = totalmem() / 1073741824
  if (gb >= 64)
    return {
      hfRepo: 'Qwen/Qwen3-32B-GGUF',
      hfFile: 'Qwen3-32B-Q4_K_M.gguf'
    }
  if (gb >= 32)
    return {
      hfRepo: 'Qwen/Qwen3-14B-GGUF',
      hfFile: 'Qwen3-14B-Q4_K_M.gguf'
    }
  return {
    hfRepo: 'Qwen/Qwen3-4B-GGUF',
    hfFile: 'Qwen3-4B-Q4_K_M.gguf'
  }
}

export function cleanupPartialDownloads() {
  const dir = getModelsDir()
  try {
    const files = readdirSync(dir)
    for (const f of files) {
      if (f.endsWith('.tmp') || f.endsWith('.ipull')) {
        const fullPath = join(dir, f)
        try {
          unlinkSync(fullPath)
          logger.info('[models] Cleaned up partial download:', f)
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
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

  const filePath = result.filePaths[0]
  const filename = filePath.split('/').pop()
  const size = statSync(filePath).size

  upsertRegistryEntry({ filename, path: filePath, size, source: 'local', addedAt: Date.now() })
  return { filename, path: filePath, size }
}
