import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'node:os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir())
  }
}))

vi.mock('../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const mockWhatsApp = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => true)
}

const mockTelegram = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => true)
}

const mockDiscord = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => true)
}

const mockSlack = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn(() => true)
}

vi.mock('@vox-ai-app/channels/whatsapp', () => ({
  WhatsAppChannel: function MockWA() {
    return mockWhatsApp
  }
}))
vi.mock('@vox-ai-app/channels/telegram', () => ({
  TelegramChannel: function MockTG() {
    return mockTelegram
  }
}))
vi.mock('@vox-ai-app/channels/discord', () => ({
  DiscordChannel: function MockDC() {
    return mockDiscord
  }
}))
vi.mock('@vox-ai-app/channels/slack', () => ({
  SlackChannel: function MockSL() {
    return mockSlack
  }
}))

describe('channels.service', () => {
  let service

  beforeEach(async () => {
    vi.resetModules()
    service = await import('../src/main/channels.service.js')
    await service.destroyChannels()
    for (const mock of [mockWhatsApp, mockTelegram, mockDiscord, mockSlack]) {
      mock.on.mockClear()
      mock.connect.mockClear()
      mock.disconnect.mockClear()
      mock.send.mockClear()
    }
  })

  it('should start with no connected channels', () => {
    expect(service.getConnectedChannels()).toEqual([])
  })

  it('should initialize whatsapp channel', async () => {
    await service.initWhatsApp({ allowFrom: ['123'] })
    expect(mockWhatsApp.connect).toHaveBeenCalled()
    expect(mockWhatsApp.on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(mockWhatsApp.on).toHaveBeenCalledWith('status', expect.any(Function))
    expect(mockWhatsApp.on).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('should initialize telegram channel', async () => {
    await service.initTelegram({ botToken: 'abc:123' })
    expect(mockTelegram.connect).toHaveBeenCalled()
  })

  it('should initialize discord channel', async () => {
    await service.initDiscord({ botToken: 'token' })
    expect(mockDiscord.connect).toHaveBeenCalled()
  })

  it('should initialize slack channel', async () => {
    await service.initSlack({ botToken: 'xoxb', appToken: 'xapp' })
    expect(mockSlack.connect).toHaveBeenCalled()
  })

  it('should init any channel by id', async () => {
    await service.initChannel('telegram', { botToken: 'abc:123' })
    expect(mockTelegram.connect).toHaveBeenCalled()
  })

  it('should throw for unknown channel id', async () => {
    await expect(service.initChannel('sms', {})).rejects.toThrow('Unknown channel')
  })

  it('should send to connected channel', async () => {
    await service.initTelegram({ botToken: 'abc:123' })
    await service.sendToChannel('telegram', 'chat1', 'hello')
    expect(mockTelegram.send).toHaveBeenCalledWith('chat1', 'hello', {})
  })

  it('should throw when sending to unconnected channel', async () => {
    await expect(service.sendToChannel('whatsapp', 'peer', 'hi')).rejects.toThrow('not connected')
  })

  it('should get channel by id', async () => {
    await service.initDiscord({ botToken: 'token' })
    expect(service.getChannel('discord')).toBe(mockDiscord)
  })

  it('should return null for unknown channel', () => {
    expect(service.getChannel('nonexistent')).toBeNull()
  })

  it('should list connected channels', async () => {
    await service.initTelegram({ botToken: 'abc:123' })
    await service.initDiscord({ botToken: 'token' })
    const list = service.getConnectedChannels()
    expect(list).toHaveLength(2)
    expect(list.map((c) => c.id).sort()).toEqual(['discord', 'telegram'])
  })

  it('should destroy all channels', async () => {
    await service.initTelegram({ botToken: 'abc:123' })
    await service.initDiscord({ botToken: 'token' })
    await service.destroyChannels()
    expect(mockTelegram.disconnect).toHaveBeenCalled()
    expect(mockDiscord.disconnect).toHaveBeenCalled()
    expect(service.getConnectedChannels()).toEqual([])
  })

  it('should forward messages to handler', async () => {
    const handler = vi.fn()
    service.setChannelMessageHandler(handler)
    await service.initTelegram({ botToken: 'abc:123' })
    const onMessage = mockTelegram.on.mock.calls.find(([e]) => e === 'message')
    expect(onMessage).toBeDefined()
    onMessage[1]({ channel: 'telegram', peerId: 'p1', text: 'hi' })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ text: 'hi' }))
  })

  it('should forward status to handler', async () => {
    const handler = vi.fn()
    service.setChannelStatusHandler(handler)
    await service.initTelegram({ botToken: 'abc:123' })
    const onStatus = mockTelegram.on.mock.calls.find(([e]) => e === 'status')
    expect(onStatus).toBeDefined()
    onStatus[1]({ channel: 'telegram', status: 'connected' })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ status: 'connected' }))
  })
})
