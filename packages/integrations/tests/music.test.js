import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: 'STATE:stopped\n' }),
  esc: (s) => String(s).replace(/"/g, '\\"'),
  EXEC_TIMEOUT: 120000,
  writeTempScript: vi.fn().mockResolvedValue('/tmp/t.scpt'),
  cleanupTemp: vi.fn()
})

describe('music — definitions', () => {
  let MUSIC_TOOL_DEFINITIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ MUSIC_TOOL_DEFINITIONS } = await import('../src/music/def.js'))
  })

  it('should export 6 tool definitions', () => {
    expect(MUSIC_TOOL_DEFINITIONS).toHaveLength(6)
  })

  it('should define all music tools', () => {
    const names = MUSIC_TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toEqual([
      'get_now_playing',
      'play_music',
      'pause_music',
      'next_track',
      'previous_track',
      'set_volume'
    ])
  })
})

describe('music — tools wiring', () => {
  let MUSIC_TOOLS

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ MUSIC_TOOLS } = await import('../src/music/tools.js'))
  })

  it('should export 6 tools', () => {
    expect(MUSIC_TOOLS).toHaveLength(6)
  })

  it('each tool should have definition + execute', () => {
    for (const tool of MUSIC_TOOLS) {
      expect(typeof tool.definition.name).toBe('string')
      expect(typeof tool.execute).toBe('function')
    }
  })
})

describe('music/mac — getNowPlayingMac', () => {
  let getNowPlayingMac, mockExecAbortable

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: 'STATE:stopped\n' })
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: mockExecAbortable
    }))
    ;({ getNowPlayingMac } = await import('../src/music/mac/index.js'))
  })

  it('should return stopped state', async () => {
    const result = await getNowPlayingMac({})
    expect(result).toEqual({ state: 'stopped' })
  })

  it('should parse playing track info', async () => {
    mockExecAbortable.mockResolvedValue({
      stdout: 'Bohemian Rhapsody\tQueen\tA Night at the Opera\t354.5\t120.3\tplaying\n'
    })
    const result = await getNowPlayingMac({})
    expect(result.name).toBe('Bohemian Rhapsody')
    expect(result.artist).toBe('Queen')
    expect(result.album).toBe('A Night at the Opera')
    expect(result.duration).toBeCloseTo(354.5)
    expect(result.position).toBeCloseTo(120.3)
    expect(result.state).toBe('playing')
  })
})

describe('music/mac — playMusicMac', () => {
  let playMusicMac, mockExecAbortable

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: '\n' })
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      ...mockExec(),
      execAbortable: mockExecAbortable
    }))
    ;({ playMusicMac } = await import('../src/music/mac/index.js'))
  })

  it('should resume playback when no query', async () => {
    const result = await playMusicMac({})
    expect(result.status).toBe('playing')
  })

  it('should return not_found when track not found', async () => {
    mockExecAbortable.mockResolvedValue({ stdout: 'NOT_FOUND\n' })
    const result = await playMusicMac({ query: 'nonexistent' })
    expect(result.status).toBe('not_found')
    expect(result.query).toBe('nonexistent')
  })

  it('should return playing with track info when found', async () => {
    mockExecAbortable.mockResolvedValue({ stdout: 'Song Name\tArtist\n' })
    const result = await playMusicMac({ query: 'Song' })
    expect(result.status).toBe('playing')
    expect(result.name).toBe('Song Name')
    expect(result.artist).toBe('Artist')
  })
})

describe('music/mac — setVolumeMac', () => {
  let setVolumeMac

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ setVolumeMac } = await import('../src/music/mac/index.js'))
  })

  it('should clamp volume to 0-100', async () => {
    expect((await setVolumeMac({ volume: -10 })).volume).toBe(0)
    expect((await setVolumeMac({ volume: 200 })).volume).toBe(100)
    expect((await setVolumeMac({ volume: 75 })).volume).toBe(75)
  })
})
