import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('skills/parser — parseFrontmatter', () => {
  let parseFrontmatter

  beforeEach(async () => {
    vi.resetModules()
    ;({ parseFrontmatter } = await import('../packages/skills/src/parser.js'))
  })

  it('should parse basic frontmatter fields', () => {
    const md = `---
name: test-skill
description: A test skill
---
Body content here`
    const { fields, body } = parseFrontmatter(md)
    expect(fields.name).toBe('test-skill')
    expect(fields.description).toBe('A test skill')
    expect(body).toBe('Body content here')
  })

  it('should handle quoted values', () => {
    const md = `---
name: "quoted-skill"
description: 'single quoted'
---
body`
    const { fields } = parseFrontmatter(md)
    expect(fields.name).toBe('quoted-skill')
    expect(fields.description).toBe('single quoted')
  })

  it('should parse inline metadata JSON', () => {
    const md = `---
name: meta-skill
description: Has metadata
metadata: {"version": "1.0", "tags": ["a","b"]}
---
body`
    const { fields } = parseFrontmatter(md)
    expect(fields.metadata).toEqual({ version: '1.0', tags: ['a', 'b'] })
  })

  it('should parse multi-line metadata JSON', () => {
    const md = `---
name: multi-meta
description: Multi-line metadata
metadata: {
  "version": "2.0",
  "nested": {"key": "val"}
}
---
body`
    const { fields } = parseFrontmatter(md)
    expect(fields.metadata).toEqual({ version: '2.0', nested: { key: 'val' } })
  })

  it('should return full content as body when no frontmatter', () => {
    const md = 'No frontmatter here'
    const { fields, body } = parseFrontmatter(md)
    expect(fields).toEqual({})
    expect(body).toBe('No frontmatter here')
  })

  it('should skip indented lines in YAML', () => {
    const md = `---
name: test
description: desc
  indented: ignored
---
body`
    const { fields } = parseFrontmatter(md)
    expect(fields.name).toBe('test')
    expect(fields.indented).toBeUndefined()
  })

  it('should handle empty frontmatter', () => {
    const md = `---

---
body only`
    const { fields, body } = parseFrontmatter(md)
    expect(Object.keys(fields).length).toBe(0)
    expect(body).toBe('body only')
  })

  it('should handle invalid metadata JSON gracefully', () => {
    const md = `---
name: bad-meta
description: bad json
metadata: {not valid json}
---
body`
    const { fields } = parseFrontmatter(md)
    expect(fields.metadata).toBeUndefined()
  })
})

