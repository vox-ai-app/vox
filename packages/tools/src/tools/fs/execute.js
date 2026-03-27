import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { clampNumber } from '../../core/schema.js'
import { readDocumentFile, PARSED_EXTENSIONS } from '@vox-ai-app/parser'
import { resolveLocalPath, isBlockedPath } from './path.js'
export { resolveLocalPath }
export async function writeLocalFile(args) {
  const targetPath = resolveLocalPath(args?.path)
  const enc = String(args?.encoding || 'utf8')
    .trim()
    .toLowerCase()
  const encoding = enc === 'base64' ? 'base64' : 'utf8'
  const raw = args?.content == null ? '' : String(args.content)
  const buf = encoding === 'base64' ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8')
  const shouldAppend = Boolean(args?.append)
  const createParents = args?.createParents !== false
  if (createParents)
    await fs.mkdir(path.dirname(targetPath), {
      recursive: true
    })
  if (shouldAppend) {
    await fs.appendFile(targetPath, buf)
  } else {
    await fs.writeFile(targetPath, buf)
  }
  const stats = await fs.stat(targetPath)
  return {
    path: targetPath,
    bytesWritten: buf.length,
    fileSize: stats.size,
    mode: shouldAppend ? 'append' : 'overwrite',
    encoding
  }
}
export async function readLocalFile(args) {
  const targetPath = resolveLocalPath(args?.path)
  const enc = String(args?.encoding || 'utf8')
    .trim()
    .toLowerCase()
  const encoding = enc === 'base64' ? 'base64' : 'utf8'
  const reqOffset = Number(args?.offset)
  const offset = Number.isFinite(reqOffset) && reqOffset > 0 ? Math.floor(reqOffset) : 0
  const ext = path.extname(targetPath).toLowerCase()
  const fileStats = await fs.stat(targetPath)
  if (encoding !== 'base64' && PARSED_EXTENSIONS.has(ext)) {
    const reqLen = Number(args?.length)
    const length =
      Number.isFinite(reqLen) && reqLen > 0 ? Math.min(Math.floor(reqLen), 60000) : 30000
    const readResult = await readDocumentFile(targetPath)
    if (readResult?.unsupported) {
      return {
        path: targetPath,
        content: '',
        encoding: 'utf8',
        format: ext.slice(1),
        size: fileStats.size,
        modifiedAt: fileStats.mtime.toISOString(),
        message: readResult.unsupportedReason || `Could not extract text from ${ext}.`
      }
    }
    const fullText = String(readResult?.text || '')
    const content = fullText.slice(offset, offset + length)
    const remaining = Math.max(0, fullText.length - offset - content.length)
    return {
      path: targetPath,
      content,
      encoding: 'utf8',
      format: ext.slice(1),
      offset,
      length: content.length,
      remaining,
      total: fullText.length,
      size: fileStats.size,
      modifiedAt: fileStats.mtime.toISOString()
    }
  }
  const fileBuffer = await fs.readFile(targetPath)
  if (encoding === 'base64') {
    const reqLen = Number(args?.length)
    const length =
      Number.isFinite(reqLen) && reqLen > 0 ? Math.min(Math.floor(reqLen), 500000) : 120000
    const buf = fileBuffer.subarray(offset, offset + length)
    const remaining = Math.max(0, fileBuffer.length - offset - buf.length)
    return {
      path: targetPath,
      content: buf.toString('base64'),
      encoding,
      offset,
      length: buf.length,
      remaining,
      total: fileBuffer.length,
      size: fileStats.size,
      modifiedAt: fileStats.mtime.toISOString()
    }
  }
  const text = fileBuffer.toString('utf8')
  const reqLen = Number(args?.length)
  const length = Number.isFinite(reqLen) && reqLen > 0 ? Math.min(Math.floor(reqLen), 60000) : 30000
  const content = text.slice(offset, offset + length)
  const remaining = Math.max(0, text.length - offset - content.length)
  return {
    path: targetPath,
    content,
    encoding,
    offset,
    length: content.length,
    remaining,
    total: text.length,
    size: fileStats.size,
    modifiedAt: fileStats.mtime.toISOString()
  }
}
export async function listLocalDirectory(args) {
  const targetPath = args?.path ? resolveLocalPath(args.path) : os.homedir()
  const includeHidden = Boolean(args?.includeHidden)
  const includeDetails = args?.includeDetails !== false
  const limit = clampNumber(args?.limit, 300, 1, 2000)
  const stats = await fs.stat(targetPath)
  if (!stats.isDirectory()) throw new Error('Path is not a directory.')
  const raw = await fs.readdir(targetPath, {
    withFileTypes: true
  })
  const visible = raw.filter((e) => includeHidden || !e.name.startsWith('.'))
  visible.sort((a, b) => {
    const ta = a.isDirectory() ? 0 : 1
    const tb = b.isDirectory() ? 0 : 1
    return ta !== tb ? ta - tb : a.name.localeCompare(b.name)
  })
  const selected = visible.slice(0, limit)
  const entries = await Promise.all(
    selected.map(async (entry) => {
      const p = path.join(targetPath, entry.name)
      const type = entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : entry.isSymbolicLink()
            ? 'symlink'
            : 'other'
      const item = {
        name: entry.name,
        path: p,
        type
      }
      if (!includeDetails) return item
      try {
        const s = await fs.stat(p)
        return {
          ...item,
          size: s.size,
          modifiedAt: s.mtime.toISOString()
        }
      } catch {
        return item
      }
    })
  )
  return {
    path: targetPath,
    includeHidden,
    total: visible.length,
    returned: entries.length,
    truncated: visible.length > entries.length,
    entries
  }
}
export async function deleteLocalPath(args) {
  const targetPath = resolveLocalPath(args?.path)
  const recursive = args?.recursive !== false
  const force = Boolean(args?.force)
  const dryRun = Boolean(args?.dryRun)
  if (isBlockedPath(targetPath)) throw new Error('Refusing to delete a system or root directory.')
  let existingStats = null
  try {
    existingStats = await fs.lstat(targetPath)
  } catch (e) {
    if (e?.code === 'ENOENT')
      return {
        path: targetPath,
        existed: false,
        deleted: false,
        type: 'missing',
        dryRun
      }
    throw e
  }
  const type = existingStats.isDirectory()
    ? 'directory'
    : existingStats.isFile()
      ? 'file'
      : existingStats.isSymbolicLink()
        ? 'symlink'
        : 'other'
  if (dryRun)
    return {
      path: targetPath,
      existed: true,
      deleted: false,
      type,
      dryRun: true,
      recursive: existingStats.isDirectory() ? recursive : false,
      force
    }
  if (existingStats.isDirectory()) {
    if (!recursive)
      throw new Error('Path is a directory. Set recursive=true to delete directories.')
    await fs.rm(targetPath, {
      recursive: true,
      force
    })
  } else {
    try {
      await fs.unlink(targetPath)
    } catch (e) {
      if (!(force && e?.code === 'ENOENT')) throw e
    }
  }
  return {
    path: targetPath,
    existed: true,
    deleted: true,
    type,
    recursive: existingStats.isDirectory() ? recursive : false,
    force
  }
}
export async function getScratchDir(args) {
  const dirId = String(args?.id || '').trim() || randomUUID()
  const base = String(args?.baseDir || '').trim() || path.join(os.tmpdir(), 'vox-scratch')
  const dirPath = path.join(base, dirId)
  await fs.mkdir(dirPath, {
    recursive: true
  })
  return {
    path: dirPath
  }
}
