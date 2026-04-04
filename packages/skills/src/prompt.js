import os from 'node:os'
import path from 'node:path'

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function compactPath(filePath) {
  const home = os.homedir()
  if (!home) return filePath
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  return filePath.startsWith(prefix) ? '~/' + filePath.slice(prefix.length) : filePath
}

export function formatSkillsCompact(skills) {
  const visible = skills.filter((s) => !s.disableModelInvocation)
  if (visible.length === 0) return ''

  const lines = ['', '<available_skills>']

  for (const skill of visible) {
    lines.push('  <skill>')
    lines.push(`    <name>${escapeXml(skill.name)}</name>`)
    lines.push(`    <location>${escapeXml(compactPath(skill.filePath))}</location>`)
    lines.push('  </skill>')
  }

  lines.push('</available_skills>')
  return lines.join('\n')
}

export function formatSkillsForPrompt(skills, opts = {}) {
  const maxChars = opts.maxChars || 30_000
  const maxCount = opts.maxCount || 150
  const visible = skills.filter((s) => !s.disableModelInvocation).slice(0, maxCount)
  if (visible.length === 0) return ''

  const header = [
    '',
    'The following skills provide specialized instructions for specific tasks.',
    "Use the read tool to load a skill's file when the task matches its description.",
    'When a skill file references a relative path, resolve it against the skill directory.',
    ''
  ].join('\n')

  const lines = ['<available_skills>']

  for (const skill of visible) {
    lines.push('  <skill>')
    lines.push(`    <name>${escapeXml(skill.name)}</name>`)
    lines.push(`    <description>${escapeXml(skill.description)}</description>`)
    lines.push(`    <location>${escapeXml(compactPath(skill.filePath))}</location>`)
    lines.push('  </skill>')
  }

  lines.push('</available_skills>')

  const full = header + lines.join('\n')
  if (full.length <= maxChars) return full

  const compact = header + formatSkillsCompact(visible)
  return compact
}

export function formatSkillBody(skill) {
  if (!skill.body) return ''
  return `\n\n--- Skill: ${skill.name} ---\n${skill.body}\n--- End Skill ---`
}