describe('skills/loader — loadSkillsFromDir', () => {
  let tmpDir
  let loadSkillsFromDir

  beforeEach(async () => {
    vi.resetModules()
    ;({ loadSkillsFromDir } = await import('../packages/skills/src/loader.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should load a single SKILL.md from a directory', () => {
    const skillDir = path.join(tmpDir, 'my-skill')
    fs.mkdirSync(skillDir)
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: greeting
description: Greets the user
---
Say hello to the user.`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test')
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('greeting')
    expect(skills[0].description).toBe('Greets the user')
    expect(skills[0].body).toBe('Say hello to the user.')
    expect(skills[0].source).toBe('test')
  })

  it('should skip directories without SKILL.md', () => {
    const noSkill = path.join(tmpDir, 'no-skill')
    fs.mkdirSync(noSkill)
    fs.writeFileSync(path.join(noSkill, 'README.md'), 'Not a skill')

    const withSkill = path.join(tmpDir, 'has-skill')
    fs.mkdirSync(withSkill)
    fs.writeFileSync(
      path.join(withSkill, 'SKILL.md'),
      `---
name: real
description: Real skill
---
body`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test')
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('real')
  })

  it('should skip skills without description', () => {
    const noDesc = path.join(tmpDir, 'no-desc')
    fs.mkdirSync(noDesc)
    fs.writeFileSync(
      path.join(noDesc, 'SKILL.md'),
      `---
name: missing-desc
---
body`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test')
    expect(skills).toHaveLength(0)
  })

  it('should skip hidden directories', () => {
    const hidden = path.join(tmpDir, '.hidden-skill')
    fs.mkdirSync(hidden)
    fs.writeFileSync(
      path.join(hidden, 'SKILL.md'),
      `---
name: hidden
description: Should be skipped
---
body`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test')
    expect(skills).toHaveLength(0)
  })

  it('should use directory name as fallback name', () => {
    const skillDir = path.join(tmpDir, 'fallback-name')
    fs.mkdirSync(skillDir)
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
description: Has description but no name
---
body`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test')
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('fallback-name')
  })

  it('should skip oversized SKILL.md files', () => {
    const big = path.join(tmpDir, 'big-skill')
    fs.mkdirSync(big)
    fs.writeFileSync(
      path.join(big, 'SKILL.md'),
      `---
name: big
description: Too large
---
${'x'.repeat(300_000)}`
    )

    const skills = loadSkillsFromDir(tmpDir, 'test', { maxBytes: 256_000 })
    expect(skills).toHaveLength(0)
  })

  it('should return empty array for non-existent directory', () => {
    const skills = loadSkillsFromDir('/tmp/does-not-exist-xyz', 'test')
    expect(skills).toEqual([])
  })
})

describe('skills/loader — loadAllSkills', () => {
  let tmpDir1, tmpDir2
  let loadAllSkills

  beforeEach(async () => {
    vi.resetModules()
    ;({ loadAllSkills } = await import('../packages/skills/src/loader.js'))
    tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-all1-'))
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-all2-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir1, { recursive: true, force: true })
    fs.rmSync(tmpDir2, { recursive: true, force: true })
  })

  it('should deduplicate skills by name across directories', () => {
    for (const dir of [tmpDir1, tmpDir2]) {
      const s = path.join(dir, 'dup-skill')
      fs.mkdirSync(s)
      fs.writeFileSync(
        path.join(s, 'SKILL.md'),
        `---
name: same-name
description: From ${dir === tmpDir1 ? 'first' : 'second'}
---
body`
      )
    }

    const skills = loadAllSkills([
      { dir: tmpDir1, source: 'first' },
      { dir: tmpDir2, source: 'second' }
    ])
    expect(skills).toHaveLength(1)
    expect(skills[0].source).toBe('first')
  })

  it('should respect maxTotal limit', () => {
    for (let i = 0; i < 5; i++) {
      const s = path.join(tmpDir1, `skill-${i}`)
      fs.mkdirSync(s)
      fs.writeFileSync(
        path.join(s, 'SKILL.md'),
        `---
name: skill-${i}
description: Skill number ${i}
---
body`
      )
    }

    const skills = loadAllSkills([{ dir: tmpDir1, source: 'test' }], { maxTotal: 3 })
    expect(skills).toHaveLength(3)
  })
})

describe('skills/prompt — formatSkillsForPrompt', () => {
  let formatSkillsForPrompt, formatSkillBody

  beforeEach(async () => {
    vi.resetModules()
    ;({ formatSkillsForPrompt, formatSkillBody } = await import('../packages/skills/src/prompt.js'))
  })

  it('should format skills as XML', () => {
    const skills = [
      {
        name: 'test',
        description: 'A test',
        filePath: '/home/user/skills/test/SKILL.md',
        disableModelInvocation: false
      }
    ]
    const result = formatSkillsForPrompt(skills)
    expect(result).toContain('<available_skills>')
    expect(result).toContain('<name>test</name>')
    expect(result).toContain('<description>A test</description>')
    expect(result).toContain('</available_skills>')
  })

  it('should escape XML special characters', () => {
    const skills = [
      {
        name: 'a<b',
        description: 'x&y "z"',
        filePath: '/tmp/test/SKILL.md',
        disableModelInvocation: false
      }
    ]
    const result = formatSkillsForPrompt(skills)
    expect(result).toContain('&lt;')
    expect(result).toContain('&amp;')
    expect(result).toContain('&quot;')
  })

  it('should skip disabled skills', () => {
    const skills = [
      {
        name: 'visible',
        description: 'Shown',
        filePath: '/tmp/v/SKILL.md',
        disableModelInvocation: false
      },
      {
        name: 'hidden',
        description: 'Hidden',
        filePath: '/tmp/h/SKILL.md',
        disableModelInvocation: true
      }
    ]
    const result = formatSkillsForPrompt(skills)
    expect(result).toContain('visible')
    expect(result).not.toContain('hidden')
  })

  it('should return empty string when no visible skills', () => {
    const result = formatSkillsForPrompt([])
    expect(result).toBe('')
  })

  it('should compact home directory in paths', () => {
    const home = os.homedir()
    const skills = [
      {
        name: 'test',
        description: 'desc',
        filePath: `${home}/skills/test/SKILL.md`,
        disableModelInvocation: false
      }
    ]
    const result = formatSkillsForPrompt(skills)
    expect(result).toContain('~/skills/test/SKILL.md')
  })

  it('should format skill body with name header', () => {
    const result = formatSkillBody({ name: 'my-skill', body: 'Do this thing' })
    expect(result).toContain('--- Skill: my-skill ---')
    expect(result).toContain('Do this thing')
    expect(result).toContain('--- End Skill ---')
  })

  it('should return empty string for skill without body', () => {
    const result = formatSkillBody({ name: 'empty', body: '' })
    expect(result).toBe('')
  })
})
