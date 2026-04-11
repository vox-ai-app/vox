import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn(() => false)
const mockMkdirSync = vi.fn()
const mockChmodSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockReadFileSync = vi.fn(() => {
  throw new Error('ENOENT')
})
const mockCreateWriteStream = vi.fn(() => ({
  write: vi.fn(),
  end: vi.fn(),
  on: vi.fn((evt, cb) => {
    if (evt === 'finish') cb()
  }),
  writableFinished: true
}))
const mockRenameSync = vi.fn()
const mockRmSync = vi.fn()
const mockReaddirSync = vi.fn(() => [])
const mockCopyFileSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args) => mockExistsSync(...args),
  mkdirSync: (...args) => mockMkdirSync(...args),
  chmodSync: (...args) => mockChmodSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args),
  createWriteStream: (...args) => mockCreateWriteStream(...args),
  renameSync: (...args) => mockRenameSync(...args),
  rmSync: (...args) => mockRmSync(...args),
  readdirSync: (...args) => mockReaddirSync(...args),
  copyFileSync: (...args) => mockCopyFileSync(...args)
}))

vi.mock('child_process', () => ({
  exec: vi.fn((...args) => {
    const cb = args[args.length - 1]
    if (typeof cb === 'function') cb(null, '', '')
  }),
  execSync: vi.fn((cmd) => {
    if (cmd.includes('find')) return '/fake/extract/llama-b8635/llama-server\n'
    if (cmd.includes('--version')) return 'version: 8635\n'
    return ''
  })
}))

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/fake/app',
    getPath: (name) => (name === 'userData' ? '/fake/userData' : '/fake')
  }
}))

vi.mock('../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../../src/main/ipc/shared', () => ({
  emitAll: vi.fn()
}))

describe('binary.manager', async () => {
  const manager = await import('../../../src/main/ai/llm/binary.manager.js')

  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    mockReaddirSync.mockReturnValue([])
  })

  describe('resolve', () => {
    it('returns null when nothing installed', () => {
      expect(manager.resolve()).toBeNull()
    })

    it('returns bundled binary when it exists', () => {
      mockExistsSync.mockImplementation(
        (p) => p.includes('resources') && p.includes('llama-server')
      )
      expect(manager.resolve()).toContain('llama-server')
    })

    it('returns managed binary when version matches', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p.includes('app.asar.unpacked')) return false
        if (p.includes('b8635') && p.endsWith('llama-server')) return true
        return false
      })
      mockReadFileSync.mockReturnValue('b8635')
      expect(manager.resolve()).toContain('b8635')
      expect(manager.resolve()).toContain('llama-server')
    })

    it('returns null when version mismatch', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p.includes('resources')) return false
        if (p.endsWith('llama-server')) return true
        return false
      })
      mockReadFileSync.mockReturnValue('b9999')
      expect(manager.resolve()).toBeNull()
    })
  })

  describe('purge', () => {
    it('removes version directory recursively', () => {
      manager.purge()
      expect(mockRmSync).toHaveBeenCalledWith(expect.stringContaining('b8635'), {
        recursive: true,
        force: true
      })
    })
  })

  describe('purgeAllVersions', () => {
    it('removes all entries in bin dir', () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['b8635', 'b9000'])
      manager.purgeAllVersions()
      expect(mockRmSync).toHaveBeenCalledTimes(2)
    })

    it('does nothing when bin dir missing', () => {
      mockExistsSync.mockReturnValue(false)
      manager.purgeAllVersions()
      expect(mockRmSync).not.toHaveBeenCalled()
    })
  })

  describe('getVersion', () => {
    it('returns current target version', () => {
      expect(manager.getVersion()).toBe('b8635')
    })
  })

  describe('ensure', () => {
    it('returns existing binary if already installed', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (p.includes('app.asar.unpacked')) return false
        if (p.includes('b8635') && p.endsWith('llama-server')) return true
        return false
      })
      mockReadFileSync.mockReturnValue('b8635')
      const result = await manager.ensure()
      expect(result).toContain('llama-server')
    })

    it('downloads and installs when not found', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(100) })
          .mockResolvedValueOnce({ done: true })
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => '100' },
        body: { getReader: () => mockReader }
      })

      mockReaddirSync.mockImplementation((dir) => {
        if (String(dir).includes('extract') || String(dir).includes('llama-b8635')) {
          return ['libggml.dylib', 'libllama.dylib', 'llama-cli']
        }
        return []
      })

      const result = await manager.ensure()

      expect(result).toContain('llama-server')
      expect(mockCopyFileSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('version'), 'b8635')

      delete global.fetch
    })

    it('purges and throws when validation fails', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(100) })
          .mockResolvedValueOnce({ done: true })
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => '100' },
        body: { getReader: () => mockReader }
      })

      const { execSync, exec } = await import('child_process')
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('--version')) throw new Error('Killed: SIGABRT')
        if (cmd.includes('find')) return '/fake/extract/llama-b8635/llama-server\n'
        return ''
      })
      exec.mockImplementation((...args) => {
        const cb = args[args.length - 1]
        const cmd = args[0]
        if (typeof cb === 'function') {
          if (cmd.includes('--version')) return cb(new Error('Killed: SIGABRT'))
          return cb(null, '', '')
        }
      })

      await expect(manager.ensure()).rejects.toThrow('failed validation')

      expect(mockRmSync).toHaveBeenCalledWith(expect.stringContaining('b8635'), {
        recursive: true,
        force: true
      })

      execSync.mockImplementation((cmd) => {
        if (cmd.includes('find')) return '/fake/extract/llama-b8635/llama-server\n'
        if (cmd.includes('--version')) return 'version: 8635\n'
        return ''
      })
      exec.mockImplementation((...args) => {
        const cb = args[args.length - 1]
        if (typeof cb === 'function') cb(null, '', '')
      })

      delete global.fetch
    })

    it('throws on download failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => '0' }
      })

      await expect(manager.ensure()).rejects.toThrow('HTTP 404')

      delete global.fetch
    })

    it('throws on incomplete download', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(50) })
          .mockResolvedValueOnce({ done: true })
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => '100' },
        body: { getReader: () => mockReader }
      })

      await expect(manager.ensure()).rejects.toThrow('incomplete')

      delete global.fetch
    })
  })
})
