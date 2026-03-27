import { resolveLocalPath } from '@vox-ai-app/tools'
import {
  execAbortable,
  esc,
  EXEC_TIMEOUT,
  writeTempScript,
  cleanupTemp
} from '@vox-ai-app/tools/exec'
import { ensureAppleMailConfigured } from '../../shared/index.js'

const runAs = async (script, signal) => {
  await ensureAppleMailConfigured()
  const scriptFile = await writeTempScript(script, 'scpt')
  try {
    const { stdout } = await execAbortable(
      `osascript "${scriptFile}"`,
      { timeout: EXEC_TIMEOUT },
      signal
    )
    const out = stdout.trim()
    if (out.startsWith('ERROR:')) throw new Error(out.slice(6))
    return out
  } finally {
    await cleanupTemp(scriptFile)
  }
}

const findMessageById = (messageId) => [
  `set targetId to ${Number(messageId)}`,
  'set theMsg to missing value',
  'set theMb to missing value',
  'set allBoxes to {}',
  'repeat with acct in every account',
  '  try',
  '    set end of allBoxes to mailbox "INBOX" of acct',
  '  end try',
  '  try',
  '    repeat with mb in every mailbox of acct',
  '      set end of allBoxes to mb',
  '    end repeat',
  '  end try',
  'end repeat',
  'repeat with mb in allBoxes',
  '  try',
  '    set theMsg to first message of mb whose id is targetId',
  '    set theMb to mb',
  '    exit repeat',
  '  end try',
  'end repeat',
  'if theMsg is missing value then return "ERROR:message not found"'
]
export const replyToEmailMac = async (
  { messageId, body, replyAll = false, account },
  { signal } = {}
) => {
  const bodyEsc = esc(body)
  const replyCmd = replyAll ? 'reply theMsg with reply to all' : 'reply theMsg'
  const senderLines = account
    ? [
        `  set acct to first account whose name contains "${esc(account)}"`,
        '  set addressesList to email addresses of acct',
        '  set senderAddr to item 1 of addressesList',
        '  set sender of replyMsg to senderAddr'
      ]
    : []
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    `  set replyMsg to ${replyCmd}`,
    ...senderLines,
    '  tell replyMsg',
    `    set content to "${bodyEsc}"`,
    '  end tell',
    '  send replyMsg',
    '  return "sent"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'sent',
    messageId,
    replyAll
  }
}
export const forwardEmailMac = async ({ messageId, to, body = '', account }, { signal } = {}) => {
  const bodyEsc = esc(body)
  const senderLines = account
    ? [
        `  set acct to first account whose name contains "${esc(account)}"`,
        '  set addressesList to email addresses of acct',
        '  set senderAddr to item 1 of addressesList',
        '  set sender of fwdMsg to senderAddr'
      ]
    : []
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    '  set fwdMsg to forward theMsg with opening window',
    ...senderLines,
    '  tell fwdMsg',
    ...(Array.isArray(to) ? to : [to]).map(
      (addr) => `    make new to recipient with properties {address:"${esc(addr)}"}`
    ),
    bodyEsc ? `    set content to "${bodyEsc}" & return & return & (content of fwdMsg)` : '',
    '  end tell',
    '  send fwdMsg',
    '  return "sent"',
    'end tell'
  ]
    .filter(Boolean)
    .join('\n')
  await runAs(script, signal)
  return {
    status: 'sent',
    messageId,
    to
  }
}
export const markEmailReadMac = async ({ messageId, read = true }, { signal } = {}) => {
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    `  set read status of theMsg to ${read}`,
    '  return "done"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'done',
    messageId,
    read
  }
}
export const flagEmailMac = async ({ messageId, flagged = true }, { signal } = {}) => {
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    `  set flagged status of theMsg to ${flagged}`,
    '  return "done"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'done',
    messageId,
    flagged
  }
}
export const deleteEmailMac = async ({ messageId }, { signal } = {}) => {
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    '  delete theMsg',
    '  return "deleted"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'deleted',
    messageId
  }
}
export const moveEmailMac = async ({ messageId, targetFolder }, { signal } = {}) => {
  const folderEsc = esc(targetFolder)
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    '  set targetBox to missing value',
    '  repeat with acct in every account',
    '    repeat with mb in mailboxes of acct',
    `      if name of mb contains "${folderEsc}" then`,
    '        set targetBox to mb',
    '        exit repeat',
    '      end if',
    '    end repeat',
    '    if targetBox is not missing value then exit repeat',
    '  end repeat',
    '  if targetBox is missing value then',
    '    repeat with mb in every mailbox',
    `      if name of mb contains "${folderEsc}" then`,
    '        set targetBox to mb',
    '        exit repeat',
    '      end if',
    '    end repeat',
    '  end if',
    '  if targetBox is missing value then return "ERROR:target folder not found"',
    '  move theMsg to targetBox',
    '  return "moved"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'moved',
    messageId,
    targetFolder
  }
}
export const createDraftMac = async (
  { to, subject, body, cc, bcc, attachments, account },
  { signal } = {}
) => {
  const lines = ['tell application "Mail"']
  if (account) {
    lines.push(
      `  set acct to first account whose name contains "${esc(account)}"`,
      '  set addressesList to email addresses of acct',
      '  set senderAddr to item 1 of addressesList',
      `  set msg to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(body).replace(/\n/g, '\\n')}", visible:true, sender:senderAddr}`
    )
  } else {
    lines.push(
      `  set msg to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(body).replace(/\n/g, '\\n')}", visible:true}`
    )
  }
  lines.push('  tell msg')
  const toList = Array.isArray(to) ? to : [to]
  for (const addr of toList) {
    lines.push(`    make new to recipient with properties {address:"${esc(addr)}"}`)
  }
  if (cc) {
    const ccList = Array.isArray(cc) ? cc : [cc]
    for (const addr of ccList) {
      lines.push(`    make new cc recipient with properties {address:"${esc(addr)}"}`)
    }
  }
  if (bcc) {
    const bccList = Array.isArray(bcc) ? bcc : [bcc]
    for (const addr of bccList) {
      lines.push(`    make new bcc recipient with properties {address:"${esc(addr)}"}`)
    }
  }
  if (attachments?.length) {
    for (const p of attachments) {
      const abs = resolveLocalPath(p)
      lines.push(
        `    make new attachment with properties {file name:(POSIX file "${esc(abs)}")} at after the last paragraph`
      )
    }
  }
  lines.push('  end tell', '  return "draft created"', 'end tell')
  await runAs(lines.join('\n'), signal)
  return {
    status: 'draft_created',
    to,
    subject
  }
}
export const saveAttachmentMac = async (
  { messageId, attachmentName, savePath },
  { signal } = {}
) => {
  const saveDir = resolveLocalPath(savePath || '~/Downloads')
  const attNameEsc = esc(attachmentName)
  const script = [
    'tell application "Mail"',
    ...findMessageById(messageId),
    '  set attFound to false',
    '  repeat with att in mail attachments of theMsg',
    `    if name of att contains "${attNameEsc}" then`,
    `      save att in POSIX file "${esc(saveDir)}/${attNameEsc}"`,
    '      set attFound to true',
    '      exit repeat',
    '    end if',
    '  end repeat',
    '  if not attFound then return "ERROR:attachment not found"',
    '  return "saved"',
    'end tell'
  ].join('\n')
  await runAs(script, signal)
  return {
    status: 'saved',
    attachmentName,
    path: `${saveDir}/${attachmentName}`
  }
}
