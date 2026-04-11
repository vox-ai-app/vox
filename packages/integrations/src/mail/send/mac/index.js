import { resolveLocalPath } from '@vox-ai-app/tools'
import {
  execAbortable,
  esc,
  EXEC_TIMEOUT,
  writeTempScript,
  cleanupTemp
} from '@vox-ai-app/tools/exec'
import { ensureAppleMailConfigured } from '../../shared/index.js'
export const sendEmailMac = async (
  { to, cc = [], bcc = [], subject, body, attachments = [], account },
  { signal } = {}
) => {
  await ensureAppleMailConfigured(signal)
  const bodyEsc = esc(body).replace(/\n/g, '" & return & "')
  const lines = ['tell application "Mail"']
  if (account) {
    lines.push(
      `  set acct to first account whose name contains "${esc(account)}"`,
      '  set addressesList to email addresses of acct',
      '  set senderAddr to item 1 of addressesList',
      `  set msg to make new outgoing message with properties {subject:"${esc(subject)}", content:"${bodyEsc}", visible:false, sender:senderAddr}`
    )
  } else {
    lines.push(
      `  set msg to make new outgoing message with properties {subject:"${esc(subject)}", content:"${bodyEsc}", visible:false}`
    )
  }
  lines.push('  tell msg')
  for (const addr of to) {
    lines.push(`    make new to recipient with properties {address:"${esc(addr)}"}`)
  }
  for (const addr of cc) {
    lines.push(`    make new cc recipient with properties {address:"${esc(addr)}"}`)
  }
  for (const addr of bcc) {
    lines.push(`    make new bcc recipient with properties {address:"${esc(addr)}"}`)
  }
  for (const p of attachments) {
    const abs = resolveLocalPath(p)
    lines.push(
      `    make new attachment with properties {file name:(POSIX file "${esc(abs)}")} at after the last paragraph`
    )
  }
  lines.push('  end tell', '  send msg', 'end tell')
  const scriptFile = await writeTempScript(lines.join('\n'), 'scpt')
  try {
    await execAbortable(
      `osascript "${scriptFile}"`,
      {
        timeout: EXEC_TIMEOUT
      },
      signal
    )
    return {
      status: 'sent',
      to,
      subject
    }
  } finally {
    await cleanupTemp(scriptFile)
  }
}
