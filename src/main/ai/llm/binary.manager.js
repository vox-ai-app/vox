import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import { join, dirname } from 'path'

const execAsync = promisify(exec)
import {
  existsSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  createWriteStream,
  renameSync,
  rmSync,
  readdirSync,
  copyFileSync
} from 'fs'
import { app } from 'electron'
import { logger } from '../../core/logger'
import { emitAll } from '../../ipc/shared'

const LLAMA_SERVER_VERSION = 'b8635'
const BINARY_NAME = 'llama-server'
const LOG_PREFIX = '[binary.manager]'

function getBaseDir() {
  return join(app.getPath('userData'), 'bin')
}

function getVersionDir() {
  const dir = join(getBaseDir(), LLAMA_SERVER_VERSION)
  mkdirSync(dir, { recursive: true })
  return dir
}

function getVersionFilePath() {
  return join(getVersionDir(), `${BINARY_NAME}.version`)
}

function getBinaryPath() {
  return join(getVersionDir(), BINARY_NAME)
}

function getLibExtension() {
  if (process.platform === 'darwin') return '.dylib'
  if (process.platform === 'win32') return '.dll'
  return '.so'
}

function getAssetName() {
  const arch = process.arch
  if (process.platform === 'darwin') {
    return arch === 'arm64'
      ? `llama-${LLAMA_SERVER_VERSION}-bin-macos-arm64.tar.gz`
      : `llama-${LLAMA_SERVER_VERSION}-bin-macos-x64.tar.gz`
  }
  if (process.platform === 'linux') {
    return arch === 'arm64'
      ? `llama-${LLAMA_SERVER_VERSION}-bin-ubuntu-arm64.tar.gz`
      : `llama-${LLAMA_SERVER_VERSION}-bin-ubuntu-x64.tar.gz`
  }
  return arch === 'arm64'
    ? `llama-${LLAMA_SERVER_VERSION}-bin-win-cpu-arm64.zip`
    : `llama-${LLAMA_SERVER_VERSION}-bin-win-cpu-x64.zip`
}

function getDownloadUrl() {
  return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_SERVER_VERSION}/${getAssetName()}`
}

function isInstalled() {
  try {
    const ver = readFileSync(getVersionFilePath(), 'utf-8').trim()
    return ver === LLAMA_SERVER_VERSION && existsSync(getBinaryPath())
  } catch {
    return false
  }
}

function findBundledBinary() {
  const bundled = join(
    app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
    'resources',
    BINARY_NAME
  )
  return existsSync(bundled) ? bundled : null
}

export function resolve() {
  const bundled = findBundledBinary()
  if (bundled) return bundled
  if (isInstalled()) return getBinaryPath()
  return null
}

export function purge() {
  const versionDir = getVersionDir()
  logger.info(LOG_PREFIX, 'Purging installation at', versionDir)
  try {
    rmSync(versionDir, { recursive: true, force: true })
  } catch {
    /* ok */
  }
}

export function purgeAllVersions() {
  const baseDir = getBaseDir()
  if (!existsSync(baseDir)) return
  for (const entry of readdirSync(baseDir)) {
    const fullPath = join(baseDir, entry)
    try {
      rmSync(fullPath, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
  logger.info(LOG_PREFIX, 'Purged all versions')
}

async function download(destPath) {
  const url = getDownloadUrl()
  logger.info(LOG_PREFIX, 'Downloading from', url)

  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`)

  const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10)
  let downloaded = 0

  const fileStream = createWriteStream(destPath)
  const reader = resp.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(Buffer.from(value))
    downloaded += value.byteLength
    if (totalBytes > 0) {
      const pct = Math.round((downloaded / totalBytes) * 100)
      emitAll('engine:progress', { percent: pct, downloadedBytes: downloaded, totalBytes })
    }
  }

  fileStream.end()
  await new Promise((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
    if (fileStream.writableFinished) resolve()
  })

  if (totalBytes > 0 && downloaded !== totalBytes) {
    throw new Error(`Download incomplete: got ${downloaded} bytes, expected ${totalBytes}`)
  }

  logger.info(LOG_PREFIX, `Downloaded ${downloaded} bytes`)
}

