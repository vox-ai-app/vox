# @vox-ai-app/mcp

MCP (Model Context Protocol) client for Vox. Connects to stdio, SSE, and HTTP MCP servers with session persistence and automatic reconnection.

## Install

```sh
npm install @vox-ai-app/mcp
```

## Usage

```js
import { connectMcpServer, setLogger } from '@vox-ai-app/mcp'

setLogger(logger)

const { client, tools } = await connectMcpServer({
  id: 'my-server',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/home']
})

// tools is an array of { name, description, inputSchema }
console.log(tools.map((t) => t.name))

// call a tool directly
const result = await client.callTool({ name: 'read_file', arguments: { path: '/home/notes.md' } })
```

## Transport types

| Type  | Config                               |
| ----- | ------------------------------------ |
| stdio | `{ command, args, env }`             |
| SSE   | `{ url }` where url ends with `/sse` |
| HTTP  | `{ url }` (streamable HTTP)          |

## Session management

Sessions for HTTP/SSE transports are persisted to `{VOX_USER_DATA_PATH}/mcp-sessions.json` to allow reconnection across restarts.

```js
import {
  getStoredSessionId,
  persistSessionId,
  clearSessionId,
  terminateStaleSession
} from '@vox-ai-app/mcp'
```

## API

```ts
connectMcpServer(server) // Connect and list tools
makeTransport(server) // Create transport only
parseCommand(str) // Parse "cmd arg1 arg2" into { command, args }
getStoredSessionId(serverId) // Read persisted session
persistSessionId(serverId, id) // Save session
clearSessionId(serverId) // Delete session
terminateStaleSession(server, id) // HTTP DELETE to terminate
setLogger(logger) // Inject logger
```

## Requirements

- `VOX_USER_DATA_PATH` env var set to a writable directory (for session persistence)

## License

MIT
