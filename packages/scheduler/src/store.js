import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SCHEDULES_FILE = 'schedules.json'
const serializedCache = new Map()

function setSecureMode(filePath) {
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    /* platform may not support chmod */
  }
}

function setSecureDirMode(dirPath) {
  try {
    fs.chmodSync(dirPath, 0o700)
  } catch {
    /* platform may not support chmod */
  }
}

export function createStore(dataDir) {
  const filePath = path.join(dataDir, SCHEDULES_FILE)

  function readAll() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(Boolean)
    } catch {
      return []
    }
  }

  function writeAll(schedules) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    setSecureDirMode(dataDir)

    const json = JSON.stringify(schedules, null, 2)
    const cached = serializedCache.get(filePath)
    if (cached === json) return

    if (fs.existsSync(filePath)) {
      const bakPath = filePath + '.bak'
      try {
        fs.copyFileSync(filePath, bakPath)
        setSecureMode(bakPath)
      } catch {
        /* backup is best-effort */
      }
    }

    const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 })
    setSecureMode(tmp)
    fs.renameSync(tmp, filePath)
    setSecureMode(filePath)
    serializedCache.set(filePath, json)
  }

  function save(schedule) {
    const all = readAll()
    const idx = all.findIndex((s) => s.id === schedule.id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...schedule, updatedAt: Date.now() }
    } else {
      all.push({ ...schedule, createdAt: Date.now() })
    }
    writeAll(all)
    return schedule
  }

  function remove(id) {
    const all = readAll()
    const filtered = all.filter((s) => s.id !== id)
    if (filtered.length === all.length) return false
    writeAll(filtered)
    return true
  }

  function get(id) {
    return readAll().find((s) => s.id === id) || null
  }

  function list() {
    return readAll()
  }

  return { save, remove, get, list, filePath }
}
