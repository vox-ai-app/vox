import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockToolStore = []

function normToCamel(t) {
  return {
    id: t.id || `tool-${Math.random().toString(36).slice(2)}`,
    name: t.name,
    description: t.description || '',
    parameters: t.parameters || { type: 'object', properties: {} },
    sourceType: t.source_type || t.sourceType || 'js_function',
    sourceCode: t.source_code || t.sourceCode || '',
    webhookUrl: t.webhook_url || t.webhookUrl || '',
    webhookHeaders: t.webhook_headers || t.webhookHeaders || null,
    tags: t.tags || [],
    isEnabled:
      t.is_enabled !== undefined ? t.is_enabled : t.isEnabled !== undefined ? t.isEnabled : true,
    createdAt: t.created_at || t.createdAt || new Date().toISOString(),
    updatedAt: t.updated_at || t.updatedAt || new Date().toISOString()
  }
}

function normToSnake(t) {
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    parameters: t.parameters,
    source_type: t.sourceType || t.source_type || 'js_function',
    source_code: t.sourceCode || t.source_code || '',
    webhook_url: t.webhookUrl || t.webhook_url || '',
    tags: t.tags || [],
    is_enabled: t.isEnabled !== undefined ? t.isEnabled : true,
    created_at: t.createdAt || t.created_at || '',
    updated_at: t.updatedAt || t.updated_at || ''
  }
}

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/vox-test' },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/test/file.txt'] })
  }
}))

vi.mock('../../../src/main/storage/store', () => {
  const store = {}
  return {
    storeGet: (key) => {
      if (key === 'customTools') return mockToolStore.map(normToSnake)
      return store[key] ?? null
    },
    storeSet: (key, val) => {
      if (key === 'customTools') {
        mockToolStore.length = 0
        if (Array.isArray(val)) val.forEach((t) => mockToolStore.push(normToCamel(t)))
        return
      }
      store[key] = val
    },
    _store: store,
    _reset: () => {
      for (const k of Object.keys(store)) delete store[k]
      mockToolStore.length = 0
    }
  }
})

vi.mock('../../../src/main/storage/secrets', () => ({
  getToolSecrets: (_name) => ({ api_key: 'secret-123' })
}))

vi.mock('../../../src/main/mcp/mcp.service', () => ({
  getMcpToolDefinitions: () => [],
  executeMcpTool: vi.fn()
}))

vi.mock('@vox-ai-app/integrations', () => ({
  ALL_INTEGRATION_TOOLS: []
}))

const mockRunLocalCommand = vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'hello', stderr: '' })
const mockWriteLocalFile = vi.fn().mockResolvedValue({ ok: true })
const mockReadLocalFile = vi.fn().mockResolvedValue({ content: 'file content' })
const mockListLocalDirectory = vi.fn().mockResolvedValue({ entries: [] })
const mockFetchWebpage = vi.fn().mockResolvedValue({ content: '<html>test</html>' })
const mockGrepLocal = vi.fn().mockResolvedValue({ matches: [] })
const mockGlobLocal = vi.fn().mockResolvedValue({ files: [] })

vi.mock('@vox-ai-app/tools', () => ({
  ALL_TOOLS: [
    { definition: { name: 'run_local_command' }, execute: () => mockRunLocalCommand },
    { definition: { name: 'write_local_file' }, execute: () => mockWriteLocalFile },
    { definition: { name: 'read_local_file' }, execute: () => mockReadLocalFile },
    { definition: { name: 'list_local_directory' }, execute: () => mockListLocalDirectory },
    { definition: { name: 'fetch_webpage' }, execute: () => mockFetchWebpage },
    { definition: { name: 'grep_local' }, execute: () => mockGrepLocal },
    { definition: { name: 'glob_local' }, execute: () => mockGlobLocal }
  ]
}))

const _flat = new Map()
vi.mock('@vox-ai-app/tools/registry', () => ({
  registerAll: (tools) => {
    for (const tool of tools) {
      _flat.set(tool.definition.name, {
        execute: (args) => tool.execute(null)(args)
      })
    }
  },
  run: async (name, args) => {
    const entry = _flat.get(name)
    if (!entry) throw new Error(`Unknown desktop tool: ${name}`)
    return entry.execute(args)
  }
}))

