# @vox-ai-app/skills

AgentSkills-compatible skill loader for Vox — discover SKILL.md files, parse YAML frontmatter, and format skills as prompt context for LLMs.

## Install

```sh
npm install @vox-ai-app/skills
```

## Exports

| Export                      | Contents                           |
| --------------------------- | ---------------------------------- |
| `@vox-ai-app/skills`        | All skill exports                  |
| `@vox-ai-app/skills/parser` | YAML frontmatter parser            |
| `@vox-ai-app/skills/loader` | Skill directory scanner and loader |
| `@vox-ai-app/skills/prompt` | LLM prompt formatter               |

## Usage

```js
import { loadAllSkills, resolveDefaultSkillDirs, formatSkillsForPrompt } from '@vox-ai-app/skills'

const dirs = resolveDefaultSkillDirs('/path/to/workspace')
const skills = loadAllSkills(dirs, { maxTotal: 100 })
const prompt = formatSkillsForPrompt(skills)
// inject `prompt` into your system message
```

## Skill format

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: Does something useful
version: 1.0.0
---

Skill instructions go here. This body is injected into the LLM prompt when the skill is active.
```

## API

### Parser

```js
import { parseFrontmatter } from '@vox-ai-app/skills/parser'

const { meta, body } = parseFrontmatter(markdownString)
// meta = { name, description, version, ... }
// body = everything after the frontmatter
```

### Loader

```js
import {
  loadSkillsFromDir,
  loadAllSkills,
  resolveDefaultSkillDirs
} from '@vox-ai-app/skills/loader'

// Scan a single directory
const skills = loadSkillsFromDir('/path/to/skills', { maxTotal: 150 })

// Scan all default directories
const dirs = resolveDefaultSkillDirs('/workspace')
// dirs = [workspace/skills, .agents/skills, ~/.agents/skills, ~/.vox/skills]
const allSkills = loadAllSkills(dirs)
```

### Prompt

```js
import { formatSkillsForPrompt, formatSkillBody } from '@vox-ai-app/skills/prompt'

const xml = formatSkillsForPrompt(skills)
// Returns XML-formatted skill context for injection into system prompts

const body = formatSkillBody(skill)
// Returns formatted body for a single skill
```

## Search directories

`resolveDefaultSkillDirs(workspacePath)` returns these directories (in order):

1. `{workspace}/skills/`
2. `{workspace}/.agents/skills/`
3. `~/.agents/skills/`
4. `~/.vox/skills/`

## Limits

- Maximum 150 skills per directory scan (configurable via `maxTotal`)
- Symlink loops are detected and skipped
- Non-SKILL.md files are ignored

## License

MIT
