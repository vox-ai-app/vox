import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function resolveConfigPath(configPath) {
  const normalized = String(configPath || '').trim()
  if (!normalized) {
    throw new Error('A config path is required.')
  }
  return path.resolve(normalized)
}

function readConfigFile(configPath) {
  const resolvedPath = resolveConfigPath(configPath)
  if (!existsSync(resolvedPath)) {
    return {}
  }

  try {
    const raw = readFileSync(resolvedPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed
  } catch {
    return {}
  }
}

function writeConfigFile(configPath, value) {
  const resolvedPath = resolveConfigPath(configPath)
  mkdirSync(path.dirname(resolvedPath), { recursive: true })
  const tempPath = `${resolvedPath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tempPath, resolvedPath)
}

export function configGet(configPath, key) {
  const config = readConfigFile(configPath)
  return config[String(key)]
}

export function configSet(configPath, key, value) {
  const config = readConfigFile(configPath)
  config[String(key)] = value
  writeConfigFile(configPath, config)
  return value
}

export function configDelete(configPath, key) {
  const config = readConfigFile(configPath)
  const normalizedKey = String(key)
  const existed = Object.prototype.hasOwnProperty.call(config, normalizedKey)
  delete config[normalizedKey]
  writeConfigFile(configPath, config)
  return existed
}

export function configGetAll(configPath) {
  return { ...readConfigFile(configPath) }
}
