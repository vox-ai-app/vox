import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/test/file.txt'] })
  }
}))

vi.mock('../src/main/storage/store', () => {
  const store = {}
  return {
    storeGet: (key) => store[key] ?? null,
    storeSet: (key, val) => {
      store[key] = val
    },
    _store: store,
    _reset: () => {
      for (const k of Object.keys(store)) delete store[k]
    }
  }
})

vi.mock('../src/main/storage/secrets', () => ({
  getToolSecrets: (_name) => ({ api_key: 'secret-123' })
}))

vi.mock('../src/main/mcp/mcp.service', () => ({
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

vi.mock('../src/main/chat/task.queue', () => ({
  enqueueTask: vi.fn(),
  waitForTaskCompletion: vi
    .fn()
    .mockResolvedValue({ taskId: 't1', status: 'completed', result: 'done' }),
  getTaskDetail: vi.fn(() => ({ task: { id: 't1', status: 'completed' } })),
  listTaskHistory: vi.fn(() => ({ tasks: [], has_more: false }))
}))

vi.mock('../src/main/chat/chat.session', () => ({
  getToolDefinitions: () => []
}))

vi.mock('../src/main/storage/tasks.db', () => ({
  searchTasksFts: vi.fn(() => [])
}))

const _schedules = new Map()
vi.mock('../src/main/scheduler.service', () => ({
  addSchedule: vi.fn((config) => {
    const id = config.id || `sched_${Date.now()}`
    const s = {
      id,
      expr: config.expr,
      tz: config.tz || null,
      prompt: config.prompt,
      channel: config.channel || null,
      enabled: config.enabled !== false,
      once: config.once === true
    }
    _schedules.set(id, s)
    return s
  }),
  removeSchedule: vi.fn((id) => {
    _schedules.delete(id)
  }),
  getSchedules: vi.fn(() =>
    [..._schedules.values()].map((s) => ({ ...s, nextRun: Date.now() + 3600000 }))
  )
}))

vi.mock('../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const { executeElectronTool } = await import('../src/main/ai/llm.tool-executor.js')
const storeMod = await import('../src/main/storage/store')

beforeEach(() => {
  storeMod._reset()
  _schedules.clear()
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
    const stored = storeMod.storeGet('vox.user.info')
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
    const result = await executeElectronTool('spawn_task', { instructions: 'Do something' })
    const parsed = JSON.parse(result)
    expect(parsed.status).toBe('spawned')
    expect(parsed.taskId).toBeDefined()
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

describe('executeElectronTool - schedule_task', () => {
  it('should schedule a task with valid cron', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Check email',
        cron_expression: '0 9 * * *'
      })
    )
    expect(result.scheduled).toBe(true)
    expect(result.schedule_id).toBeDefined()
    expect(result.cron_expression).toBe('0 9 * * *')
    expect(result.instructions).toBe('Check email')
    expect(result.note).toContain('Vox is open')
  })

  it('should pass timezone through', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Morning brief',
        cron_expression: '0 8 * * 1-5',
        timezone: 'America/New_York'
      })
    )
    expect(result.scheduled).toBe(true)
    expect(result.timezone).toBe('America/New_York')
  })

  it('should set once flag', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'One-time reminder',
        cron_expression: '30 14 * * *',
        once: true
      })
    )
    expect(result.once).toBe(true)
  })

  it('should reject empty cron expression', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Test',
        cron_expression: ''
      })
    )
    expect(result.error).toContain('cron_expression is required')
  })

  it('should reject empty instructions', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: '',
        cron_expression: '0 9 * * *'
      })
    )
    expect(result.error).toContain('instructions is required')
  })

  it('should reject invalid cron with wrong field count', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Test',
        cron_expression: '0 9 *'
      })
    )
    expect(result.error).toContain('Invalid cron')
  })

  it('should reject bare * minute field (every-minute)', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Spam',
        cron_expression: '* * * * *'
      })
    )
    expect(result.error).toContain('Minimum interval')
  })

  it('should reject */1 minute interval', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Spam',
        cron_expression: '*/1 * * * *'
      })
    )
    expect(result.error).toContain('Minimum interval')
  })

  it('should accept */5 minute interval', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Frequent check',
        cron_expression: '*/5 * * * *'
      })
    )
    expect(result.scheduled).toBe(true)
  })

  it('should reject */3 minute interval', async () => {
    const result = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'Too fast',
        cron_expression: '*/3 * * * *'
      })
    )
    expect(result.error).toContain('Minimum interval')
  })
})

describe('executeElectronTool - list_schedules', () => {
  it('should return empty list when no schedules', async () => {
    const result = JSON.parse(await executeElectronTool('list_schedules', {}))
    expect(result.schedules).toEqual([])
    expect(result.count).toBe(0)
  })

  it('should return schedules after scheduling', async () => {
    await executeElectronTool('schedule_task', {
      instructions: 'Daily check',
      cron_expression: '0 10 * * *'
    })
    const result = JSON.parse(await executeElectronTool('list_schedules', {}))
    expect(result.count).toBe(1)
    expect(result.schedules[0].instructions).toBe('Daily check')
    expect(result.schedules[0].cron_expression).toBe('0 10 * * *')
    expect(result.schedules[0].next_run).toBeDefined()
  })
})

describe('executeElectronTool - remove_schedule', () => {
  it('should remove an existing schedule', async () => {
    const created = JSON.parse(
      await executeElectronTool('schedule_task', {
        instructions: 'To remove',
        cron_expression: '0 12 * * *'
      })
    )
    const result = JSON.parse(
      await executeElectronTool('remove_schedule', { schedule_id: created.schedule_id })
    )
    expect(result.removed).toBe(true)
    expect(result.schedule_id).toBe(created.schedule_id)
    const list = JSON.parse(await executeElectronTool('list_schedules', {}))
    expect(list.count).toBe(0)
  })

  it('should error for empty schedule_id', async () => {
    const result = JSON.parse(await executeElectronTool('remove_schedule', { schedule_id: '' }))
    expect(result.error).toContain('schedule_id is required')
  })

  it('should error for non-existent schedule', async () => {
    const result = JSON.parse(
      await executeElectronTool('remove_schedule', { schedule_id: 'not_real' })
    )
    expect(result.error).toContain('not found')
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
