import {
  ensureConversation as _ensureConversation,
  touchConversation as _touchConversation,
  appendMessage as _appendMessage,
  getMessages as _getMessages,
  getMessagesBeforeId as _getMessagesBeforeId,
  clearMessages as _clearMessages
} from '@vox-ai-app/storage/messages'
import { getDb } from './db.js'

export const ensureConversation = (id) => _ensureConversation(getDb(), id)
export const touchConversation = (id) => _touchConversation(getDb(), id)
export const appendMessage = (role, content, conversationId) =>
  _appendMessage(getDb(), role, content, conversationId)
export const getMessages = (conversationId, limit) => _getMessages(getDb(), conversationId, limit)
export const getMessagesBeforeId = (beforeId, conversationId, limit) =>
  _getMessagesBeforeId(getDb(), beforeId, conversationId, limit)
export const clearMessages = (conversationId) => _clearMessages(getDb(), conversationId)
