import * as send from './send/index.js'
import * as read from './read/index.js'
import * as manage from './manage/index.js'
const normalizeList = (v) => {
  if (!v) return []
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  return String(v)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
export const sendEmail = async (payload, opts) => {
  const to = normalizeList(payload?.to)
  if (!to.length) throw new Error('"to" is required.')
  const args = {
    to,
    cc: normalizeList(payload?.cc),
    bcc: normalizeList(payload?.bcc),
    subject: String(payload?.subject || '').trim(),
    body: String(payload?.body ?? payload?.text ?? payload?.content ?? '').trim(),
    attachments: normalizeList(payload?.attachments ?? payload?.attachment),
    account: String(payload?.account ?? '').trim() || undefined
  }
  return send.sendEmail(args, opts)
}
export const readEmails = async (payload, opts) => {
  const folder = String(payload?.folder ?? 'INBOX').trim()
  const limit = Math.min(Math.max(1, Number(payload?.limit ?? 20)), 200)
  const offset = Math.max(0, Number(payload?.offset ?? 0))
  const unreadOnly = Boolean(payload?.unread_only ?? payload?.unreadOnly ?? false)
  const search = String(payload?.search ?? '').trim()
  const account = String(payload?.account ?? '').trim() || undefined
  const args = {
    folder,
    limit,
    offset,
    unreadOnly,
    search,
    account
  }
  const messages = await read.readEmails(args, opts)
  return {
    folder,
    count: messages.length,
    messages
  }
}
export const getEmailBody = async (payload, opts) => {
  const sender = String(payload?.sender ?? payload?.from ?? '').trim()
  const subject = String(payload?.subject ?? '').trim()
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  const args = {
    sender,
    subject,
    messageId
  }
  return read.getEmailBody(args, opts)
}
export const replyToEmail = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const body = String(payload?.body ?? '').trim()
  if (!body) throw new Error('"body" is required.')
  const replyAll = Boolean(payload?.reply_all ?? payload?.replyAll ?? false)
  const account = String(payload?.account ?? '').trim() || undefined
  return manage.replyToEmail(
    {
      messageId,
      body,
      replyAll,
      account
    },
    opts
  )
}
export const forwardEmail = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const to = normalizeList(payload?.to)
  if (!to.length) throw new Error('"to" is required.')
  const body = String(payload?.body ?? '').trim()
  const account = String(payload?.account ?? '').trim() || undefined
  return manage.forwardEmail(
    {
      messageId,
      to,
      body,
      account
    },
    opts
  )
}
export const markEmailRead = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const read = payload?.read !== undefined ? Boolean(payload.read) : true
  return manage.markEmailRead(
    {
      messageId,
      read
    },
    opts
  )
}
export const flagEmail = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const flagged = payload?.flagged !== undefined ? Boolean(payload.flagged) : true
  return manage.flagEmail(
    {
      messageId,
      flagged
    },
    opts
  )
}
export const deleteEmail = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  return manage.deleteEmail(
    {
      messageId
    },
    opts
  )
}
export const moveEmail = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const targetFolder = String(payload?.target_folder ?? payload?.targetFolder ?? '').trim()
  if (!targetFolder) throw new Error('"target_folder" is required.')
  return manage.moveEmail(
    {
      messageId,
      targetFolder
    },
    opts
  )
}
export const createDraft = async (payload, opts) => {
  const to = normalizeList(payload?.to)
  if (!to.length) throw new Error('"to" is required.')
  return manage.createDraft(
    {
      to,
      subject: String(payload?.subject || '').trim(),
      body: String(payload?.body ?? payload?.text ?? payload?.content ?? '').trim(),
      cc: normalizeList(payload?.cc),
      bcc: normalizeList(payload?.bcc),
      attachments: normalizeList(payload?.attachments ?? payload?.attachment),
      account: String(payload?.account ?? '').trim() || undefined
    },
    opts
  )
}
export const saveAttachment = async (payload, opts) => {
  const messageId = String(payload?.message_id ?? payload?.messageId ?? '').trim()
  if (!messageId) throw new Error('"message_id" is required.')
  const attachmentName = String(payload?.attachment_name ?? payload?.attachmentName ?? '').trim()
  if (!attachmentName) throw new Error('"attachment_name" is required.')
  const savePath = String(payload?.save_path ?? payload?.savePath ?? '').trim() || undefined
  return manage.saveAttachment(
    {
      messageId,
      attachmentName,
      savePath
    },
    opts
  )
}
