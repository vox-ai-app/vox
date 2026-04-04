import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from './parser.js'

const DEFAULT_LIMITS = {
  maxCandidatesPerRoot: 300,
  maxSkillsPerSource: 200,
  maxSkillsInPrompt: 150,
  maxSkillFileBytes: 256_000,
  maxSkillsPromptChars: 30_000
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function tryRealpath(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

function resolveContainedPath(rootReal, candidate) {
  const real = tryRealpath(candidate)
  if (!real) return null
  if (real === rootReal || isPathInside(rootReal, real)) return real
  return null
}

function detectNestedSkillsRoot(dir, maxScan = 100) {
  const nested = path.join(dir, 'skills')
  try {
    if (!fs.existsSync(nested) || !fs.statSync(nested).isDirectory()) return dir
  } catch {
    return dir
  }

  const children = listSkillDirs(nested)
  for (const child of children.slice(0, maxScan)) {
    if (fs.existsSync(path.join(child, 'SKILL.md'))) return nested
  }
  return dir
}

function loadSingleSkill(skillDir, source, rootReal, maxBytes) {
  const skillPath = path.join(skillDir, 'SKILL.md')

  const skillPathReal = resolveContainedPath(rootReal, skillPath)
  if (!skillPathReal) return null

  let raw
  try {
    const stat = fs.statSync(skillPathReal)
    if (maxBytes && stat.size > maxBytes) return null
    raw = fs.readFileSync(skillPathReal, 'utf8')
  } catch {
    return null
  }

  const { fields, body } = parseFrontmatter(raw)
  const fallbackName = path.basename(skillDir).trim()
  const name = fields.name?.trim() || fallbackName
  const description = fields.description?.trim()
  if (!name || !description) return null

  const metadata = fields.metadata || null
  const userInvocable = fields['user-invocable'] !== 'false'
  const disableModelInvocation = fields['disable-model-invocation'] === 'true'
  const allowedTools = Array.isArray(fields['allowed-tools']) ? fields['allowed-tools'] : undefined

  return {
    name,
    description,
    filePath: path.resolve(skillPath),
    baseDir: path.resolve(skillDir),
    body,
    source,
    metadata,
    userInvocable,
    disableModelInvocation,
    allowedTools
  }
}

function listSkillDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => {
        if (e.name.startsWith('.') || e.name === 'node_modules') return false
        if (e.isDirectory()) return true
        if (e.isSymbolicLink()) {
          try {
            return fs.statSync(path.join(dir, e.name)).isDirectory()
          } catch {
            return false
          }
        }
        return false
      })
      .map((e) => path.join(dir, e.name))
      .sort()
  } catch {
    return []
  }
}

export function loadSkillsFromDir(dir, source, opts = {}) {
  const maxBytes = opts.maxBytes || DEFAULT_LIMITS.maxSkillFileBytes
  const maxSkills = opts.maxSkills || DEFAULT_LIMITS.maxSkillsPerSource
  let rootReal
  try {
    rootReal = fs.realpathSync(path.resolve(dir))
  } catch {
    return []
  }

  const baseDir = detectNestedSkillsRoot(
    rootReal,
    opts.maxCandidatesPerRoot || DEFAULT_LIMITS.maxCandidatesPerRoot
  )
  const baseDirReal = resolveContainedPath(rootReal, baseDir)
  if (!baseDirReal) return []

  const rootSkillMd = path.join(baseDirReal, 'SKILL.md')
  if (fs.existsSync(rootSkillMd)) {
    const single = loadSingleSkill(baseDirReal, source, rootReal, maxBytes)
    return single ? [single] : []
  }

  const candidates = listSkillDirs(baseDirReal).slice(0, maxSkills)
  const skills = []
  for (const candidate of candidates) {
    if (!fs.existsSync(path.join(candidate, 'SKILL.md'))) continue
    const candidateReal = resolveContainedPath(rootReal, candidate)
    if (!candidateReal) continue
    const skill = loadSingleSkill(candidateReal, source, rootReal, maxBytes)
    if (skill) skills.push(skill)
    if (skills.length >= maxSkills) break
  }
  return skills
}

export function loadAllSkills(skillDirs, opts = {}) {
  const maxTotal = opts.maxTotal || DEFAULT_LIMITS.maxSkillsInPrompt
  const all = []
  const seen = new Set()

  for (const { dir, source } of skillDirs) {
    const skills = loadSkillsFromDir(dir, source, opts)
    for (const skill of skills) {
      if (seen.has(skill.name)) continue
      seen.add(skill.name)
      all.push(skill)
      if (all.length >= maxTotal) return all
    }
  }
  return all
}

export function resolveDefaultSkillDirs(workspace) {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const dirs = []

  if (workspace) {
    dirs.push({ dir: path.join(workspace, 'skills'), source: 'workspace' })
    dirs.push({ dir: path.join(workspace, '.agents', 'skills'), source: 'project-agent' })
  }

  if (home) {
    dirs.push({ dir: path.join(home, '.agents', 'skills'), source: 'personal-agent' })
    dirs.push({ dir: path.join(home, '.vox', 'skills'), source: 'managed' })
  }

  return dirs.filter((d) => {
    try {
      return fs.statSync(d.dir).isDirectory()
    } catch {
      return false
    }
  })
}

export { DEFAULT_LIMITS }