const mockListIndexedFiles = vi.fn().mockResolvedValue(JSON.stringify({ files: [] }))
const mockReadIndexedFile = vi.fn().mockResolvedValue(JSON.stringify({ content: 'test' }))
const mockSearchIndexedContext = vi.fn().mockResolvedValue(JSON.stringify({ results: [] }))

vi.mock('@vox-ai-app/indexing', () => ({
  ALL_KNOWLEDGE_TOOLS: [
    { definition: { name: 'list_indexed_files' }, execute: () => mockListIndexedFiles },
    { definition: { name: 'read_indexed_file' }, execute: () => mockReadIndexedFile },
    { definition: { name: 'search_indexed_context' }, execute: () => mockSearchIndexedContext }
  ]
}))

vi.mock('../../../src/main/chat/task.queue', () => ({
  enqueueTask: vi.fn(),
  waitForTaskCompletion: vi
    .fn()
    .mockResolvedValue({ taskId: 't1', status: 'completed', result: 'done' }),
  getTaskDetail: vi.fn(() => ({ task: { id: 't1', status: 'completed' } })),
  listTaskHistory: vi.fn(() => ({ tasks: [], has_more: false }))
}))

vi.mock('../../../src/main/chat/chat.session', () => ({
  getToolDefinitions: () => [],
  invalidateToolDefinitions: vi.fn()
}))

vi.mock('../../../src/main/storage/tasks.db', () => ({
  searchTasksFts: vi.fn(() => []),
  searchTasksSemantic: vi.fn(async () => [])
}))

vi.mock('../../../src/main/storage/tasks.db.js', () => ({
  searchTasksFts: vi.fn(() => []),
  searchTasksSemantic: vi.fn(async () => [])
}))

vi.mock('../../../src/main/storage/messages.db', () => {
  let userInfo = {}
  return {
    searchMessagesSemantic: vi.fn(async () => [
      { id: 'm1', role: 'user', content: 'I live in NYC', score: 0.85 },
      { id: 'm2', role: 'assistant', content: 'Got it, you are in New York City', score: 0.7 }
    ]),
    searchMessagesFts: vi.fn(() => []),
    getConversationUserInfo: vi.fn(() => ({ ...userInfo })),
    setConversationUserInfo: vi.fn((data) => {
      userInfo = { ...data }
    }),
    _resetUserInfo: () => {
      userInfo = {}
    }
  }
})

vi.mock('../../../src/main/storage/messages.db.js', () => {
  let userInfo = {}
  return {
    searchMessagesSemantic: vi.fn(async () => [
      { id: 'm1', role: 'user', content: 'I live in NYC', score: 0.85 },
      { id: 'm2', role: 'assistant', content: 'Got it, you are in New York City', score: 0.7 }
    ]),
    searchMessagesFts: vi.fn(() => []),
    getConversationUserInfo: vi.fn(() => ({ ...userInfo })),
    setConversationUserInfo: vi.fn((data) => {
      userInfo = { ...data }
    }),
    _resetUserInfo: () => {
      userInfo = {}
    }
  }
})

vi.mock('@vox-ai-app/storage/tools', () => ({
  listTools: vi.fn((db, enabledOnly) => {
    if (enabledOnly) return mockToolStore.filter((t) => t.isEnabled !== false)
    return [...mockToolStore]
  }),
  getToolByName: vi.fn((db, name) => mockToolStore.find((t) => t.name === name) || null),
  createTool: vi.fn((db, tool) => {
    const newTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...tool,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    mockToolStore.push(newTool)
    return newTool
  }),
  updateTool: vi.fn((db, id, updates) => {
    const idx = mockToolStore.findIndex((t) => t.id === id)
    if (idx < 0) return null
    mockToolStore[idx] = { ...mockToolStore[idx], ...updates, updatedAt: new Date().toISOString() }
    return mockToolStore[idx]
  }),
  deleteTool: vi.fn((db, id) => {
    const idx = mockToolStore.findIndex((t) => t.id === id)
    if (idx >= 0) mockToolStore.splice(idx, 1)
  }),
  getTool: vi.fn((db, id) => mockToolStore.find((t) => t.id === id) || null)
}))

