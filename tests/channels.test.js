import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockBot = {
  start: vi.fn(({ onStart }) => {
    if (onStart) onStart()
  }),
  stop: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  catch: vi.fn(),
  botInfo: { username: 'testbot' },
  api: {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 100 }),
    sendChatAction: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    setMessageReaction: vi.fn().mockResolvedValue(true)
  }
}

const mockDiscordClient = {
  on: vi.fn(),
  login: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  user: { id: 'bot123' },
  channels: { fetch: vi.fn() },
  users: { fetch: vi.fn() }
}

const mockSlackApp = {
  event: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  client: {
    auth: { test: vi.fn().mockResolvedValue({ user_id: 'U123' }) },
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    reactions: { add: vi.fn().mockResolvedValue({ ok: true }) },
    conversations: {
      open: vi.fn().mockResolvedValue({ channel: { id: 'D456' } }),
      history: vi.fn().mockResolvedValue({ messages: [] })
    }
  }
}

vi.mock('@whiskeysockets/baileys', () => ({
  default: {
    makeWASocket: vi.fn(),
    useMultiFileAuthState: vi.fn(),
    DisconnectReason: { loggedOut: 401 },
    fetchLatestBaileysVersion: vi.fn()
  },
  makeWASocket: vi.fn(),
  useMultiFileAuthState: vi.fn().mockResolvedValue({ state: {}, saveCreds: vi.fn() }),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 2413, 1] })
}))

vi.mock('grammy', () => ({
  Bot: function GrammyBot() {
    return mockBot
  }
}))

vi.mock('discord.js', () => ({
  Client: function DiscordClient() {
    return mockDiscordClient
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
    GuildMessageReactions: 16
  },
  Partials: { Channel: 0, Reaction: 1 }
}))

vi.mock('@slack/bolt', () => ({
  App: function SlackApp() {
    return mockSlackApp
  }
}))

describe('channels/adapter — ChannelAdapter base', () => {
  let ChannelAdapter

  beforeEach(async () => {
    vi.resetModules()
    ;({ ChannelAdapter } = await import('../packages/channels/src/adapter.js'))
  })

  it('should initialize with id, config, and defaults', () => {
    const adapter = new ChannelAdapter('test', { key: 'val' })
    expect(adapter.id).toBe('test')
    expect(adapter.config.key).toBe('val')
    expect(adapter.connected).toBe(false)
  })

  it('should be an EventEmitter', () => {
    const adapter = new ChannelAdapter('test')
    expect(typeof adapter.on).toBe('function')
    expect(typeof adapter.emit).toBe('function')
  })

  it('should emit message events via _emitMessage', () => {
    const adapter = new ChannelAdapter('test')
    const handler = vi.fn()
    adapter.on('message', handler)
    adapter._emitMessage({ channel: 'test', peerId: 'p1', text: 'hello', timestamp: 1 })
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'test', text: 'hello' })
    )
  })

  it('should emit status events via _setConnected and _setDisconnected', () => {
    const adapter = new ChannelAdapter('test')
    const handler = vi.fn()
    adapter.on('status', handler)

    adapter._setConnected()
    expect(adapter.connected).toBe(true)
    expect(handler).toHaveBeenCalledWith({ channel: 'test', status: 'connected' })

    adapter._setDisconnected()
    expect(adapter.connected).toBe(false)
    expect(handler).toHaveBeenCalledWith({ channel: 'test', status: 'disconnected' })
  })

  it('should emit error events via _emitError', () => {
    const adapter = new ChannelAdapter('test')
    const handler = vi.fn()
    adapter.on('error', handler)
    adapter._emitError(new Error('boom'))
    expect(handler).toHaveBeenCalledWith({
      channel: 'test',
      error: expect.any(Error)
    })
  })

  it('should throw on unimplemented connect', async () => {
    const adapter = new ChannelAdapter('test')
    await expect(adapter.connect()).rejects.toThrow('connect() not implemented')
  })

  it('should throw on unimplemented send', async () => {
    const adapter = new ChannelAdapter('test')
    await expect(adapter.send('peer', 'text')).rejects.toThrow('send() not implemented')
  })

  it('should disconnect cleanly', async () => {
    const adapter = new ChannelAdapter('test')
    adapter.connected = true
    adapter._abortController = new AbortController()
    await adapter.disconnect()
    expect(adapter.connected).toBe(false)
    expect(adapter._abortController).toBe(null)
  })

  it('should serialize to JSON', () => {
    const adapter = new ChannelAdapter('wa')
    adapter.connected = true
    expect(adapter.toJSON()).toEqual({ id: 'wa', accountId: 'default', connected: true })
  })
})

