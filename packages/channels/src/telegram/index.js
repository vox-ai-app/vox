import { ChannelAdapter, chunkText } from '../adapter.js'

let grammyMod = null
async function loadGrammy() {
  if (grammyMod) return grammyMod
  grammyMod = await import('grammy')
  return grammyMod
}

const TELEGRAM_MAX_LEN = 4096

export class TelegramChannel extends ChannelAdapter {
  constructor(config = {}) {
    super('telegram', config)
    this._bot = null
    this._allowFrom = new Set(config.allowFrom || [])
  }

  async connect() {
    this._abortController = new AbortController()
    const { Bot } = await loadGrammy()

    const token = this.config.botToken || process.env.TELEGRAM_BOT_TOKEN
    if (!token)
      throw new Error('Telegram bot token required (config.botToken or TELEGRAM_BOT_TOKEN env)')

    this._bot = new Bot(token)

    this._bot.on('message:text', (ctx) => {
      const senderId = String(ctx.from.id)
      const chatId = String(ctx.chat.id)

      if (this._allowFrom.size > 0 && !this._allowFrom.has('*') && !this._allowFrom.has(senderId)) {
        return
      }

      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'

      if (isGroup && this.config.requireMention !== false) {
        const botUsername = this._bot.botInfo?.username
        if (botUsername && !ctx.message.text.includes(`@${botUsername}`)) return
      }

      this._emitMessage({
        channel: 'telegram',
        peerId: chatId,
        senderId,
        text: ctx.message.text,
        raw: ctx,
        isGroup,
        messageId: String(ctx.message.message_id),
        senderName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        timestamp: ctx.message.date * 1000
      })
    })

    this._bot.catch((err) => {
      this._emitError(err)
    })

    this._bot.start({
      onStart: () => {
        this._setConnected()
      }
    })
  }

  async disconnect() {
    if (this._bot) {
      await this._bot.stop()
      this._bot = null
    }
    await super.disconnect()
  }

  async send(peerId, text, opts = {}) {
    if (!this._bot) throw new Error('Telegram bot not connected')

    const chunks = chunkText(text, TELEGRAM_MAX_LEN)
    const sent = []
    for (const chunk of chunks) {
      const extra = {}
      if (opts.replyToMessageId) extra.reply_to_message_id = opts.replyToMessageId
      if (opts.parseMode) extra.parse_mode = opts.parseMode
      const result = await this._bot.api.sendMessage(peerId, chunk, extra)
      sent.push(result)
    }
    return sent.length === 1
      ? { messageId: String(sent[0].message_id) }
      : { messageIds: sent.map((m) => String(m.message_id)) }
  }

  async editMessage(peerId, messageId, text) {
    if (!this._bot) throw new Error('Telegram bot not connected')
    await this._bot.api.editMessageText(peerId, Number(messageId), text.slice(0, TELEGRAM_MAX_LEN))
    return { messageId }
  }

  async deleteMessage(peerId, messageId) {
    if (!this._bot) throw new Error('Telegram bot not connected')
    await this._bot.api.deleteMessage(peerId, Number(messageId))
    return { messageId }
  }

  async react(peerId, messageId, emoji) {
    if (!this._bot) throw new Error('Telegram bot not connected')
    await this._bot.api.setMessageReaction(peerId, Number(messageId), [{ type: 'emoji', emoji }])
    return { messageId, emoji }
  }

  async sendTyping(peerId) {
    if (!this._bot) return
    await this._bot.api.sendChatAction(peerId, 'typing').catch(() => {})
  }
}
