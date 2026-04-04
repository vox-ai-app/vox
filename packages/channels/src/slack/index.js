import { ChannelAdapter, chunkText } from '../adapter.js'

let boltMod = null
async function loadBolt() {
  if (boltMod) return boltMod
  boltMod = await import('@slack/bolt')
  return boltMod
}

const SLACK_MAX_LEN = 4000

export class SlackChannel extends ChannelAdapter {
  constructor(config = {}) {
    super('slack', config)
    this._app = null
    this._allowFrom = new Set(config.allowFrom || [])
    this._requireMention = config.requireMention !== false
    this._dmChannelCache = new Map()
  }

  async connect() {
    this._abortController = new AbortController()
    const { App } = await loadBolt()

    const botToken = this.config.botToken || process.env.SLACK_BOT_TOKEN
    const appToken = this.config.appToken || process.env.SLACK_APP_TOKEN
    if (!botToken)
      throw new Error('Slack bot token required (config.botToken or SLACK_BOT_TOKEN env)')
    if (!appToken)
      throw new Error('Slack app token required (config.appToken or SLACK_APP_TOKEN env)')

    this._app = new App({
      token: botToken,
      appToken,
      socketMode: true
    })

    this._botUserId = null

    this._app.event('message', async ({ event }) => {
      if (event.subtype) return
      if (event.bot_id) return

      const senderId = event.user
      if (!senderId) return

      if (this._allowFrom.size > 0 && !this._allowFrom.has('*') && !this._allowFrom.has(senderId)) {
        return
      }

      const isGroup = event.channel_type === 'channel' || event.channel_type === 'group'
      const isDM = event.channel_type === 'im'

      if (isGroup && this._requireMention && this._botUserId) {
        if (!event.text?.includes(`<@${this._botUserId}>`)) return
      }

      const text = event.text
      if (!text) return

      this._emitMessage({
        channel: 'slack',
        peerId: event.channel,
        senderId,
        text,
        raw: event,
        isGroup,
        isDM,
        messageId: event.ts,
        senderName: '',
        timestamp: parseFloat(event.ts) * 1000,
        threadTs: event.thread_ts || event.ts
      })
    })

    await this._app.start()

    const authResult = await this._app.client.auth.test({ token: botToken })
    this._botUserId = authResult.user_id

    this._setConnected()
  }

  async disconnect() {
    if (this._app) {
      await this._app.stop()
      this._app = null
    }
    this._dmChannelCache.clear()
    await super.disconnect()
  }

  async send(peerId, text, opts = {}) {
    if (!this._app) throw new Error('Slack not connected')

    const chunks = chunkText(text, SLACK_MAX_LEN)
    const sent = []
    for (const chunk of chunks) {
      const payload = {
        channel: peerId,
        text: chunk
      }
      if (opts.threadTs) payload.thread_ts = opts.threadTs
      if (opts.mrkdwn === false) payload.mrkdwn = false
      const result = await this._app.client.chat.postMessage(payload)
      sent.push(result)
    }
    return sent.length === 1 ? { messageId: sent[0].ts } : { messageIds: sent.map((r) => r.ts) }
  }

  async editMessage(peerId, messageId, text) {
    if (!this._app) throw new Error('Slack not connected')
    await this._app.client.chat.update({
      channel: peerId,
      ts: messageId,
      text: text.slice(0, SLACK_MAX_LEN)
    })
    return { messageId }
  }

  async deleteMessage(peerId, messageId) {
    if (!this._app) throw new Error('Slack not connected')
    await this._app.client.chat.delete({
      channel: peerId,
      ts: messageId
    })
    return { messageId }
  }

  async react(peerId, messageId, emoji) {
    if (!this._app) throw new Error('Slack not connected')
    await this._app.client.reactions.add({
      channel: peerId,
      timestamp: messageId,
      name: emoji
    })
    return { messageId, emoji }
  }

  async readMessages(peerId, opts = {}) {
    if (!this._app) throw new Error('Slack not connected')
    const params = {
      channel: peerId,
      limit: Math.min(opts.limit || 25, 200)
    }
    if (opts.before) params.latest = opts.before
    if (opts.after) params.oldest = opts.after
    const result = await this._app.client.conversations.history(params)
    return (result.messages || []).map((m) => ({
      messageId: m.ts,
      senderId: m.user || m.bot_id || '',
      text: m.text || '',
      timestamp: parseFloat(m.ts) * 1000,
      threadTs: m.thread_ts
    }))
  }

  async sendDM(userId, text, opts = {}) {
    if (!this._app) throw new Error('Slack not connected')

    let channelId = this._dmChannelCache.get(userId)
    if (!channelId) {
      const result = await this._app.client.conversations.open({ users: userId })
      channelId = result.channel.id
      this._dmChannelCache.set(userId, channelId)
      if (this._dmChannelCache.size > 1024) {
        const first = this._dmChannelCache.keys().next().value
        this._dmChannelCache.delete(first)
      }
    }

    await this.send(channelId, text, opts)
  }
}
