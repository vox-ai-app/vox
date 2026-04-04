import { ALL_TOOLS } from '@vox-ai-app/tools'
import { registerAll, run as runRegistryTool } from '@vox-ai-app/tools/registry'
import { ALL_INTEGRATION_TOOLS } from '@vox-ai-app/integrations'
import { ALL_KNOWLEDGE_TOOLS } from '@vox-ai-app/indexing'
import { logger } from '../logger'

const SAFE_MODULES = new Set(['path', 'url', 'querystring', 'crypto', 'util', 'buffer', 'os'])

registerAll([...ALL_TOOLS, ...ALL_INTEGRATION_TOOLS, ...ALL_KNOWLEDGE_TOOLS])

export async function executeElectronTool(name, args) {
  switch (name) {
    case 'find_tools': {
      const { storeGet } = await import('../storage/store.js')
      const { getMcpToolDefinitions } = await import('../mcp/mcp.service.js')
      const customTools = storeGet('customTools') || []
      const query = String(args?.query || '').toLowerCase()
      const enabled = customTools.filter((t) => t.is_enabled !== false && t.name)
      const allTools = [
        ...enabled.map((t) => ({
          name: t.name,
          description: t.description || '',
          source_type: t.source_type || 'unknown',
          parameters: t.parameters || { type: 'object', properties: {} }
        })),
        ...getMcpToolDefinitions().map((t) => ({
          name: t.name,
          description: t.description || '',
          source_type: 'mcp',
          parameters: t.parameters || { type: 'object', properties: {} }
        }))
      ]
      if (!query) return JSON.stringify({ tools: allTools })
      const matches = allTools.filter(
        (t) => t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
      )
      return JSON.stringify({ tools: matches })
    }
    case 'run_tool': {
      const toolName = String(args?.name || '').trim()
      if (!toolName) return JSON.stringify({ error: 'name is required' })
      const toolArgs = args?.args || {}
      const { storeGet } = await import('../storage/store.js')
      const customTools = storeGet('customTools') || []
      const custom = customTools.find((t) => t.name === toolName && t.is_enabled !== false)
      if (custom) return executeCustomTool(custom, toolArgs)
      const { executeMcpTool, getMcpToolDefinitions } = await import('../mcp/mcp.service.js')
      const mcpDefs = getMcpToolDefinitions()
      if (mcpDefs.some((t) => t.name === toolName)) {
        return executeMcpTool(toolName, toolArgs)
      }
      return JSON.stringify({
        error: `No tool named "${toolName}" found. Call find_tools to discover available tools.`
      })
    }
    case 'pick_file':
    case 'get_file_path': {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: args?.filters
      })
      return result.canceled ? null : result.filePaths[0]
    }
    case 'pick_directory': {
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? null : result.filePaths[0]
    }
    case 'save_user_info': {
      const { storeGet, storeSet } = await import('../storage/store.js')
      const current = storeGet('vox.user.info') || {}
      const key = String(args?.info_key || '').trim()
      if (!key) return JSON.stringify({ error: 'info_key is required' })
      current[key] = args?.info_value ?? ''
      storeSet('vox.user.info', current)
      return JSON.stringify({ saved: true, key })
    }
    case 'spawn_task': {
      const { enqueueTask, waitForTaskCompletion } = await import('../chat/task.queue.js')
      const { getToolDefinitions } = await import('../chat/chat.session.js')
      const { randomUUID: uuid } = await import('crypto')
      const taskId = uuid()
      enqueueTask({
        taskId,
        instructions: args?.instructions || '',
        context: args?.context || '',
        toolDefinitions: getToolDefinitions()
      })
      if (args?.waitForResult) {
        const timeout = Math.min(Math.max(Number(args.timeoutMs) || 300000, 1000), 600000)
        const outcome = await waitForTaskCompletion(taskId, timeout)
        return JSON.stringify(outcome)
      }
      return JSON.stringify({ taskId, status: 'spawned' })
    }
    case 'get_task': {
      const { getTaskDetail } = await import('../chat/task.queue.js')
      const detail = getTaskDetail(String(args?.taskId || ''))
      if (!detail) return JSON.stringify({ error: 'Task not found' })
      return JSON.stringify(detail)
    }
    case 'search_tasks': {
      const { listTaskHistory } = await import('../chat/task.queue.js')
      const { searchTasksFts } = await import('../storage/tasks.db.js')
      if (args?.query) {
        const results = searchTasksFts(args.query)
        return JSON.stringify({ tasks: results, has_more: false })
      }
      return JSON.stringify(listTaskHistory({ status: args?.status || null }))
    }
    case 'schedule_task': {
      const { addSchedule } = await import('../scheduler.service.js')
      const expr = String(args?.cron_expression || '').trim()
      const instructions = String(args?.instructions || '').trim()
      if (!expr) return JSON.stringify({ error: 'cron_expression is required' })
      if (!instructions) return JSON.stringify({ error: 'instructions is required' })
      const parts = expr.split(/\s+/)
      if (parts.length < 5 || parts.length > 6)
        return JSON.stringify({
          error:
            'Invalid cron expression. Use 5-field format: minute hour day-of-month month day-of-week'
        })
      const minField = parts[0]
      if (
        /^\*$/.test(minField) ||
        (minField.startsWith('*/') && parseInt(minField.slice(2), 10) < 5)
      ) {
        return JSON.stringify({ error: 'Minimum interval is 5 minutes. Use "*/5" or higher.' })
      }
      const schedule = addSchedule({
        expr,
        tz: args?.timezone || null,
        prompt: instructions,
        enabled: true,
        once: args?.once === true
      })
      return JSON.stringify({
        scheduled: true,
        schedule_id: schedule.id,
        cron_expression: schedule.expr,
        timezone: schedule.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
        instructions: schedule.prompt,
        once: args?.once === true,
        note: 'This schedule only runs while Vox is open on your machine.'
      })
    }
    case 'list_schedules': {
      const { getSchedules } = await import('../scheduler.service.js')
      const schedules = getSchedules()
      return JSON.stringify({
        schedules: schedules.map((s) => ({
          schedule_id: s.id,
          cron_expression: s.expr,
          timezone: s.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
          instructions: s.prompt,
          enabled: s.enabled,
          once: s.once || false,
          next_run: s.nextRun ? new Date(s.nextRun).toISOString() : null
        })),
        count: schedules.length
      })
    }
    case 'remove_schedule': {
      const { removeSchedule, getSchedules } = await import('../scheduler.service.js')
      const id = String(args?.schedule_id || '').trim()
      if (!id) return JSON.stringify({ error: 'schedule_id is required' })
      const exists = getSchedules().some((s) => s.id === id)
      if (!exists) return JSON.stringify({ error: `Schedule "${id}" not found` })
      removeSchedule(id)
      return JSON.stringify({ removed: true, schedule_id: id })
    }
    default: {
      logger.info(`[tool-executor] Dispatching tool: ${name}`)

      try {
        const result = await runRegistryTool(name, args)
        logger.info(`[tool-executor] Registry handled: ${name}`)
        return typeof result === 'string' ? result : JSON.stringify(result ?? null)
      } catch (registryErr) {
        if (!registryErr?.message?.includes('Unknown desktop tool')) {
          return JSON.stringify({ error: registryErr.message })
        }
      }

      throw new Error(`No handler for tool: ${name}`)
    }
  }
}