describe('channels/adapter — deduplication', () => {
  let ChannelAdapter

  beforeEach(async () => {
    vi.resetModules()
    ;({ ChannelAdapter } = await import('../packages/channels/src/adapter.js'))
  })

  it('should deduplicate identical messages', () => {
    const adapter = new ChannelAdapter('test')
    const handler = vi.fn()
    adapter.on('message', handler)

    const msg = { channel: 'test', peerId: 'p1', text: 'hi', timestamp: 12345 }
    adapter._emitMessage(msg)
    adapter._emitMessage(msg)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should allow messages with different timestamps', () => {
    const adapter = new ChannelAdapter('test')
    const handler = vi.fn()
    adapter.on('message', handler)

    adapter._emitMessage({ channel: 'test', peerId: 'p1', text: 'hi', timestamp: 1 })
    adapter._emitMessage({ channel: 'test', peerId: 'p1', text: 'hi', timestamp: 2 })

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should evict oldest when max size reached', () => {
    const adapter = new ChannelAdapter('test', { dedupeMaxSize: 3 })
    const handler = vi.fn()
    adapter.on('message', handler)

    for (let i = 0; i < 4; i++) {
      adapter._emitMessage({ channel: 'test', peerId: 'p1', text: `m${i}`, timestamp: i })
    }
    expect(handler).toHaveBeenCalledTimes(4)

    adapter._emitMessage({ channel: 'test', peerId: 'p1', text: 'm0', timestamp: 0 })
    expect(handler).toHaveBeenCalledTimes(5)
  })
})

describe('channels/adapter — reconnect', () => {
  let ChannelAdapter

  beforeEach(async () => {
    vi.resetModules()
    ;({ ChannelAdapter } = await import('../packages/channels/src/adapter.js'))
  })

  it('should compute exponential backoff', () => {
    const adapter = new ChannelAdapter('test', {
      reconnect: { initialMs: 1000, maxMs: 10000, factor: 2, jitter: 0 }
    })

    adapter._retryCount = 0
    expect(adapter._computeBackoff()).toBe(1000)

    adapter._retryCount = 1
    expect(adapter._computeBackoff()).toBe(2000)

    adapter._retryCount = 2
    expect(adapter._computeBackoff()).toBe(4000)

    adapter._retryCount = 10
    expect(adapter._computeBackoff()).toBe(10000)
  })

  it('should emit failed status when max retries exceeded', async () => {
    const adapter = new ChannelAdapter('test', {
      reconnect: { maxAttempts: 2, initialMs: 1, maxMs: 1, factor: 1, jitter: 0 }
    })
    adapter._retryCount = 2

    const handler = vi.fn()
    adapter.on('status', handler)

    await adapter._scheduleReconnect()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', reason: 'max retries exceeded' })
    )
  })

  it('should not reconnect when aborted', async () => {
    const adapter = new ChannelAdapter('test', {
      reconnect: { maxAttempts: 5, initialMs: 1, maxMs: 1, factor: 1, jitter: 0 }
    })
    adapter._abortController = new AbortController()
    adapter._abortController.abort()

    const connectSpy = vi.spyOn(adapter, 'connect')
    await adapter._scheduleReconnect()
    expect(connectSpy).not.toHaveBeenCalled()
  })
})

describe('channels/adapter — chunkText', () => {
  let chunkText

  beforeEach(async () => {
    vi.resetModules()
    ;({ chunkText } = await import('../packages/channels/src/adapter.js'))
  })

  it('should return single chunk for short text', () => {
    const result = chunkText('hello', 100)
    expect(result).toEqual(['hello'])
  })

  it('should split long text at newlines', () => {
    const text = 'line1\nline2\nline3\nline4'
    const result = chunkText(text, 12)
    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(12 + 10)
    }
  })

  it('should handle text without newlines', () => {
    const text = 'a'.repeat(50)
    const result = chunkText(text, 20)
    expect(result.length).toBeGreaterThan(1)
  })

  it('should handle code fences', () => {
    const text = '```js\nconst a = 1\n```'
    const result = chunkText(text, 1000)
    expect(result).toEqual([text])
  })

  it('should use default maxLen of 2000', () => {
    const text = 'a'.repeat(1999)
    const result = chunkText(text)
    expect(result).toHaveLength(1)
  })
})