vi.mock('../../../src/main/storage/db', () => ({
  getDb: vi.fn(() => ({}))
}))

vi.mock('../../../src/main/storage/db.js', () => ({
  getDb: vi.fn(() => ({}))
}))

vi.mock('../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { executeElectronTool } = await import('../../../src/main/ai/llm/tool-executor.js')
const storeMod = await import('../../../src/main/storage/store')

beforeEach(async () => {
  storeMod._reset()
  const msgDb = await import('../../../src/main/storage/messages.db.js')
  if (msgDb._resetUserInfo) msgDb._resetUserInfo()
})

describe('executeElectronTool - file dialogs', () => {
  it('should handle pick_file', async () => {
    const result = await executeElectronTool('pick_file', {})
    expect(result).toBe('/test/file.txt')
  })

  it('should handle pick_directory', async () => {
    const { dialog } = await import('electron')
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/test/dir'] })
    const result = await executeElectronTool('pick_directory', {})
    expect(result).toBe('/test/dir')
  })

  it('should return null when dialog is cancelled', async () => {
    const { dialog } = await import('electron')
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    const result = await executeElectronTool('pick_file', {})
    expect(result).toBeNull()
  })
})

describe('executeElectronTool - save_user_info', () => {
  it('should save user info to store', async () => {
    const result = await executeElectronTool('save_user_info', {
      info_key: 'name',
      info_value: 'Alice'
    })
    const parsed = JSON.parse(result)
    expect(parsed.saved).toBe(true)
    expect(parsed.key).toBe('name')
  })

  it('should accumulate user info across calls', async () => {
    await executeElectronTool('save_user_info', { info_key: 'name', info_value: 'Alice' })
    await executeElectronTool('save_user_info', { info_key: 'age', info_value: '30' })
    const { getConversationUserInfo } = await import('../../../src/main/storage/messages.db.js')
    const stored = getConversationUserInfo()
    expect(stored.name).toBe('Alice')
    expect(stored.age).toBe('30')
  })

  it('should reject empty info_key', async () => {
    const result = await executeElectronTool('save_user_info', { info_key: '', info_value: 'test' })
    const parsed = JSON.parse(result)
    expect(parsed.error).toBeDefined()
  })
})

describe('executeElectronTool - spawn_task', () => {
  it('should spawn a task and return taskId', async () => {
    const output = await executeElectronTool('spawn_task', { instructions: 'Do something' })
    expect(output.endTurn).toBe(true)
    const parsed = JSON.parse(output.result)
    expect(parsed.status).toBe('spawned')
    expect(parsed.id).toBeDefined()
  })

  it('should wait for result when waitForResult is true', async () => {
    const result = await executeElectronTool('spawn_task', {
      instructions: 'Do it',
      waitForResult: true,
      timeoutMs: 5000
    })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('completed')
  })
})

describe('executeElectronTool - task queries', () => {
  it('should get task detail', async () => {
    const result = await executeElectronTool('get_task', { taskId: 't1' })
    const parsed = JSON.parse(result)
    expect(parsed.task).toBeDefined()
  })

  it('should search tasks', async () => {
    const result = await executeElectronTool('search_tasks', { query: 'test' })
    const parsed = JSON.parse(result)
    expect(parsed.tasks).toBeDefined()
  })

  it('should list tasks by status', async () => {
    const result = await executeElectronTool('search_tasks', { status: 'completed' })
    const parsed = JSON.parse(result)
    expect(parsed.tasks).toBeDefined()
  })
})

describe('executeElectronTool - search_messages', () => {
  it('should search messages semantically', async () => {
    const result = await executeElectronTool('search_messages', { query: 'where do I live' })
    const parsed = JSON.parse(result)
    expect(parsed.messages).toBeDefined()
    expect(parsed.messages.length).toBe(2)
    expect(parsed.messages[0].content).toContain('NYC')
    expect(parsed.count).toBe(2)
  })

  it('should return error when query is empty', async () => {
    const result = await executeElectronTool('search_messages', { query: '' })
    const parsed = JSON.parse(result)
    expect(parsed.error).toBe('query is required')
  })

  it('should return error when query is missing', async () => {
    const result = await executeElectronTool('search_messages', {})
    const parsed = JSON.parse(result)
    expect(parsed.error).toBe('query is required')
  })

  it('should pass custom limit', async () => {
    const { searchMessagesSemantic } = await import('../../../src/main/storage/messages.db')
    await executeElectronTool('search_messages', { query: 'test', limit: 5 })
    expect(searchMessagesSemantic).toHaveBeenCalledWith('test', 5)
  })
})

describe('executeElectronTool - knowledge tools', () => {
  it('should route list_indexed_files', async () => {
    await executeElectronTool('list_indexed_files', {})
    expect(mockListIndexedFiles).toHaveBeenCalled()
  })

  it('should route read_indexed_file', async () => {
    await executeElectronTool('read_indexed_file', { path: '/test.txt' })
    expect(mockReadIndexedFile).toHaveBeenCalled()
  })

  it('should route search_indexed_context', async () => {
    await executeElectronTool('search_indexed_context', { query: 'find this' })
    expect(mockSearchIndexedContext).toHaveBeenCalled()
  })
})

describe('executeElectronTool - find_tools and run_tool', () => {
  it('should find custom tools by query', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'my_custom',
        description: 'does math',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return { result: args.x + 1 }'
      }
    ])
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'math' }))
    expect(result.tools.length).toBe(1)
    expect(result.tools[0].name).toBe('my_custom')
  })

  it('should return all custom tools when query is empty', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'tool_a',
        description: 'a',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return 1'
      },
      {
        name: 'tool_b',
        description: 'b',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return 2'
      }
    ])
    const result = JSON.parse(await executeElectronTool('find_tools', {}))
    expect(result.tools.length).toBe(2)
  })

  it('should exclude disabled tools from find_tools', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'enabled',
        description: 'yes',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return 1'
      },
      {
        name: 'disabled',
        description: 'no',
        source_type: 'js_function',
        is_enabled: false,
        source_code: 'return 2'
      }
    ])
    const result = JSON.parse(await executeElectronTool('find_tools', { query: '' }))
    expect(result.tools.length).toBe(1)
    expect(result.tools[0].name).toBe('enabled')
  })

  it('should execute JS function custom tool via run_tool', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'my_custom',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return { result: args.x + 1 }'
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'my_custom', args: { x: 5 } })
    )
    expect(result.result).toBe(6)
  })

  it('should restrict unsafe modules via run_tool', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'unsafe_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'const fs = require("fs"); return fs.readFileSync("/etc/passwd", "utf8")'
      }
    ])
    await expect(
      executeElectronTool('run_tool', { name: 'unsafe_tool', args: {} })
    ).rejects.toThrow('not allowed')
  })

  it('should allow safe modules via run_tool', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'safe_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'const p = require("path"); return p.join("a", "b")'
      }
    ])
    const result = await executeElectronTool('run_tool', { name: 'safe_tool', args: {} })
    expect(result).toBe('a/b')
  })

  it('should return error for unknown custom tool name', async () => {
    storeMod.storeSet('customTools', [])
    const result = JSON.parse(await executeElectronTool('run_tool', { name: 'nope', args: {} }))
    expect(result.error).toContain('No tool named')
  })

  it('should not execute disabled custom tools via run_tool', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'disabled_tool',
        source_type: 'js_function',
        is_enabled: false,
        source_code: 'return "should not run"'
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'disabled_tool', args: {} })
    )
    expect(result.error).toContain('No tool named')
  })

  it('should throw for custom tool without source via run_tool', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'no_source',
        source_type: 'something_else',
        is_enabled: true
      }
    ])
    await expect(executeElectronTool('run_tool', { name: 'no_source', args: {} })).rejects.toThrow(
      'no executable source'
    )
  })
})

