import { EventEmitter } from 'node:events'

const DEFAULT_RECONNECT = {
  initialMs: 2000,
  maxMs: 30000,
  factor: 1.8,
  jitter: 0.25,
  maxAttempts: 12
}

export class ChannelAdapter extends EventEmitter {
  constructor(id, config = {}) {
    super()
    this.id = id
    this.config = config
    this.accountId = config.accountId || 'default'
    this.connected = false
    this._reconnect = { ...DEFAULT_RECONNECT, ...config.reconnect }
    this._retryCount = 0
    this._abortController = null
    this._dedupeCache = new Map()
    this._dedupeTtl = config.dedupeTtlMs || 300_000
    this._dedupeMax = config.dedupeMaxSize || 5000
    this._typingTimers = new Map()
  }

  async connect() {
    this._abortController = new AbortController()
    throw new Error(`${this.id}: connect() not implemented`)
  }

  async disconnect() {
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    this.connected = false
    this._retryCount = 0
    for (const timer of this._typingTimers.values()) clearTimeout(timer)
    this._typingTimers.clear()
    this.emit('status', { channel: this.id, status: 'disconnected' })
  }

  async send(_peerId, _text, _opts = {}) {
    throw new Error(`${this.id}: send() not implemented`)
  }

  async editMessage(_peerId, _messageId, _text) {
    throw new Error(`${this.id}: editMessage() not supported`)
  }

  async deleteMessage(_peerId, _messageId) {
    throw new Error(`${this.id}: deleteMessage() not supported`)
  }

  async react(_peerId, _messageId, _emoji) {
    throw new Error(`${this.id}: react() not supported`)
  }

  async readMessages(_peerId, _opts = {}) {
    throw new Error(`${this.id}: readMessages() not supported`)
  }

  async sendTyping(_peerId) {
    /* noop */
  }

  async stopTyping(_peerId) {
    /* noop */
  }

  async executeAction(action) {
    switch (action.action) {
      case 'send':
        return this.send(action.to, action.message, action)
      case 'edit':
        return this.editMessage(action.channelId || action.to, action.messageId, action.message)
      case 'delete':
        return this.deleteMessage(action.channelId || action.to, action.messageId)
      case 'react':
        return this.react(action.channelId || action.to, action.messageId, action.emoji)
      case 'read':
        return this.readMessages(action.to, action)
      case 'typing':
        return this.sendTyping(action.to)
      default:
        throw new Error(`${this.id}: unknown action "${action.action}"`)
    }
  }

  isConnected() {
    return this.connected
  }

  toJSON() {
    return { id: this.id, accountId: this.accountId, connected: this.connected }
  }

  _setConnected() {
    this.connected = true
    this._retryCount = 0
    this.emit('status', { channel: this.id, status: 'connected' })
  }

  _setDisconnected() {
    this.connected = false
    this.emit('status', { channel: this.id, status: 'disconnected' })
  }

  _emitMessage(message) {
    if (!this._isDuplicate(message)) {
      this.emit('message', message)
    }
  }

  _emitError(error) {
    this.emit('error', { channel: this.id, error })
  }

  _isDuplicate(msg) {
    const key = `${msg.channel}:${msg.peerId}:${msg.timestamp}`
    if (this._dedupeCache.has(key)) return true
    if (this._dedupeCache.size >= this._dedupeMax) {
      const first = this._dedupeCache.keys().next().value
      this._dedupeCache.delete(first)
    }
    this._dedupeCache.set(key, Date.now())
    this._pruneDedupeCache()
    return false
  }

  _pruneDedupeCache() {
    const now = Date.now()
    for (const [key, ts] of this._dedupeCache) {
      if (now - ts > this._dedupeTtl) this._dedupeCache.delete(key)
      else break
    }
  }

  _computeBackoff() {
    const { initialMs, maxMs, factor, jitter } = this._reconnect
    const base = initialMs * Math.pow(factor, this._retryCount)
    const jitterMs = base * jitter * (Math.random() * 2 - 1)
    return Math.min(base + jitterMs, maxMs)
  }

  async _scheduleReconnect() {
    if (this._retryCount >= this._reconnect.maxAttempts) {
      this.emit('status', { channel: this.id, status: 'failed', reason: 'max retries exceeded' })
      return
    }
    this._retryCount++
    const delay = this._computeBackoff()
    this.emit('status', {
      channel: this.id,
      status: 'reconnecting',
      attempt: this._retryCount,
      delayMs: delay
    })
    await new Promise((r) => setTimeout(r, delay))
    if (!this._abortController || this._abortController.signal.aborted) return
    try {
      await this.connect()
    } catch (err) {
      this._emitError(err)
      await this._scheduleReconnect()
    }
  }
}

export function chunkText(text, maxLen = 2000) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  let remaining = text
  let openFence = null

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(openFence ? openFence + '\n' + remaining : remaining)
      break
    }

    let slice = remaining.slice(0, maxLen)
    let splitAt = slice.lastIndexOf('\n')
    if (splitAt < maxLen * 0.3) splitAt = maxLen

    let chunk = remaining.slice(0, splitAt)
    remaining = remaining.slice(splitAt).replace(/^\n/, '')

    const fences = chunk.match(/```/g)
    if (fences && fences.length % 2 !== 0) {
      if (openFence) {
        chunk = openFence + '\n' + chunk + '\n```'
        openFence = null
      } else {
        const lastFenceIdx = chunk.lastIndexOf('```')
        const fenceLine = chunk.slice(lastFenceIdx).split('\n')[0]
        openFence = fenceLine
        chunk = chunk + '\n```'
      }
    } else if (openFence) {
      chunk = openFence + '\n' + chunk + '\n```'
    }

    chunks.push(chunk)
  }

  return chunks
}