describe('channels/whatsapp — WhatsAppChannel', () => {
  let WhatsAppChannel

  beforeEach(async () => {
    vi.resetModules()
    ;({ WhatsAppChannel } = await import('../packages/channels/src/whatsapp/index.js'))
  })

  it('should construct with whatsapp id', () => {
    const wa = new WhatsAppChannel({ authDir: '/tmp/auth', allowFrom: ['123'] })
    expect(wa.id).toBe('whatsapp')
    expect(wa.connected).toBe(false)
  })

  it('should be an EventEmitter', () => {
    const wa = new WhatsAppChannel({})
    expect(typeof wa.on).toBe('function')
  })

  it('should throw on send when not connected', async () => {
    const wa = new WhatsAppChannel({})
    await expect(wa.send('peer', 'text')).rejects.toThrow('WhatsApp not connected')
  })

  it('should disconnect cleanly when not connected', async () => {
    const wa = new WhatsAppChannel({})
    await wa.disconnect()
    expect(wa.connected).toBe(false)
  })
})

describe('channels/telegram — TelegramChannel', () => {
  let TelegramChannel

  beforeEach(async () => {
    vi.resetModules()
    ;({ TelegramChannel } = await import('../packages/channels/src/telegram/index.js'))
    mockBot.start.mockClear()
    mockBot.stop.mockClear()
    mockBot.on.mockClear()
    mockBot.catch.mockClear()
    mockBot.api.sendMessage.mockClear()
    mockBot.api.sendChatAction.mockClear()
    mockBot.api.editMessageText.mockClear()
    mockBot.api.deleteMessage.mockClear()
    mockBot.api.setMessageReaction.mockClear()
  })

  it('should construct with telegram id', () => {
    const tg = new TelegramChannel({ botToken: 'abc:123' })
    expect(tg.id).toBe('telegram')
    expect(tg.connected).toBe(false)
  })

  it('should throw without token', async () => {
    const tg = new TelegramChannel({})
    delete process.env.TELEGRAM_BOT_TOKEN
    await expect(tg.connect()).rejects.toThrow('Telegram bot token required')
  })

  it('should connect and register message handler', async () => {
    const tg = new TelegramChannel({ botToken: 'abc:123' })
    await tg.connect()
    expect(mockBot.on).toHaveBeenCalledWith('message:text', expect.any(Function))
    expect(mockBot.catch).toHaveBeenCalled()
    expect(tg.connected).toBe(true)
  })

  it('should send message chunks', async () => {
    const tg = new TelegramChannel({ botToken: 'abc:123' })
    await tg.connect()
    await tg.send('chatId', 'hello')
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith('chatId', 'hello', {})
  })

  it('should disconnect cleanly', async () => {
    const tg = new TelegramChannel({ botToken: 'abc:123' })
    await tg.connect()
    await tg.disconnect()
    expect(mockBot.stop).toHaveBeenCalled()
    expect(tg.connected).toBe(false)
  })
})

