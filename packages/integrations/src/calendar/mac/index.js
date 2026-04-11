import { runAppleScript, esc, toAppleDate } from '../../shared/applescript/index.js'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const addDays = (iso, days) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const listEventsMac = async (payload, { signal } = {}) => {
  const startDate = payload?.start_date || payload?.startDate || today()
  const endDate = payload?.end_date || payload?.endDate || addDays(startDate, 7)
  const calFilter = String(payload?.calendar ?? '').trim()

  const calLine = calFilter
    ? `set cals to (every calendar whose name contains "${esc(calFilter)}")`
    : 'set cals to every calendar'

  const script = [
    'tell application "Calendar"',
    `  ${calLine}`,
    `  set startD to ${toAppleDate(startDate + 'T00:00:00')}`,
    `  set endD to ${toAppleDate(endDate + 'T23:59:59')}`,
    '  set output to ""',
    '  repeat with cal in cals',
    '    set calName to name of cal',
    '    set evts to (every event of cal whose start date >= startD and start date <= endD)',
    '    repeat with e in evts',
    '      set eId to uid of e',
    '      set eTitle to summary of e',
    '      set eStart to start date of e as string',
    '      set eEnd to end date of e as string',
    '      set eLoc to ""',
    '      try',
    '        set eLoc to location of e',
    '      end try',
    '      set eNotes to ""',
    '      try',
    '        set eNotes to description of e',
    '      end try',
    '      set output to output & eId & "\\t" & eTitle & "\\t" & eStart & "\\t" & eEnd & "\\t" & eLoc & "\\t" & eNotes & "\\t" & calName & "\\n"',
    '    end repeat',
    '  end repeat',
    '  return output',
    'end tell'
  ]
  const out = await runAppleScript(script, signal)
  const events = String(out || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, title, start, end, location, notes, calendar] = line.split('\t')
      return {
        id: id?.trim() || '',
        title: title?.trim() || '',
        start: start?.trim() || '',
        end: end?.trim() || '',
        location: location?.trim() || '',
        notes: notes?.trim() || '',
        calendar: calendar?.trim() || ''
      }
    })
    .filter((e) => e.id && e.title)
  const total = events.length
  const limit = Math.min(Math.max(1, Number(payload?.limit) || 25), 200)
  const offset = Math.max(0, Number(payload?.offset) || 0)
  const page = events.slice(offset, offset + limit)
  return {
    count: page.length,
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    events: page
  }
}

export const createEventMac = async (payload, { signal } = {}) => {
  const title = String(payload?.title ?? '').trim()
  if (!title) throw new Error('"title" is required.')
  const startDate = payload?.start_date || payload?.startDate
  if (!startDate) throw new Error('"start_date" is required.')
  const endDate = payload?.end_date || payload?.endDate
  const location = String(payload?.location ?? '').trim()
  const notes = String(payload?.notes ?? '').trim()
  const calFilter = String(payload?.calendar ?? '').trim()

  const endD = endDate
    ? toAppleDate(endDate)
    : toAppleDate(new Date(new Date(startDate).getTime() + 3600000).toISOString())

  const calLine = calFilter
    ? `set cal to first calendar whose name contains "${esc(calFilter)}"`
    : 'set cal to default calendar'

  const props = [
    `summary:"${esc(title)}"`,
    `start date:${toAppleDate(startDate)}`,
    `end date:${endD}`
  ]
  if (location) props.push(`location:"${esc(location)}"`)
  if (notes) props.push(`description:"${esc(notes)}"`)

  const script = [
    'tell application "Calendar"',
    `  ${calLine}`,
    `  set newEvent to make new event at end of events of cal with properties {${props.join(', ')}}`,
    '  return uid of newEvent',
    'end tell'
  ]
  const eventId = await runAppleScript(script, signal)
  return { status: 'created', event_id: eventId, title, start_date: startDate }
}

export const updateEventMac = async (payload, { signal } = {}) => {
  const eventId = String(payload?.event_id || payload?.eventId || '').trim()
  if (!eventId) throw new Error('"event_id" is required.')

  const updates = []
  if (payload?.title) updates.push(`set summary of targetEvent to "${esc(payload.title)}"`)
  if (payload?.start_date || payload?.startDate) {
    updates.push(
      `set start date of targetEvent to ${toAppleDate(payload.start_date || payload.startDate)}`
    )
  }
  if (payload?.end_date || payload?.endDate) {
    updates.push(
      `set end date of targetEvent to ${toAppleDate(payload.end_date || payload.endDate)}`
    )
  }
  if (payload?.location) updates.push(`set location of targetEvent to "${esc(payload.location)}"`)
  if (payload?.notes) updates.push(`set description of targetEvent to "${esc(payload.notes)}"`)

  if (!updates.length) return { status: 'no_changes', event_id: eventId }

  const script = [
    'tell application "Calendar"',
    '  set targetEvent to missing value',
    '  repeat with cal in every calendar',
    '    try',
    `      set targetEvent to first event of cal whose uid is "${esc(eventId)}"`,
    '      exit repeat',
    '    end try',
    '  end repeat',
    '  if targetEvent is missing value then return "ERROR:event not found"',
    ...updates.map((u) => `  ${u}`),
    '  return "updated"',
    'end tell'
  ]
  await runAppleScript(script, signal)
  return { status: 'updated', event_id: eventId }
}

export const deleteEventMac = async (payload, { signal } = {}) => {
  const eventId = String(payload?.event_id || payload?.eventId || '').trim()
  if (!eventId) throw new Error('"event_id" is required.')

  const script = [
    'tell application "Calendar"',
    '  repeat with cal in every calendar',
    '    try',
    `      set targetEvent to first event of cal whose uid is "${esc(eventId)}"`,
    '      delete targetEvent',
    '      return "deleted"',
    '    end try',
    '  end repeat',
    '  return "ERROR:event not found"',
    'end tell'
  ]
  await runAppleScript(script, signal)
  return { status: 'deleted', event_id: eventId }
}
