import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { execSync } from 'child_process'

const testDir = mkdtempSync(join(tmpdir(), 'vox-tool-audit-'))

let hasQuartz = false
if (process.platform === 'darwin') {
  try {
    execSync('python3 -c "import Quartz"', { stdio: 'ignore' })
    hasQuartz = true
  } catch {
    /* Quartz not installed */
  }
}
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
    tags: t.tags || [],
    isEnabled:
      t.is_enabled !== undefined ? t.is_enabled : t.isEnabled !== undefined ? t.isEnabled : true,
    createdAt: t.created_at || t.createdAt || new Date().toISOString(),
    updatedAt: t.updated_at || t.updatedAt || new Date().toISOString()
  }
}

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {
    /* cleanup */
  }
})

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/vox-test' },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/test/file.txt'] })
  },
  clipboard: {
    readText: vi.fn(() => 'mock clipboard text'),
    writeText: vi.fn()
  }
}))

vi.mock('../../../src/main/storage/store', () => {
  const store = {}
  return {
    storeGet: (key) => store[key] ?? null,
    storeSet: (key, val) => {
      if (key === 'customTools') {
        mockToolStore.length = 0
        if (Array.isArray(val)) val.forEach((t) => mockToolStore.push(normToCamel(t)))
        return
      }
      store[key] = val
    },
    storeDelete: (key) => {
      delete store[key]
    },
    storeGetAll: () => ({ ...store }),
    _store: store,
    _reset: () => {
      for (const k of Object.keys(store)) delete store[k]
      mockToolStore.length = 0
    }
  }
})

vi.mock('../../../src/main/storage/secrets', () => ({
  getToolSecrets: () => ({})
}))

vi.mock('../../../src/main/mcp/mcp.service', () => ({
  getMcpToolDefinitions: () => [],
  executeMcpTool: vi.fn()
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
  getToolDefinitions: () => []
}))

vi.mock('../../../src/main/storage/tasks.db', () => ({
  searchTasksFts: vi.fn(() => []),
  searchTasksSemantic: vi.fn(async () => [])
}))

vi.mock('../../../src/main/storage/tasks.db.js', () => ({
  searchTasksFts: vi.fn(() => []),
  searchTasksSemantic: vi.fn(async () => [])
}))