describe('executeElectronTool - builtin tools routing', () => {
  it('should route run_local_command to builtin registry', async () => {
    const result = await executeElectronTool('run_local_command', { command: 'echo hello' })
    expect(mockRunLocalCommand).toHaveBeenCalledWith({ command: 'echo hello' })
    const parsed = JSON.parse(result)
    expect(parsed.exitCode).toBe(0)
    expect(parsed.stdout).toBe('hello')
  })

  it('should route write_local_file to builtin registry', async () => {
    await executeElectronTool('write_local_file', {
      path: '/tmp/test.txt',
      content: 'hi'
    })
    expect(mockWriteLocalFile).toHaveBeenCalledWith({ path: '/tmp/test.txt', content: 'hi' })
  })

  it('should route read_local_file to builtin registry', async () => {
    await executeElectronTool('read_local_file', { path: '/tmp/test.txt' })
    expect(mockReadLocalFile).toHaveBeenCalledWith({ path: '/tmp/test.txt' })
  })

  it('should route list_local_directory to builtin registry', async () => {
    await executeElectronTool('list_local_directory', { path: '/tmp' })
    expect(mockListLocalDirectory).toHaveBeenCalledWith({ path: '/tmp' })
  })

  it('should route fetch_webpage to builtin registry', async () => {
    await executeElectronTool('fetch_webpage', { url: 'https://example.com' })
    expect(mockFetchWebpage).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('should route grep_local to builtin registry', async () => {
    await executeElectronTool('grep_local', { pattern: 'test', path: '/tmp' })
    expect(mockGrepLocal).toHaveBeenCalledWith({ pattern: 'test', path: '/tmp' })
  })

  it('should route glob_local to builtin registry', async () => {
    await executeElectronTool('glob_local', { pattern: '*.js' })
    expect(mockGlobLocal).toHaveBeenCalledWith({ pattern: '*.js' })
  })

  it('should return string result directly from builtin', async () => {
    mockReadLocalFile.mockResolvedValueOnce('raw text content')
    const result = await executeElectronTool('read_local_file', { path: '/test.txt' })
    expect(result).toBe('raw text content')
  })

  it('should JSON-serialize object results from builtins', async () => {
    mockRunLocalCommand.mockResolvedValueOnce({ exitCode: 0, stdout: 'works' })
    const result = await executeElectronTool('run_local_command', { command: 'ls' })
    const parsed = JSON.parse(result)
    expect(parsed.exitCode).toBe(0)
  })
})

describe('executeElectronTool - unknown tools', () => {
  it('should throw for completely unknown tool with no handler', async () => {
    await expect(executeElectronTool('does_not_exist_xyz', {})).rejects.toThrow('No handler')
  })
})

describe('SAFE_MODULES whitelist', () => {
  const safeModules = ['path', 'url', 'querystring', 'crypto', 'util', 'buffer', 'os']

  it.each(safeModules)('should allow require("%s") via run_tool', async (moduleName) => {
    storeMod.storeSet('customTools', [
      {
        name: 'mod_test',
        source_type: 'js_function',
        is_enabled: true,
        source_code: `const m = require("${moduleName}"); return typeof m`
      }
    ])

    const result = await executeElectronTool('run_tool', { name: 'mod_test', args: {} })
    expect(result).toBe('object')
  })

  const unsafeModules = ['fs', 'child_process', 'net', 'http', 'https', 'dgram']

  it.each(unsafeModules)('should block require("%s") via run_tool', async (moduleName) => {
    storeMod.storeSet('customTools', [
      {
        name: 'mod_test',
        source_type: 'js_function',
        is_enabled: true,
        source_code: `const m = require("${moduleName}"); return "leaked"`
      }
    ])

    await expect(executeElectronTool('run_tool', { name: 'mod_test', args: {} })).rejects.toThrow(
      'not allowed'
    )
  })
})

describe('validateArgs via run_tool', () => {
  it('should reject missing required fields', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'strict_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return args.x',
        parameters: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'string' } },
          required: ['x', 'y']
        }
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'strict_tool', args: { x: 1 } })
    )
    expect(result.error).toBe('invalid_args')
    expect(result.issues).toContain('"y" is required')
    expect(result.schema).toBeDefined()
    expect(result.schema.properties.x.type).toBe('number')
  })

  it('should reject wrong types', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'typed_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return args.count',
        parameters: {
          type: 'object',
          properties: { count: { type: 'number' } },
          required: []
        }
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'typed_tool', args: { count: 'five' } })
    )
    expect(result.error).toBe('invalid_args')
    expect(result.issues[0]).toContain('must be number')
  })

  it('should pass validation for correct args', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'valid_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return { sum: args.a + args.b }',
        parameters: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b']
        }
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'valid_tool', args: { a: 2, b: 3 } })
    )
    expect(result.sum).toBe(5)
  })

  it('should skip validation when tool has no parameters schema', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'no_schema',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return "ok"'
      }
    ])
    const result = await executeElectronTool('run_tool', {
      name: 'no_schema',
      args: { anything: true }
    })
    expect(result).toBe('ok')
  })

  it('should return full schema in validation error for self-correction', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'schema_return',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return 1',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string', description: 'Target URL' } },
          required: ['url']
        }
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'schema_return', args: {} })
    )
    expect(result.error).toBe('invalid_args')
    expect(result.schema.properties.url.description).toBe('Target URL')
  })

  it('should detect array type correctly', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'array_tool',
        source_type: 'js_function',
        is_enabled: true,
        source_code: 'return args.items.length',
        parameters: {
          type: 'object',
          properties: { items: { type: 'string' } },
          required: ['items']
        }
      }
    ])
    const result = JSON.parse(
      await executeElectronTool('run_tool', { name: 'array_tool', args: { items: ['a', 'b'] } })
    )
    expect(result.error).toBe('invalid_args')
    expect(result.issues[0]).toContain('must be string, got array')
  })
})

