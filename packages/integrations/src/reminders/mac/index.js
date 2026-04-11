import { runAppleScript, esc, toAppleDate } from '../../shared/applescript/index.js'

export const listRemindersMac = async (payload, { signal } = {}) => {
  const listFilter = String(payload?.list ?? '').trim()
  const includeCompleted = Boolean(payload?.include_completed ?? payload?.includeCompleted ?? false)

  const listLine = listFilter
    ? `set rLists to (every list whose name contains "${esc(listFilter)}")`
    : 'set rLists to every list'

  const completedFilter = includeCompleted ? '' : ' whose completed is false'

  const script = [
    'tell application "Reminders"',
    `  ${listLine}`,
    '  set output to ""',
    '  repeat with rList in rLists',
    '    set listName to name of rList',
    `    set rems to (every reminder of rList${completedFilter})`,
    '    repeat with r in rems',
    '      set rId to id of r',
    '      set rTitle to name of r',
    '      set rDone to completed of r',
    '      set rPri to priority of r',
    '      set rDue to ""',
    '      try',
    '        set rDue to due date of r as string',
    '      end try',
    '      set rNotes to ""',
    '      try',
    '        set rNotes to body of r',
    '      end try',
    '      set output to output & rId & "\\t" & rTitle & "\\t" & rDue & "\\t" & (rPri as string) & "\\t" & (rDone as string) & "\\t" & rNotes & "\\t" & listName & "\\n"',
    '    end repeat',
    '  end repeat',
    '  return output',
    'end tell'
  ]
  const out = await runAppleScript(script, signal)
  const reminders = String(out || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, title, dueDate, priority, completed, notes, list] = line.split('\t')
      return {
        id: id?.trim() || '',
        title: title?.trim() || '',
        due_date: dueDate?.trim() || '',
        priority: parseInt(priority) || 0,
        completed: completed?.trim() === 'true',
        notes: notes?.trim() || '',
        list: list?.trim() || ''
      }
    })
    .filter((r) => r.id && r.title)
  const total = reminders.length
  const limit = Math.min(Math.max(1, Number(payload?.limit) || 25), 200)
  const offset = Math.max(0, Number(payload?.offset) || 0)
  const page = reminders.slice(offset, offset + limit)
  return {
    count: page.length,
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    reminders: page
  }
}

export const createReminderMac = async (payload, { signal } = {}) => {
  const title = String(payload?.title ?? '').trim()
  if (!title) throw new Error('"title" is required.')
  const dueDate = payload?.due_date || payload?.dueDate || ''
  const priority = Number(payload?.priority ?? 0)
  const notes = String(payload?.notes ?? '').trim()
  const listFilter = String(payload?.list ?? '').trim()

  const listLine = listFilter
    ? `set rList to first list whose name contains "${esc(listFilter)}"`
    : 'set rList to default list'

  const props = [`name:"${esc(title)}"`]
  if (priority) props.push(`priority:${priority}`)
  if (notes) props.push(`body:"${esc(notes)}"`)

  const dueLine = dueDate ? `set due date of newRem to ${toAppleDate(dueDate)}` : ''

  const script = [
    'tell application "Reminders"',
    `  ${listLine}`,
    `  set newRem to make new reminder at end of reminders of rList with properties {${props.join(', ')}}`,
    dueLine,
    '  return id of newRem',
    'end tell'
  ].filter(Boolean)
  const reminderId = await runAppleScript(script, signal)
  return { status: 'created', reminder_id: reminderId, title }
}

export const completeReminderMac = async (payload, { signal } = {}) => {
  const reminderId = String(payload?.reminder_id || payload?.reminderId || '').trim()
  if (!reminderId) throw new Error('"reminder_id" is required.')

  const script = [
    'tell application "Reminders"',
    '  repeat with rList in every list',
    '    try',
    `      set targetRem to first reminder of rList whose id is "${esc(reminderId)}"`,
    '      set completed of targetRem to true',
    '      return "completed"',
    '    end try',
    '  end repeat',
    '  return "ERROR:reminder not found"',
    'end tell'
  ]
  await runAppleScript(script, signal)
  return { status: 'completed', reminder_id: reminderId }
}
