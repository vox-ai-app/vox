import { SHORTCUTS_TOOL_DEFINITIONS } from './def.js'
import { listShortcutsMac, runShortcutMac } from './mac/index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const runShortcut = (payload, opts) => {
  const name = String(payload?.name ?? '').trim()
  if (!name) throw new Error('"name" is required.')
  const input = payload?.input
  return runShortcutMac({ name, input }, opts)
}

const executors = resolveExecutors(
  {
    darwin: {
      list_shortcuts: listShortcutsMac,
      run_shortcut: runShortcut
    }
  },
  'Shortcuts'
)

export const SHORTCUTS_TOOLS = makePlatformTools(SHORTCUTS_TOOL_DEFINITIONS, executors)
