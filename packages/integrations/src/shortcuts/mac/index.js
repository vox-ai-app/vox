import {
  listShortcuts as listShortcutsRunner,
  runShortcut as runShortcutRunner
} from '../../shared/shortcuts/index.js'

export const listShortcutsMac = async (payload, { signal } = {}) => {
  const shortcuts = await listShortcutsRunner(signal)
  const total = shortcuts.length
  const limit = Math.min(Math.max(1, Number(payload?.limit) || 100), 200)
  const offset = Math.max(0, Number(payload?.offset) || 0)
  const page = shortcuts.slice(offset, offset + limit)
  return {
    count: page.length,
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    shortcuts: page
  }
}

export const runShortcutMac = async ({ name, input }, { signal } = {}) => {
  const output = await runShortcutRunner(name, input, signal)
  return { shortcut: name, output }
}
