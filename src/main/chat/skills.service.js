import { app } from 'electron'
import path from 'node:path'
import { loadAllSkills, resolveDefaultSkillDirs, formatSkillsForPrompt } from '@vox-ai-app/skills'
import { logger } from '../logger'

let _skills = []
let _promptFragment = ''

export function loadSkills() {
  const workspace = path.join(app.getPath('userData'), 'workspace')
  const dirs = resolveDefaultSkillDirs(workspace)

  try {
    _skills = loadAllSkills(dirs, { maxTotal: 100 })
    _promptFragment = formatSkillsForPrompt(_skills)
    logger.info(`[skills] Loaded ${_skills.length} skills from ${dirs.length} directories`)
  } catch (err) {
    logger.warn('[skills] Failed to load skills:', err)
    _skills = []
    _promptFragment = ''
  }
}

export function getSkillsPrompt() {
  return _promptFragment
}

export function getLoadedSkills() {
  return _skills
}

export function reloadSkills() {
  loadSkills()
}

export function findSkill(name) {
  return _skills.find((s) => s.name === name) || null
}
