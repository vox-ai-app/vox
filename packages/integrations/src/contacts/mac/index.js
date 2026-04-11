import { runAppleScript, esc } from '../../shared/applescript/index.js'

const SCRIPT_BODY = [
  '  set matched to every person whose name contains Q',
  '  repeat with p in matched',
  '    set pName to name of p',
  '    set pOrg to organization of p',
  '    set pTitle to job title of p',
  '    set pNotes to note of p',
  '',
  '    set eList to ""',
  '    repeat with e in emails of p',
  '      if eList is not "" then set eList to eList & ","',
  '      set eList to eList & (value of e)',
  '    end repeat',
  '',
  '    set phList to ""',
  '    repeat with ph in phones of p',
  '      if phList is not "" then set phList to phList & ","',
  '      set phList to phList & (value of ph)',
  '    end repeat',
  '',
  '    set addrList to ""',
  '    repeat with a in addresses of p',
  '      set addrStr to (street of a) & ", " & (city of a) & ", " & (state of a) & " " & (zip of a) & ", " & (country of a)',
  '      if addrList is not "" then set addrList to addrList & "|"',
  '      set addrList to addrList & addrStr',
  '    end repeat',
  '',
  '    set output to output & pName & "\\t" & eList & "\\t" & phList & "\\t" & (pOrg as text) & "\\t" & (pTitle as text) & "\\t" & addrList & "\\t" & (pNotes as text) & "\\n"',
  '  end repeat'
]

function parseContacts(raw) {
  if (!raw) return []
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, emails, phones, organization, title, addresses, notes] = line.split('\t')
      return {
        name: name?.trim() || '',
        emails: emails
          ? emails
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean)
          : [],
        phones: phones
          ? phones
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
        organization: organization?.trim() || '',
        title: title?.trim() || '',
        addresses: addresses
          ? addresses
              .split('|')
              .map((a) => a.trim())
              .filter(Boolean)
          : [],
        notes: notes?.trim() || ''
      }
    })
}

export const searchContactsMac = async (query, { signal } = {}) => {
  const script = [
    `set Q to "${esc(query)}"`,
    'set output to ""',
    'tell application "Contacts"',
    ...SCRIPT_BODY,
    'end tell',
    'return output'
  ]
  const out = await runAppleScript(script, signal)
  return parseContacts(out)
}
