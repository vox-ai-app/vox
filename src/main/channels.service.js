import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { logger } from './logger'

const channels = new Map()
let _messageHandler = null
let _statusHandler = null
let _qrHandler = null

export function setChannelMessageHandler(handler) {
  _messageHandler = handler
}

export function setChannelStatusHandler(handler) {
  _statusHandler = handler
}

export function setChannelQrHandler(handler) {
  _qrHandler = handler
}

function bindChannelEvents(channel) {
  channel.on('message', (msg) => {
    logger.info(
      `[channels] ${msg.channel} message from ${msg.senderId || msg.peerId}: ${msg.text.slice(0, 50)}`
    )
    if (_messageHandler) _messageHandler(msg)
  })

  channel.on('status', (status) => {
    logger.info(`[channels] ${status.channel} status: ${status.status}`)
    if (_statusHandler) _statusHandler(status)
  })

  channel.on('error', ({ channel: id, error }) => {
    logger.warn(`[channels] ${id} error:`, error)
  })
}

async function teardownExisting(id) {
  const existing = channels.get(id)
  if (!existing) return
  try {
    await existing.disconnect()
  } catch {
    /* ignore teardown errors */
  }
  channels.delete(id)
}

export async function initWhatsApp(config = {}) {
  await teardownExisting('whatsapp')
  const { WhatsAppChannel } = await import('@vox-ai-app/channels/whatsapp')

  const authDir = config.authDir || path.join(app.getPath('userData'), 'whatsapp-auth')

  const wa = new WhatsAppChannel({
    authDir,
    allowFrom: config.allowFrom || [],
    printQR: false,
    sendComposing: true,
    ...config
  })

  wa.on('qr', ({ qr }) => {
    logger.info('[channels] WhatsApp QR ready — scan with your phone')
    if (_qrHandler) _qrHandler({ channel: 'whatsapp', qr })
  })

  bindChannelEvents(wa)
  await wa.connect()
  channels.set('whatsapp', wa)
  return wa
}

export async function initTelegram(config = {}) {
  await teardownExisting('telegram')
  const { TelegramChannel } = await import('@vox-ai-app/channels/telegram')

  const tg = new TelegramChannel({
    botToken: config.botToken || process.env.TELEGRAM_BOT_TOKEN,
    allowFrom: config.allowFrom || [],
    requireMention: true,
    ...config
  })

  bindChannelEvents(tg)
  await tg.connect()
  channels.set('telegram', tg)
  return tg
}

export async function initDiscord(config = {}) {
  await teardownExisting('discord')
  const { DiscordChannel } = await import('@vox-ai-app/channels/discord')

  const dc = new DiscordChannel({
    botToken: config.botToken || process.env.DISCORD_BOT_TOKEN,
    allowFrom: config.allowFrom || [],
    requireMention: true,
    ...config
  })

  bindChannelEvents(dc)
  await dc.connect()
  channels.set('discord', dc)
  return dc
}

export async function initSlack(config = {}) {
  await teardownExisting('slack')
  const { SlackChannel } = await import('@vox-ai-app/channels/slack')

  const sl = new SlackChannel({
    botToken: config.botToken || process.env.SLACK_BOT_TOKEN,
    appToken: config.appToken || process.env.SLACK_APP_TOKEN,
    allowFrom: config.allowFrom || [],
    requireMention: true,
    ...config
  })

  bindChannelEvents(sl)
  await sl.connect()
  channels.set('slack', sl)
  return sl
}

export async function initChannel(channelId, config = {}) {
  const initializers = {
    whatsapp: initWhatsApp,
    telegram: initTelegram,
    discord: initDiscord,
    slack: initSlack
  }
  const init = initializers[channelId]
  if (!init) throw new Error(`Unknown channel: ${channelId}`)
  return init(config)
}

function getWhatsAppAuthDir() {
  return path.join(app.getPath('userData'), 'whatsapp-auth')
}

export async function disconnectChannel(channelId) {
  await teardownExisting(channelId)
  if (channelId === 'whatsapp') {
    const authDir = getWhatsAppAuthDir()
    try {
      await fs.promises.rm(authDir, { recursive: true, force: true })
      logger.info('[channels] WhatsApp auth data deleted')
    } catch (err) {
      logger.warn('[channels] Failed to delete WhatsApp auth:', err)
    }
  }
}

export function hasWhatsAppAuth() {
  const authDir = getWhatsAppAuthDir()
  try {
    const files = fs.readdirSync(authDir)
    return files.length > 0
  } catch {
    return false
  }
}

export async function sendToChannel(channelId, peerId, text, opts = {}) {
  const ch = channels.get(channelId)
  if (!ch) throw new Error(`Channel ${channelId} not connected`)
  await ch.send(peerId, text, opts)
}

export function getChannel(channelId) {
  return channels.get(channelId) || null
}

export function getConnectedChannels() {
  return Array.from(channels.entries()).map(([id, ch]) => ({
    id,
    connected: ch.isConnected()
  }))
}

export async function destroyChannels() {
  for (const [id, ch] of channels) {
    try {
      await ch.disconnect()
    } catch (err) {
      logger.warn(`[channels] Error disconnecting ${id}:`, err)
    }
  }
  channels.clear()
}