async function executeCustomTool(custom, toolArgs) {
  if (custom.source_type === 'http_webhook' && custom.webhook_url) {
    const { getToolSecrets } = await import('../storage/secrets.js')
    const secrets = getToolSecrets(custom.name)
    const headers = { 'Content-Type': 'application/json', ...(custom.webhook_headers || {}) }
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string' && v.startsWith('secret:')) {
        const secretKey = v.slice(7)
        headers[k] = secrets[secretKey] || v
      }
    }
    const resp = await fetch(custom.webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(toolArgs || {}),
      signal: AbortSignal.timeout(30_000)
    })
    return await resp.text()
  }
  if (
    (custom.source_type === 'js_function' || custom.source_type === 'desktop') &&
    custom.source_code
  ) {
    const { createContext, runInContext } = await import('vm')
    const { createRequire } = await import('module')
    const vmRequire = createRequire(import.meta.url)
    const sandboxedRequire = (mod) => {
      if (!SAFE_MODULES.has(mod)) {
        throw new Error(`Module "${mod}" is not allowed in custom tool sandbox`)
      }
      return vmRequire(mod)
    }
    const sandbox = {
      args: toolArgs || {},
      require: sandboxedRequire,
      console: { log: () => {}, warn: () => {}, error: () => {} },
      Promise,
      JSON,
      Math,
      Date,
      __resolve: undefined,
      __reject: undefined
    }
    createContext(sandbox)
    const wrapped = `new Promise((resolve, reject) => { __resolve = resolve; __reject = reject; (async function(args) { ${custom.source_code} })(args).then(__resolve).catch(__reject) })`
    const resultPromise = runInContext(wrapped, sandbox, { timeout: 10_000 })
    const result = await resultPromise
    return typeof result === 'string' ? result : JSON.stringify(result ?? null)
  }
  throw new Error(`Custom tool "${custom.name}" has no executable source`)
}
