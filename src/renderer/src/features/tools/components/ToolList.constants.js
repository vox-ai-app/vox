export const TYPE_LABELS = {
  js_function: 'JS',
  http_webhook: 'Webhook',
  desktop: 'Desktop',
  mcp: 'MCP'
}

export const TYPE_BADGE = {
  js_function: 'js',
  http_webhook: 'webhook',
  desktop: 'desktop',
  mcp: 'mcp'
}

export const PARAM_TYPES = ['string', 'number', 'boolean', 'array', 'object']

export const CODE_PLACEHOLDERS = {
  js_function: `// args contains the declared parameters\nconst result = args.x + args.y\nreturn result`,
  desktop: `// Runs in the Electron main process\nconst { shell } = require('electron')\nshell.openExternal(args.url)`
}
