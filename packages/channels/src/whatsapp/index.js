import path from 'node:path'
import fs from 'node:fs'
import { ChannelAdapter, chunkText } from '../adapter.js'

let baileys = null
async function loadBaileys() {
  if (baileys) return baileys
  baileys = await import('@whiskeysockets/baileys')
  return baileys
}

const WHATSAPP_MAX_LEN = 4096

export class WhatsAppChannel extends ChannelAdapter {
  constructor(config = {}) {
    super('whatsapp', config)
    this._sock = null
    this._authDir = config.authDir || path.join(process.env.HOME || '', '.vox', 'whatsapp-auth')
    this._allowFrom = new Set(config.allowFrom || [])
  }

  async connect() {
    this._abortController = new AbortController()
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
      await loadBaileys()

    fs.mkdirSync(this._authDir, { recursive: true, mode: 0o700 })
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(this._authDir)
    const { version } = await fetchLatestBaileysVersion()

    this._sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: this.config.printQR !== false,
      browser: ['Vox', 'Desktop', '1.0.0'],
      syncFullHistory: false
    })

    this._sock.ev.on('creds.update', saveCreds)

    this._sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) this.emit('qr', { channel: 'whatsapp', qr })

      if (connection === 'close') {
        this._setDisconnected()
        const code = lastDisconnect?.error?.output?.statusCode
        const loggedOut = code === (DisconnectReason?.loggedOut ?? 401)

        if (loggedOut) {
          this.emit('status', { channel: this.id, status: 'logged_out' })
          return
        }

        this._scheduleReconnect()
      }

      if (connection === 'open') {
        this._setConnected()
      }
    })

    this._sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        if (msg.key.fromMe) continue

        const peerId = msg.key.remoteJid
        if (this._allowFrom.size > 0 && !this._allowFrom.has('*') && !this._allowFrom.has(peerId)) {
          continue
        }

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

        if (!text) continue

        const isGroup = peerId?.endsWith('@g.us') || false
        const senderName = msg.pushName || ''

        this._emitMessage({
          channel: 'whatsapp',
          peerId,
          senderId: isGroup ? msg.key.participant || peerId : peerId,
          senderName,
          text,
          raw: msg,
          isGroup,
          messageId: msg.key.id,
          timestamp: (msg.messageTimestamp || 0) * 1000
        })
      }
    })
  }

  async disconnect() {
    if (this._abortController) {
      this._abortController.abort()
    }
    if (this._sock) {
      this._sock.end(undefined)
      this._sock = null
    }
    await super.disconnect()
  }

  async send(peerId, text, opts = {}) {
    if (!this._sock) throw new Error('WhatsApp not connected')

    if (this.config.sendComposing !== false) {
      await this._sock.sendPresenceUpdate('composing', peerId).catch(() => {})
    }

    const chunks = chunkText(text, WHATSAPP_MAX_LEN)
    const sent = []
    for (const chunk of chunks) {
      const msgOpts = opts.quoted ? { quoted: opts.quoted } : {}
      const result = await this._sock.sendMessage(peerId, { text: chunk }, msgOpts)
      sent.push(result)
    }
    return sent.length === 1
      ? { messageId: sent[0]?.key?.id }
      : { messageIds: sent.map((r) => r?.key?.id) }
  }

  async deleteMessage(peerId, messageId) {
    if (!this._sock) throw new Error('WhatsApp not connected')
    await this._sock.sendMessage(peerId, {
      delete: { remoteJid: peerId, id: messageId, fromMe: true }
    })
    return { messageId }
  }

  async react(peerId, messageId, emoji) {
    if (!this._sock) throw new Error('WhatsApp not connected')
    await this._sock.sendMessage(peerId, {
      react: { text: emoji, key: { remoteJid: peerId, id: messageId, fromMe: false } }
    })
    return { messageId, emoji }
  }

  async sendTyping(peerId) {
    if (!this._sock) return
    await this._sock.sendPresenceUpdate('composing', peerId).catch(() => {})
  }

  async stopTyping(peerId) {
    if (!this._sock) return
    await this._sock.sendPresenceUpdate('paused', peerId).catch(() => {})
  }
}