vi.mock('../../../src/main/storage/messages.db.js', () => {
  let userInfo = {}
  return {
    searchMessagesSemantic: vi.fn(async () => []),
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
      id: `tool-${Date.now()}`,
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

vi.mock('../../../src/main/storage/db.js', () => ({
  getDb: vi.fn(() => ({}))
}))

vi.mock('../../../src/main/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('FS TOOLS - real execution', () => {
  const testFile = join(testDir, 'test-write.txt')

  it('write_local_file: creates a new file', async () => {
    const { writeLocalFile } = await import('../../../packages/tools/src/tools/fs/execute.js')
    await writeLocalFile({ path: testFile, content: 'hello world' })
    expect(existsSync(testFile)).toBe(true)
    expect(readFileSync(testFile, 'utf8')).toBe('hello world')
  })

  it('read_local_file: reads the created file', async () => {
    writeFileSync(testFile, 'hello world')
    const { readLocalFile } = await import('../../../packages/tools/src/tools/fs/execute.js')
    const result = await readLocalFile({ path: testFile })
    const content = typeof result === 'string' ? result : result.content
    expect(content).toContain('hello world')
  })

  it('edit_local_file: replaces content in file', async () => {
    writeFileSync(testFile, 'hello world')
    const { readLocalFile } = await import('../../../packages/tools/src/tools/fs/execute.js')
    await readLocalFile({ path: testFile })
    const { editLocalFile } = await import('../../../packages/tools/src/tools/fs/edit.execute.js')
    await editLocalFile({
      path: testFile,
      old_string: 'hello world',
      new_string: 'goodbye world'
    })
    expect(readFileSync(testFile, 'utf8')).toBe('goodbye world')
  })

  it('list_local_directory: lists the temp directory', async () => {
    writeFileSync(join(testDir, 'listme.txt'), 'x')
    const { listLocalDirectory } = await import('../../../packages/tools/src/tools/fs/execute.js')
    const result = await listLocalDirectory({ path: testDir })
    const entries = result.entries || result.items || result
    expect(Array.isArray(entries)).toBe(true)
    const names = entries.map((e) => e.name || e)
    expect(names).toContain('listme.txt')
  })

  it('get_scratch_dir: returns a scratch directory', async () => {
    const { getScratchDir } = await import('../../../packages/tools/src/tools/fs/execute.js')
    const result = await getScratchDir({})
    const dirPath = result.path || result.dir || (typeof result === 'string' ? result : null)
    expect(dirPath).toBeTruthy()
    expect(existsSync(dirPath)).toBe(true)
  })

  it('delete_local_path: deletes a file', async () => {
    const delTarget = join(testDir, 'to-delete.txt')
    writeFileSync(delTarget, 'delete me')
    const { deleteLocalPath } = await import('../../../packages/tools/src/tools/fs/execute.js')
    await deleteLocalPath({ path: delTarget })
    expect(existsSync(delTarget)).toBe(false)
  })
})

describe('SHELL TOOL - real execution', () => {
  it('runs an echo command', async () => {
    const { runLocalCommand } = await import('../../../packages/tools/src/tools/shell/execute.js')
    const result = await runLocalCommand({ command: 'echo "tool test"' })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toContain('tool test')
  })

  it('blocks dangerous commands', async () => {
    const { runLocalCommand } = await import('../../../packages/tools/src/tools/shell/execute.js')
    await expect(runLocalCommand({ command: '; rm -rf /' })).rejects.toThrow('blocked')
  })

  it('returns non-zero exit for bad commands', async () => {
    const { runLocalCommand } = await import('../../../packages/tools/src/tools/shell/execute.js')
    const result = await runLocalCommand({ command: 'false' })
    expect(result.exitCode).not.toBe(0)
  })
})

describe('GREP TOOL - real execution', () => {
  it('finds pattern in test dir', async () => {
    writeFileSync(join(testDir, 'grepme.txt'), 'findthisunique42 in line\nanother line')
    const { grepLocal } = await import('../../../packages/tools/src/tools/grep/execute.js')
    const result = await grepLocal({ pattern: 'findthisunique42', path: testDir })
    expect(result.matchCount).toBeGreaterThan(0)
    expect(result.content).toContain('findthisunique42')
  })
})

describe('GLOB TOOL - real execution', () => {
  it('finds .txt files in test dir', async () => {
    writeFileSync(join(testDir, 'globtest.txt'), 'x')
    const { globLocal } = await import('../../../packages/tools/src/tools/glob/execute.js')
    const result = await globLocal({ pattern: '*.txt', path: testDir })
    const files = result.files || result.results || result
    expect(Array.isArray(files)).toBe(true)
    expect(files.length).toBeGreaterThan(0)
  })
})

describe('FETCH TOOL - real execution', () => {
  it('fetches a real URL', async () => {
    const { execute } = await import('../../../packages/tools/src/tools/fetch/execute.js')
    const fetchFn = execute({})
    const result = await fetchFn({ url: 'https://example.com' })
    expect(result).toBeDefined()
    if (result.error) {
      console.warn('fetch_webpage returned error:', result.error)
      return
    }
    expect(result.content).toBeTruthy()
    expect(result.content.length).toBeGreaterThan(50)
  })
})

describe('DOCUMENT TOOLS - real execution', () => {
  it('create_word_document: creates a .docx file', async () => {
    const { createWordDocument } =
      await import('../../../packages/tools/src/tools/docs/word/execute.js')
    const outPath = join(testDir, 'test.docx')
    await createWordDocument({ path: outPath, content: 'Hello from Vox tool audit' })
    expect(existsSync(outPath)).toBe(true)
  })

  it('create_pdf_document: creates a .pdf file', async () => {
    const { createPdfDocument } =
      await import('../../../packages/tools/src/tools/docs/pdf/execute.js')
    const outPath = join(testDir, 'test.pdf')
    await createPdfDocument({ path: outPath, content: 'Hello from Vox PDF audit' })
    expect(existsSync(outPath)).toBe(true)
  })

  it('create_presentation_document: creates a .pptx file', async () => {
    const { createPresentationDocument } =
      await import('../../../packages/tools/src/tools/docs/pptx/execute.js')
    const outPath = join(testDir, 'test.pptx')
    await createPresentationDocument({
      path: outPath,
      slides: [{ title: 'Audit', body: 'Testing pptx creation' }],
      finalize: true
    })
    expect(existsSync(outPath)).toBe(true)
  })
})

describe('MAIL TOOLS - validation', () => {
  it('sendEmail: validates required "to" field', async () => {
    const { sendEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(sendEmail({})).rejects.toThrow(/"to" is required/)
  })

  it('replyToEmail: validates required fields', async () => {
    const { replyToEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(replyToEmail({})).rejects.toThrow(/"message_id" is required/)
    await expect(replyToEmail({ message_id: '123' })).rejects.toThrow(/"body" is required/)
  })

  it('forwardEmail: validates required fields', async () => {
    const { forwardEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(forwardEmail({})).rejects.toThrow(/"message_id" is required/)
    await expect(forwardEmail({ message_id: '123' })).rejects.toThrow(/"to" is required/)
  })

  it('markEmailRead: validates required fields', async () => {
    const { markEmailRead } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(markEmailRead({})).rejects.toThrow(/"message_id" is required/)
  })

  it('flagEmail: validates required fields', async () => {
    const { flagEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(flagEmail({})).rejects.toThrow(/"message_id" is required/)
  })

  it('deleteEmail: validates required fields', async () => {
    const { deleteEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(deleteEmail({})).rejects.toThrow(/"message_id" is required/)
  })

  it('moveEmail: validates required fields', async () => {
    const { moveEmail } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(moveEmail({})).rejects.toThrow(/"message_id" is required/)
    await expect(moveEmail({ message_id: '123' })).rejects.toThrow(/"target_folder" is required/)
  })

  it('createDraft: validates required "to" field', async () => {
    const { createDraft } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(createDraft({})).rejects.toThrow(/"to" is required/)
  })

  it('saveAttachment: validates required fields', async () => {
    const { saveAttachment } = await import('../../../packages/integrations/src/mail/index.js')
    await expect(saveAttachment({})).rejects.toThrow(/"message_id" is required/)
    await expect(saveAttachment({ message_id: '123' })).rejects.toThrow(
      /"attachment_name" is required/
    )
  })
})

describe('MAIL TOOLS - read_emails live (macOS only)', () => {
  it('reads from Mail DB if accessible', async () => {
    if (process.platform !== 'darwin') return
    const { readEmails } = await import('../../../packages/integrations/src/mail/index.js')
    try {
      const result = await readEmails({ folder: 'INBOX', limit: 1 })
      expect(result).toHaveProperty('messages')
      expect(result).toHaveProperty('count')
    } catch (err) {
      if (
        /Full Disk Access|fileMustExist|SQLITE_CANTOPEN|no such table|ENOENT|NODE_MODULE_VERSION|timed out/.test(
          err.message
        )
      ) {
        console.warn('read_emails: not available -', err.message.slice(0, 80))
        return
      }
      throw err
    }
  }, 15000)
})

describe('IMESSAGE TOOLS - validation', () => {
  it('send_imessage: validates required fields', async () => {
    if (process.platform !== 'darwin') return
    const { IMESSAGE_TOOLS } = await import('../../../packages/integrations/src/imessage/tools.js')
    const sendTool = IMESSAGE_TOOLS.find((t) => t.definition.name === 'send_imessage')
    expect(sendTool).toBeDefined()
    const fn = sendTool.execute(null)
    await expect(fn({})).rejects.toThrow(/"handle" is required/)
    await expect(fn({ handle: '+1234' })).rejects.toThrow(/"text" is required/)
  })
})

describe('IMESSAGE TOOLS - list conversations (macOS only)', () => {
  it('queries Messages DB if accessible', async () => {
    if (process.platform !== 'darwin') return
    try {
      const { listConversations } =
        await import('../../../packages/integrations/src/imessage/mac/data.js')
      const convos = listConversations()
      expect(Array.isArray(convos)).toBe(true)
    } catch (err) {
      if (/SQLITE_CANTOPEN|fileMustExist|ENOENT|NODE_MODULE_VERSION/.test(err.message)) {
        console.warn('iMessage DB not accessible -', err.message.slice(0, 80))
        return
      }
      throw err
    }
  })
})

describe('SCREEN TOOLS - live execution (macOS only)', () => {
  it('list_apps: lists applications', async () => {
    if (process.platform !== 'darwin') return
    const { listApps } = await import('../../../packages/integrations/src/screen/control/index.js')
    const result = await listApps()
    const apps = result.apps || result
    expect(Array.isArray(apps)).toBe(true)
    expect(apps.length).toBeGreaterThan(0)
  })

  it.skipIf(!hasQuartz)('get_mouse_position: returns coordinates', async () => {
    const { getMousePosition } =
      await import('../../../packages/integrations/src/screen/control/index.js')
    const result = await getMousePosition()
    expect(result).toHaveProperty('x')
    expect(result).toHaveProperty('y')
  })

  it('clipboard_read: reads clipboard', async () => {
    if (process.platform !== 'darwin') return
    const { clipboardRead } =
      await import('../../../packages/integrations/src/screen/control/index.js')
    const result = await clipboardRead()
    expect(result).toBeDefined()
  })

  it('acquire_screen + release_screen: manages lock', async () => {
    const { acquireScreen, releaseScreen } =
      await import('../../../packages/integrations/src/screen/queue.js')
    const sessionId = 'audit-test-' + Date.now()
    const acq = await acquireScreen({ sessionId })
    expect(acq.sessionId).toBe(sessionId)
    const rel = await releaseScreen({ sessionId })
    expect(rel.ok).toBe(true)
  })
})

describe('ELECTRON-LEVEL TOOLS - via tool executor', () => {
  let executeElectronTool, storeMod

  beforeEach(async () => {
    const mod = await import('../../../src/main/ai/llm/tool-executor.js')
    executeElectronTool = mod.executeElectronTool
    storeMod = await import('../../../src/main/storage/store')
    storeMod._reset()
    const msgDb = await import('../../../src/main/storage/messages.db.js')
    if (msgDb._resetUserInfo) msgDb._resetUserInfo()
  })

  it('save_user_info: saves and accumulates', async () => {
    await executeElectronTool('save_user_info', { info_key: 'city', info_value: 'NYC' })
    await executeElectronTool('save_user_info', { info_key: 'job', info_value: 'eng' })
    const { getConversationUserInfo } = await import('../../../src/main/storage/messages.db.js')
    const info = getConversationUserInfo()
    expect(info.city).toBe('NYC')
    expect(info.job).toBe('eng')
  })

  it('find_tools: returns matching tools', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'slack_notify',
        description: 'Send Slack notification',
        source_type: 'http_webhook',
        is_enabled: true,
        webhook_url: 'https://hooks.slack.com/x'
      },
      {
        name: 'jira_create',
        description: 'Create Jira ticket',
        source_type: 'http_webhook',
        is_enabled: true,
        webhook_url: 'https://jira.com/x'
      }
    ])
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'slack' }))
    expect(result.tools.length).toBe(1)
    expect(result.tools[0].name).toBe('slack_notify')
  })

  it('find_tools: returns empty for no matches', async () => {
    storeMod.storeSet('customTools', [
      {
        name: 'slack_notify',
        description: 'Send Slack notification',
        source_type: 'http_webhook',
        is_enabled: true
      }
    ])
    const result = JSON.parse(await executeElectronTool('find_tools', { query: 'xyz_nothing' }))
    expect(result.tools.length).toBe(0)
  })

  it('run_tool: clear error for non-existent tool', async () => {
    storeMod.storeSet('customTools', [])
    const result = JSON.parse(await executeElectronTool('run_tool', { name: 'nonexist' }))
    expect(result.error).toContain('No tool named')
  })

  it('run_tool: requires name param', async () => {
    const result = JSON.parse(await executeElectronTool('run_tool', {}))
    expect(result.error).toContain('name is required')
  })

  it('spawn_task: spawns and returns taskId', async () => {
    const output = await executeElectronTool('spawn_task', { instructions: 'test task' })
    expect(output.endTurn).toBe(true)
    const result = JSON.parse(output.result)
    expect(result.id).toBeDefined()
    expect(result.status).toBe('spawned')
  })

  it('get_task: returns task detail', async () => {
    const result = JSON.parse(await executeElectronTool('get_task', { taskId: 't1' }))
    expect(result.task).toBeDefined()
  })

  it('search_tasks: queries by keyword', async () => {
    const result = JSON.parse(await executeElectronTool('search_tasks', { query: 'test' }))
    expect(result).toHaveProperty('tasks')
  })

  it('search_tasks: queries by status', async () => {
    const result = JSON.parse(await executeElectronTool('search_tasks', { status: 'completed' }))
    expect(result).toHaveProperty('tasks')
  })
})

describe('TOOL REGISTRY - integration', () => {
  it('getDeclarations returns all registered tools', async () => {
    const { getDeclarations } = await import('../../../packages/tools/src/core/registry.js')
    const decls = getDeclarations()
    expect(Array.isArray(decls)).toBe(true)
    expect(decls.length).toBeGreaterThan(0)
    const names = decls.map((d) => d.name)
    expect(names).toContain('write_local_file')
    expect(names).toContain('read_local_file')
    expect(names).toContain('run_local_command')
  })

  it('run dispatches to a registered tool', async () => {
    const { run } = await import('../../../packages/tools/src/core/registry.js')
    const outPath = join(testDir, 'registry-test.txt')
    await run('write_local_file', { path: outPath, content: 'registry integration test' })
    expect(existsSync(outPath)).toBe(true)
    expect(readFileSync(outPath, 'utf8')).toBe('registry integration test')
  })

  it('run throws for unknown tool', async () => {
    const { run } = await import('../../../packages/tools/src/core/registry.js')
    await expect(run('totally_fake_tool_xyz', {})).rejects.toThrow()
  })
})