describe('fuzzy find_tools', () => {
  beforeEach(() => {
    storeMod.storeSet('customTools', [
      {
        name: 'weather_api',
        description: 'Get current weather for a city',
        source_type: 'http_webhook',
        is_enabled: true
      },
      {
        name: 'send_email',
        description: 'Send an email to a recipient',
        source_type: 'js_function',
        is_enabled: true
      },
      {
        name: 'math_calculator',
        description: 'Perform arithmetic operations',
        source_type: 'js_function',
        is_enabled: true
      },
      {
        name: 'file_converter',
        description: 'Convert files between formats',
        source_type: 'desktop',
        is_enabled: true
      }
    ])
  })

  it('should rank exact name token match highest', async () => {
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'weather' }))
    expect(result.tools[0].name).toBe('weather_api')
  })

  it('should match partial tokens in name', async () => {
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'mail' }))
    expect(result.tools.length).toBeGreaterThanOrEqual(1)
    expect(result.tools[0].name).toBe('send_email')
  })

  it('should match description tokens', async () => {
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'arithmetic' }))
    expect(result.tools.length).toBeGreaterThanOrEqual(1)
    expect(result.tools[0].name).toBe('math_calculator')
  })

  it('should return empty when no tokens match', async () => {
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'unknown' }))
    expect(result.tools.length).toBe(0)
  })

  it('should handle multi-word queries', async () => {
    const result = JSON.parse(
      await executeElectronTool('find_tools', { query: 'convert file format' })
    )
    expect(result.tools[0].name).toBe('file_converter')
  })

  it('should include id field in results', async () => {
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'weather' }))
    expect(result.tools[0].id).toBeDefined()
  })

  it('should sort by relevance score descending', async () => {
    const result = JSON.parse(
      await executeElectronTool('find_tools', { query: 'send email recipient' })
    )
    expect(result.tools[0].name).toBe('send_email')
  })
})