describe('channels/discord — DiscordChannel', () => {
  let DiscordChannel

  beforeEach(async () => {
    vi.resetModules()
    ;({ DiscordChannel } = await import('../packages/channels/src/discord/index.js'))
    mockDiscordClient.on.mockClear()
    mockDiscordClient.login.mockClear()
    mockDiscordClient.destroy.mockClear()
    mockDiscordClient.channels.fetch.mockClear()
    mockDiscordClient.users.fetch.mockClear()
  })

  it('should construct with discord id', () => {
    const dc = new DiscordChannel({ botToken: 'token' })
    expect(dc.id).toBe('discord')
    expect(dc.connected).toBe(false)
  })

  it('should throw without token', async () => {
    const dc = new DiscordChannel({})
    delete process.env.DISCORD_BOT_TOKEN
    await expect(dc.connect()).rejects.toThrow('Discord bot token required')
  })

  it('should connect and register event handlers', async () => {
    const dc = new DiscordChannel({ botToken: 'token' })
    await dc.connect()
    expect(mockDiscordClient.login).toHaveBeenCalledWith('token')

    const registeredEvents = mockDiscordClient.on.mock.calls.map(([event]) => event)
    expect(registeredEvents).toContain('ready')
    expect(registeredEvents).toContain('messageCreate')
    expect(registeredEvents).toContain('error')
    expect(registeredEvents).toContain('shardDisconnect')
    expect(registeredEvents).toContain('shardReconnecting')
  })

  it('should send text to a channel', async () => {
    const mockChannel = {
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({ id: 'msg123' })
    }
    mockDiscordClient.channels.fetch.mockResolvedValue(mockChannel)

    const dc = new DiscordChannel({ botToken: 'token' })
    await dc.connect()
    const result = await dc.send('ch123', 'hello')
    expect(mockChannel.send).toHaveBeenCalledWith({ content: 'hello' })
    expect(result.messageId).toBe('msg123')
  })

  it('should throw when sending to non-text channel', async () => {
    mockDiscordClient.channels.fetch.mockResolvedValue({ isTextBased: () => false })

    const dc = new DiscordChannel({ botToken: 'token' })
    await dc.connect()
    await expect(dc.send('ch123', 'hello')).rejects.toThrow('not text-based')
  })

  it('should send DM to user', async () => {
    const mockDM = { send: vi.fn().mockResolvedValue({}) }
    mockDiscordClient.users.fetch.mockResolvedValue({ createDM: vi.fn().mockResolvedValue(mockDM) })

    const dc = new DiscordChannel({ botToken: 'token' })
    await dc.connect()
    await dc.sendDM('user456', 'hi there')
    expect(mockDM.send).toHaveBeenCalledWith({ content: 'hi there' })
  })

  it('should disconnect cleanly', async () => {
    const dc = new DiscordChannel({ botToken: 'token' })
    await dc.connect()
    await dc.disconnect()
    expect(mockDiscordClient.destroy).toHaveBeenCalled()
    expect(dc.connected).toBe(false)
  })

  it('should filter messages from bots', async () => {
    const dc = new DiscordChannel({ botToken: 'token' })
    const handler = vi.fn()
    dc.on('message', handler)

    await dc.connect()
    const messageCreateHandler = mockDiscordClient.on.mock.calls.find(
      ([e]) => e === 'messageCreate'
    )[1]

    messageCreateHandler({
      author: { bot: true, id: 'other', displayName: 'Bot', username: 'bot' },
      content: 'bot msg',
      channel: { id: 'ch1', type: 0 },
      guild: null,
      createdTimestamp: Date.now(),
      mentions: { users: new Map() }
    })

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('channels/slack — SlackChannel', () => {
  let SlackChannel

  beforeEach(async () => {
    vi.resetModules()
    ;({ SlackChannel } = await import('../packages/channels/src/slack/index.js'))
    mockSlackApp.event.mockClear()
    mockSlackApp.start.mockClear()
    mockSlackApp.stop.mockClear()
    mockSlackApp.client.chat.postMessage.mockClear()
    mockSlackApp.client.chat.update.mockClear()
    mockSlackApp.client.chat.delete.mockClear()
    mockSlackApp.client.reactions.add.mockClear()
    mockSlackApp.client.conversations.open.mockClear()
    mockSlackApp.client.conversations.history.mockClear()
    mockSlackApp.client.auth.test.mockClear()
  })

  it('should construct with slack id', () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    expect(sl.id).toBe('slack')
    expect(sl.connected).toBe(false)
  })

  it('should throw without bot token', async () => {
    const sl = new SlackChannel({})
    delete process.env.SLACK_BOT_TOKEN
    delete process.env.SLACK_APP_TOKEN
    await expect(sl.connect()).rejects.toThrow('Slack bot token required')
  })

  it('should throw without app token', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test' })
    delete process.env.SLACK_APP_TOKEN
    await expect(sl.connect()).rejects.toThrow('Slack app token required')
  })

  it('should connect and register message handler', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    await sl.connect()
    expect(mockSlackApp.start).toHaveBeenCalled()
    expect(mockSlackApp.event).toHaveBeenCalledWith('message', expect.any(Function))
    expect(mockSlackApp.client.auth.test).toHaveBeenCalled()
    expect(sl.connected).toBe(true)
    expect(sl._botUserId).toBe('U123')
  })

  it('should send message', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    await sl.connect()
    await sl.send('C123', 'hello')
    expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'hello'
    })
  })

  it('should send threaded reply', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    await sl.connect()
    await sl.send('C123', 'reply', { threadTs: '1234.5678' })
    expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C123',
      text: 'reply',
      thread_ts: '1234.5678'
    })
  })

  it('should send DM with channel caching', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    await sl.connect()

    await sl.sendDM('U789', 'hi')
    expect(mockSlackApp.client.conversations.open).toHaveBeenCalledWith({ users: 'U789' })
    expect(mockSlackApp.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'D456',
      text: 'hi'
    })

    mockSlackApp.client.conversations.open.mockClear()
    await sl.sendDM('U789', 'again')
    expect(mockSlackApp.client.conversations.open).not.toHaveBeenCalled()
  })

  it('should disconnect cleanly', async () => {
    const sl = new SlackChannel({ botToken: 'xoxb-test', appToken: 'xapp-test' })
    await sl.connect()
    await sl.disconnect()
    expect(mockSlackApp.stop).toHaveBeenCalled()
    expect(sl.connected).toBe(false)
  })
})
