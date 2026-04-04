import { randomUUID } from 'crypto'
import { sendChatMessage, waitForChatResult } from '../ai/llm.bridge'
import { getToolDefinitions } from '../chat/chat.tools'
import { getSystemPrompt } from '../chat/chat.session'

const sessions = new Map()
const activity = []
const MAX_ACTIVITY = 100
const MAX_SESSION_MESSAGES = 40
const SESSION_TTL = 4 * 60 * 60 * 1000

function sessionKey(channel, peerId) {
  return `${channel}:${peerId}`
}

function getOrCreate(channel, peerId, senderName) {
  const key = sessionKey(channel, peerId)
  let session = sessions.get(key)
  if (!session) {
    session = {
      channel,
      peerId,
      senderName: senderName || peerId,
      messages: [],
      createdAt: Date.now(),
      lastMessageAt: Date.now()
    }
    sessions.set(key, session)
  }
  if (senderName && senderName !== peerId) session.senderName = senderName
  session.lastMessageAt = Date.now()
  return session
}

function addMessage(session, role, content) {
  session.messages.push({ role, content, timestamp: Date.now() })
  if (session.messages.length > MAX_SESSION_MESSAGES) {
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES)
  }
  session.lastMessageAt = Date.now()
}

function buildChannelSystemPrompt(session) {
  const base = getSystemPrompt()
  const context = [
    `\n\nYou are replying on behalf of the user via ${session.channel}.`,
    `The person you're talking to is "${session.senderName}".`,
    'Keep replies concise and conversational — this is a chat message, not an essay.',
    'Match the tone of the conversation. Be helpful but brief.'
  ].join(' ')
  return base + context
}

export async function handleChannelMessage({ channel, peerId, text, senderName }) {
  const session = getOrCreate(channel, peerId, senderName)
  addMessage(session, 'user', text)

  const requestId = randomUUID()
  const systemPrompt = buildChannelSystemPrompt(session)
  const history = session.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))
  const toolDefinitions = getToolDefinitions()

  sendChatMessage({
    requestId,
    message: text,
    systemPrompt,
    history,
    toolDefinitions,
    silent: true
  })

  const { finalText } = await waitForChatResult(requestId)
  const reply = finalText || ''

  if (reply) addMessage(session, 'assistant', reply)

  const entry = {
    id: randomUUID(),
    channel,
    peerId,
    senderName: session.senderName,
    inbound: text,
    reply,
    timestamp: Date.now()
  }
  activity.unshift(entry)
  if (activity.length > MAX_ACTIVITY) activity.length = MAX_ACTIVITY

  return { reply, activityEntry: entry }
}

export function getRecentActivity(limit = 50) {
  return activity.slice(0, limit)
}

export function getThread(channel, peerId) {
  const key = sessionKey(channel, peerId)
  const session = sessions.get(key)
  if (!session) return { senderName: peerId, messages: [] }
  return {
    senderName: session.senderName,
    channel: session.channel,
    peerId: session.peerId,
    messages: session.messages
  }
}

export function clearExpiredSessions() {
  const now = Date.now()
  for (const [key, s] of sessions) {
    if (now - s.lastMessageAt > SESSION_TTL) sessions.delete(key)
  }
}

export function clearAllSessions() {
  sessions.clear()
  activity.length = 0
}
