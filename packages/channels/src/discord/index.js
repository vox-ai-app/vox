import { ChannelAdapter, chunkText } from '../adapter.js'

let discordMod = null
async function loadDiscord() {
  if (discordMod) return discordMod
  discordMod = await import('discord.js')
  return discordMod
}

const DISCORD_MAX_LEN = 2000

export class DiscordChannel extends ChannelAdapter {
  constructor(config = {}) {
    super('discord', config)
    this._client = null
    this._allowFrom = new Set(config.allowFrom || [])
    this._requireMention = config.requireMention !== false
    this._sentMessages = new Map()
    this._sentMessagesMax = 500
  }

  async connect() {
    this._abortController = new AbortController()
    const { Client, GatewayIntentBits, Partials } = await loadDiscord()

    const token = this.config.botToken || process.env.DISCORD_BOT_TOKEN
    if (!token)
      throw new Error('Discord bot token required (config.botToken or DISCORD_BOT_TOKEN env)')

    this._client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [Partials.Channel, Partials.Reaction]
    })

    this._client.on('ready', () => {
      this._setConnected()
    })

    this._client.on('messageCreate', (msg) => {
      if (msg.author.bot) return
      if (msg.author.id === this._client.user?.id) return

      const senderId = msg.author.id
      if (this._allowFrom.size > 0 && !this._allowFrom.has('*') && !this._allowFrom.has(senderId)) {
        return
      }

      const isGroup = msg.guild !== null
      const isDM = msg.channel.type === 1

      if (isGroup && this._requireMention) {
        const mentioned = msg.mentions.users.has(this._client.user.id)
        if (!mentioned) return
      }

      const text = msg.content
      if (!text) return

      this._emitMessage({
        channel: 'discord',
        peerId: msg.channel.id,
        senderId,
        text,
        raw: msg,
        isGroup,
        isDM,
        messageId: msg.id,
        senderName: msg.member?.displayName || msg.author.displayName || msg.author.username,
        timestamp: msg.createdTimestamp,
        guildId: msg.guild?.id || null,
        guildName: msg.guild?.name || null
      })
    })

    this._client.on('error', (err) => {
      this._emitError(err)
    })

    this._client.on('shardDisconnect', () => {
      this._setDisconnected()
      this._scheduleReconnect()
    })

    this._client.on('shardReconnecting', () => {
      this.emit('status', { channel: this.id, status: 'reconnecting' })
    })

    await this._client.login(token)
  }

  async disconnect() {
    if (this._client) {
      await this._client.destroy()
      this._client = null
    }
    this._sentMessages.clear()
    await super.disconnect()
  }

  async send(peerId, text, opts = {}) {
    if (!this._client) throw new Error('Discord not connected')

    const channel = await this._client.channels.fetch(peerId)
    if (!channel?.isTextBased()) throw new Error(`Channel ${peerId} is not text-based`)

    const chunks = chunkText(text, DISCORD_MAX_LEN)
    const sent = []
    for (const chunk of chunks) {
      const payload = { content: chunk }
      if (opts.replyToMessageId) {
        payload.reply = { messageId: opts.replyToMessageId, failIfNotExists: false }
      }
      const msg = await channel.send(payload)
      sent.push(msg)
      this._trackSent(peerId, msg.id, msg)
    }
    return sent.length === 1 ? { messageId: sent[0].id } : { messageIds: sent.map((m) => m.id) }
  }

  async editMessage(peerId, messageId, text) {
    if (!this._client) throw new Error('Discord not connected')
    const channel = await this._client.channels.fetch(peerId)
    if (!channel?.isTextBased()) throw new Error(`Channel ${peerId} is not text-based`)
    const msg = await channel.messages.fetch(messageId)
    await msg.edit({ content: text.slice(0, DISCORD_MAX_LEN) })
    return { messageId }
  }

  async deleteMessage(peerId, messageId) {
    if (!this._client) throw new Error('Discord not connected')
    const channel = await this._client.channels.fetch(peerId)
    if (!channel?.isTextBased()) throw new Error(`Channel ${peerId} is not text-based`)
    const msg = await channel.messages.fetch(messageId)
    await msg.delete()
    this._sentMessages.delete(`${peerId}:${messageId}`)
    return { messageId }
  }

  async react(peerId, messageId, emoji) {
    if (!this._client) throw new Error('Discord not connected')
    const channel = await this._client.channels.fetch(peerId)
    if (!channel?.isTextBased()) throw new Error(`Channel ${peerId} is not text-based`)
    const msg = await channel.messages.fetch(messageId)
    await msg.react(emoji)
    return { messageId, emoji }
  }

  async readMessages(peerId, opts = {}) {
    if (!this._client) throw new Error('Discord not connected')
    const channel = await this._client.channels.fetch(peerId)
    if (!channel?.isTextBased()) throw new Error(`Channel ${peerId} is not text-based`)
    const fetchOpts = { limit: Math.min(opts.limit || 25, 100) }
    if (opts.before) fetchOpts.before = opts.before
    if (opts.after) fetchOpts.after = opts.after
    const msgs = await channel.messages.fetch(fetchOpts)
    return [...msgs.values()].map((m) => ({
      messageId: m.id,
      senderId: m.author.id,
      senderName: m.author.username,
      text: m.content,
      timestamp: m.createdTimestamp
    }))
  }

  async sendDM(userId, text, _opts = {}) {
    if (!this._client) throw new Error('Discord not connected')

    const user = await this._client.users.fetch(userId)
    const dm = await user.createDM()

    const chunks = chunkText(text, DISCORD_MAX_LEN)
    for (const chunk of chunks) {
      await dm.send({ content: chunk })
    }
  }

  async sendTyping(peerId) {
    if (!this._client) return
    const channel = await this._client.channels.fetch(peerId)
    if (channel?.isTextBased()) await channel.sendTyping()
  }

  _trackSent(peerId, messageId, msg) {
    const key = `${peerId}:${messageId}`
    this._sentMessages.set(key, msg)
    if (this._sentMessages.size > this._sentMessagesMax) {
      const first = this._sentMessages.keys().next().value
      this._sentMessages.delete(first)
    }
  }
}