describe('manage_tool', () => {
  it('should create a new tool', async () => {
    storeMod.storeSet('customTools', [])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'create',
        name: 'my_new_tool',
        description: 'Does something',
        source_type: 'js_function',
        source_code: 'return "hello"'
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.name).toBe('my_new_tool')
    expect(result.tool.id).toBeDefined()
    expect(result.tool.isEnabled).toBe(true)
    expect(result.tool.createdAt).toBeDefined()
  })

  it('should persist created tool to store', async () => {
    storeMod.storeSet('customTools', [])
    await executeElectronTool('manage_tool', {
      action: 'create',
      name: 'persisted_tool',
      description: 'test',
      source_type: 'js_function',
      source_code: 'return 1'
    })
    const tools = storeMod.storeGet('customTools')
    expect(tools.length).toBe(1)
    expect(tools[0].name).toBe('persisted_tool')
  })

  it('should reject duplicate tool names on create', async () => {
    storeMod.storeSet('customTools', [{ name: 'existing', id: 'e1' }])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'create',
        name: 'existing'
      })
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('should require name for create', async () => {
    const result = JSON.parse(await executeElectronTool('manage_tool', { action: 'create' }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('name is required')
  })

  it('should update tool by id', async () => {
    storeMod.storeSet('customTools', [
      { id: 'tool-1', name: 'update_me', description: 'old', source_code: 'return 1' }
    ])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'update',
        id: 'tool-1',
        description: 'new description',
        source_code: 'return 2'
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.description).toBe('new description')
    expect(result.tool.sourceCode).toBe('return 2')
    expect(result.tool.updatedAt).toBeDefined()
  })

  it('should update tool by name', async () => {
    storeMod.storeSet('customTools', [{ id: 'tool-2', name: 'by_name', description: 'old' }])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'update',
        id: 'by_name',
        description: 'updated'
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.description).toBe('updated')
  })

  it('should return error for update of non-existent tool', async () => {
    storeMod.storeSet('customTools', [])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'update',
        id: 'ghost'
      })
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('should delete tool by id', async () => {
    storeMod.storeSet('customTools', [{ id: 'del-1', name: 'delete_me', description: 'bye' }])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'delete',
        id: 'del-1'
      })
    )
    expect(result.ok).toBe(true)
    expect(result.deleted).toBe('delete_me')
    expect(storeMod.storeGet('customTools').length).toBe(0)
  })

  it('should delete tool by name', async () => {
    storeMod.storeSet('customTools', [{ id: 'del-2', name: 'delete_by_name', description: 'bye' }])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'delete',
        name: 'delete_by_name'
      })
    )
    expect(result.ok).toBe(true)
    expect(result.deleted).toBe('delete_by_name')
  })

  it('should return error for invalid action', async () => {
    const result = JSON.parse(await executeElectronTool('manage_tool', { action: 'explode' }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('must be create, update, or delete')
  })

  it('should require id or name for delete', async () => {
    const result = JSON.parse(await executeElectronTool('manage_tool', { action: 'delete' }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('required for delete')
  })

  it('should convert parameters array to JSON schema on create', async () => {
    storeMod.storeSet('customTools', [])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'create',
        name: 'array_params',
        description: 'test',
        source_type: 'js_function',
        source_code: 'return args.city',
        parameters: [
          { name: 'city', type: 'string', description: 'City name', required: true },
          { name: 'units', type: 'string', description: 'Units' }
        ]
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.parameters.type).toBe('object')
    expect(result.tool.parameters.properties.city.type).toBe('string')
    expect(result.tool.parameters.required).toContain('city')
    expect(result.tool.parameters.required).not.toContain('units')
  })

  it('should convert parameters array to JSON schema on update', async () => {
    storeMod.storeSet('customTools', [
      { id: 'up-1', name: 'update_params', parameters: { type: 'object', properties: {} } }
    ])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'update',
        id: 'up-1',
        parameters: [{ name: 'url', type: 'string', required: true }]
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.parameters.properties.url.type).toBe('string')
    expect(result.tool.parameters.required).toContain('url')
  })

  it('should invalidate tool definitions after create', async () => {
    const { invalidateToolDefinitions } = await import('../../../src/main/chat/chat.session.js')
    storeMod.storeSet('customTools', [])
    invalidateToolDefinitions.mockClear()
    await executeElectronTool('manage_tool', {
      action: 'create',
      name: 'invalidation_test',
      source_type: 'js_function',
      source_code: 'return 1'
    })
    expect(invalidateToolDefinitions).toHaveBeenCalled()
  })

  it('should allow toggling is_enabled via update', async () => {
    storeMod.storeSet('customTools', [{ id: 'toggle-1', name: 'toggleable', is_enabled: true }])
    const result = JSON.parse(
      await executeElectronTool('manage_tool', {
        action: 'update',
        id: 'toggle-1',
        is_enabled: false
      })
    )
    expect(result.ok).toBe(true)
    expect(result.tool.isEnabled).toBe(false)
  })
})
