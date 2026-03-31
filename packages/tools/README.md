# @vox-ai-app/tools

Core tool infrastructure for Vox: exec utilities, schema validation, builtins (filesystem, shell, fetch), document builders (Word, PDF, PPTX), LLM tool definitions, and the tool registry.

## Install

```sh
npm install @vox-ai-app/tools
```

Peer dependency: `electron >= 28`

## Exports

| Export                       | Contents           |
| ---------------------------- | ------------------ |
| `@vox-ai-app/tools`          | All core exports   |
| `@vox-ai-app/tools/exec`     | Exec utilities     |
| `@vox-ai-app/tools/schema`   | Validation helpers |
| `@vox-ai-app/tools/network`  | URL safety checks  |
| `@vox-ai-app/tools/registry` | Tool registry      |

## Registry

The registry holds all registered tools (builtins + MCP) and dispatches `run()` calls.

```js
import {
  registerAll,
  registerMcp,
  unregisterMcp,
  closeAllMcp,
  getDeclarations,
  run,
  setOnChange,
  setLogger
} from '@vox-ai-app/tools/registry'

setLogger(logger)
setOnChange(() => {
  /* tool list changed */
})

registerAll(tools)

const { client, tools } = await connectMcpServer(server)
registerMcp(server, client, tools)

const result = await run('read_file', { path: '~/notes.md' }, { signal })
```

## Document Builders

```js
import { createWordDocument, createPdfDocument, createPresentationDocument } from '@vox-ai-app/tools'

await createWordDocument({ path: '~/report.docx', content: '# Title\n\nBody text.' })
await createPdfDocument({ path: '~/report.pdf', content: '# Title\n\nBody text.' })
await createPresentationDocument({ path: '~/slides.pptx', slides: [...] })
```

## Exec Utilities

```js
import { execAsync, execAbortable, esc, writeTempScript, cleanupTemp } from '@vox-ai-app/tools/exec'

const { stdout } = await execAsync('ls -la', { timeout: 10_000 })
const { stdout } = await execAbortable('long-cmd', { timeout: 30_000 }, signal)
```

## License

MIT