function extract(archivePath, destDir) {
  const assetName = getAssetName()
  if (assetName.endsWith('.tar.gz')) {
    execSync(`tar xzf "${archivePath}" -C "${destDir}"`)
  } else {
    execSync(`unzip -o "${archivePath}" -d "${destDir}"`)
  }
}

function installFromExtract(extractDir, versionDir) {
  const found = execSync(`find "${extractDir}" -name "${BINARY_NAME}" -type f | head -1`, {
    encoding: 'utf-8'
  }).trim()
  if (!found) throw new Error(`${BINARY_NAME} not found in archive`)

  const sourceDir = dirname(found)
  const binaryPath = join(versionDir, BINARY_NAME)
  const libExt = getLibExtension()

  if (existsSync(binaryPath)) rmSync(binaryPath)
  renameSync(found, binaryPath)
  chmodSync(binaryPath, 0o755)

  const libs = readdirSync(sourceDir).filter((f) => f.includes(libExt))
  for (const lib of libs) {
    const dest = join(versionDir, lib)
    try {
      rmSync(dest, { force: true })
    } catch {
      /* ok */
    }
    copyFileSync(join(sourceDir, lib), dest)
    chmodSync(dest, 0o755)
  }

  logger.info(LOG_PREFIX, `Installed binary + ${libs.length} libraries to`, versionDir)
  return { binaryPath, libs }
}

function removeQuarantine(dir) {
  if (process.platform !== 'darwin') return
  try {
    execSync(`xattr -dr com.apple.quarantine "${dir}"/*`)
  } catch {
    /* ok */
  }
}

async function validate(binaryPath) {
  await execAsync(`"${binaryPath}" --version`, {
    timeout: 30000,
    encoding: 'utf-8',
    env: { ...process.env, GGML_METAL: '0' }
  })
}

export async function ensure() {
  const existing = resolve()
  if (existing) return existing

  logger.info(LOG_PREFIX, `Installing ${BINARY_NAME} ${LLAMA_SERVER_VERSION}...`)
  emitAll('engine:status', { status: 'downloading', version: LLAMA_SERVER_VERSION })

  const versionDir = getVersionDir()
  const assetName = getAssetName()
  const tmpArchive = join(versionDir, assetName + '.tmp')
  const tmpExtract = join(versionDir, 'extract-tmp')

  try {
    await download(tmpArchive)

    mkdirSync(tmpExtract, { recursive: true })
    extract(tmpArchive, tmpExtract)

    installFromExtract(tmpExtract, versionDir)
    removeQuarantine(versionDir)

    const binaryPath = getBinaryPath()
    try {
      await validate(binaryPath)
    } catch (err) {
      logger.error(LOG_PREFIX, 'Validation failed:', err.message)
      purge()
      throw new Error(
        `${BINARY_NAME} failed validation. ` +
          'On macOS, check System Settings > Privacy & Security for blocked applications.'
      )
    }

    writeFileSync(getVersionFilePath(), LLAMA_SERVER_VERSION)

    logger.info(LOG_PREFIX, 'Ready:', binaryPath)
    emitAll('engine:status', { status: 'ready', version: LLAMA_SERVER_VERSION })
    return binaryPath
  } catch (err) {
    logger.error(LOG_PREFIX, 'Install failed:', err.message)
    emitAll('engine:status', { status: 'error', error: err.message })
    throw err
  } finally {
    try {
      rmSync(tmpArchive, { force: true })
    } catch {
      /* ok */
    }
    try {
      rmSync(tmpExtract, { recursive: true, force: true })
    } catch {
      /* ok */
    }
  }
}

export function getVersion() {
  return LLAMA_SERVER_VERSION
}
