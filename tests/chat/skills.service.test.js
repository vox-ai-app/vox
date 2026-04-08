import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir())
  }
}))

vi.mock('../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('@vox-ai-app/skills', () => ({
  resolveDefaultSkillDirs: vi.fn((workspace) => [path.join(workspace, 'skills')]),
  loadAllSkills: vi.fn(() => [
    { name: 'test-skill', description: 'A test skill', body: 'Do things well.' }
  ]),
  formatSkillsForPrompt: vi.fn((skills) =>
    skills.length > 0 ? `<skills>${skills.map((s) => s.name).join(',')}</skills>` : ''
  )
}))

describe('skills.service', () => {
  let loadSkills, getSkillsPrompt, getLoadedSkills, reloadSkills, findSkill

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../../src/main/chat/skills.service.js')
    loadSkills = mod.loadSkills
    getSkillsPrompt = mod.getSkillsPrompt
    getLoadedSkills = mod.getLoadedSkills
    reloadSkills = mod.reloadSkills
    findSkill = mod.findSkill
  })

  it('should return empty prompt before loading', () => {
    expect(getSkillsPrompt()).toBe('')
  })

  it('should return empty skills array before loading', () => {
    expect(getLoadedSkills()).toEqual([])
  })

  it('should load skills and produce prompt', () => {
    loadSkills()
    const prompt = getSkillsPrompt()
    expect(prompt).toContain('test-skill')
    expect(getLoadedSkills()).toHaveLength(1)
  })

  it('should reload skills', () => {
    loadSkills()
    expect(getLoadedSkills()).toHaveLength(1)
    reloadSkills()
    expect(getLoadedSkills()).toHaveLength(1)
  })

  it('should find a skill by name', () => {
    loadSkills()
    const skill = findSkill('test-skill')
    expect(skill).not.toBeNull()
    expect(skill.name).toBe('test-skill')
  })

  it('should return null for unknown skill', () => {
    loadSkills()
    expect(findSkill('nonexistent')).toBeNull()
  })

  it('should handle load failure gracefully', async () => {
    const { loadAllSkills } = await import('@vox-ai-app/skills')
    loadAllSkills.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    loadSkills()
    expect(getSkillsPrompt()).toBe('')
    expect(getLoadedSkills()).toEqual([])
  })
})
