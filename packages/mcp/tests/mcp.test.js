import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn()
}))
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn()
}))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn()
}))

describe('mcp/transport — parseCommand', () => {
  let parseCommand

  beforeEach(async () => {
    vi.resetModules()
    ;({ parseCommand } = await import('../src/transport.js'))
  })

  it('should parse simple command', () => {
    expect(parseCommand('node server.js')).toEqual(['node', 'server.js'])
  })

  it('should handle single-quoted strings', () => {
    expect(parseCommand("echo 'hello world'")).toEqual(['echo', 'hello world'])
  })

  it('should handle double-quoted strings', () => {
    expect(parseCommand('echo "hello world"')).toEqual(['echo', 'hello world'])
  })

  it('should handle multiple spaces', () => {
    expect(parseCommand('node   server.js   --port  3000')).toEqual([
      'node',
      'server.js',
      '--port',
      '3000'
    ])
  })

  it('should handle env vars in command', () => {
    expect(parseCommand('KEY=value node app.js')).toEqual(['KEY=value', 'node', 'app.js'])
  })

  it('should return empty array for empty string', () => {
    expect(parseCommand('')).toEqual([])
  })

  it('should handle mixed quotes', () => {
    expect(parseCommand(`echo "it's" 'a "test"'`)).toEqual(['echo', "it's", 'a "test"'])
  })
})

describe('mcp/transport — makeTransport', () => {
  let makeTransport
  let StdioClientTransport, SSEClientTransport, StreamableHTTPClientTransport

  beforeEach(async () => {
    vi.resetModules()

    const stdioMod = await import('@modelcontextprotocol/sdk/client/stdio.js')
    const sseMod = await import('@modelcontextprotocol/sdk/client/sse.js')
    const httpMod = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

    StdioClientTransport = stdioMod.StdioClientTransport
    SSEClientTransport = sseMod.SSEClientTransport
    StreamableHTTPClientTransport = httpMod.StreamableHTTPClientTransport

    StdioClientTransport.mockClear()
    SSEClientTransport.mockClear()
    StreamableHTTPClientTransport.mockClear()
    ;({ makeTransport } = await import('../src/transport.js'))
  })

  it('should create stdio transport', () => {
    makeTransport({ transport: 'stdio', command: 'node server.js' })
    expect(StdioClientTransport).toHaveBeenCalledTimes(1)
    const args = StdioClientTransport.mock.calls[0][0]
    expect(args.command).toBe('node')
    expect(args.args).toEqual(['server.js'])
  })

  it('should parse env vars from stdio command', () => {
    makeTransport({ transport: 'stdio', command: 'API_KEY=abc node server.js' })
    const args = StdioClientTransport.mock.calls[0][0]
    expect(args.command).toBe('node')
    expect(args.env.API_KEY).toBe('abc')
  })

  it('should create SSE transport', () => {
    makeTransport({ transport: 'sse', url: 'https://example.com/sse' })
    expect(SSEClientTransport).toHaveBeenCalledTimes(1)
  })

  it('should throw for stdio with no executable', () => {
    expect(() => makeTransport({ transport: 'stdio', command: 'VAR=val' })).toThrow('no executable')
  })

  it('should throw for empty stdio command', () => {
    expect(() => makeTransport({ transport: 'stdio', command: '' })).toThrow('Invalid MCP command')
  })
})

describe('mcp/session', () => {
  let getStoredSessionId, persistSessionId, clearSessionId
  let tmpDir

  beforeEach(async () => {
    vi.resetModules()
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sess-'))
    process.env.VOX_USER_DATA_PATH = tmpDir
    ;({ getStoredSessionId, persistSessionId, clearSessionId } = await import('../src/session.js'))
  })

  it('should return null for unknown server', () => {
    expect(getStoredSessionId('unknown')).toBeNull()
  })

  it('should persist and retrieve session id', () => {
    persistSessionId('server-1', 'sess-abc')
    expect(getStoredSessionId('server-1')).toBe('sess-abc')
  })

  it('should clear session id', () => {
    persistSessionId('server-1', 'sess-abc')
    clearSessionId('server-1')
    expect(getStoredSessionId('server-1')).toBeNull()
  })

  it('should handle multiple servers', () => {
    persistSessionId('s1', 'a')
    persistSessionId('s2', 'b')
    expect(getStoredSessionId('s1')).toBe('a')
    expect(getStoredSessionId('s2')).toBe('b')
  })

  it('should overwrite existing session', () => {
    persistSessionId('s1', 'old')
    persistSessionId('s1', 'new')
    expect(getStoredSessionId('s1')).toBe('new')
  })
})
