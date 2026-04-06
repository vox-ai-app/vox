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

// stdio — command string is shell-parsed (env var prefixes supported)
const { client, tools } = await connectMcpServer({
  id: 'filesystem',
  transport: 'stdio',
  command: 'npx -y @modelcontextprotocol/server-filesystem /home'
})

// http
const { client, tools } = await connectMcpServer({
  id: 'my-api',
  transport: 'http',
  url: 'https://my-mcp-server.example.com/mcp',
  auth_header: 'Bearer sk-...'
})

// tools is an array of { name, description, inputSchema }
console.log(tools.map((t) => t.name))

// call a tool directly via the MCP client
const result = await client.callTool({ name: 'read_file', arguments: { path: '/home/notes.md' } })
```

## Server config

The `server` object accepted by `connectMcpServer` and `makeTransport`:

| Field         | Type      | Description                                                              |
| ------------- | --------- | ------------------------------------------------------------------------ |
| `id`          | `string`  | Unique identifier used for session persistence.                          |
| `transport`   | `string`  | `'stdio'`, `'sse'`, or `'http'`.                                         |
| `command`     | `string`  | Shell command string for stdio transport (env var prefixes are allowed). |
| `url`         | `string`  | Server URL for SSE/HTTP transports.                                      |
| `auth_header` | `string`  | Optional value for the `Authorization` request header.                  |

## Transport types

| Type    | Config fields used            | Notes                                          |
| ------- | ----------------------------- | ---------------------------------------------- |
| `stdio` | `command` (+ optional prefix env vars) | Command is shell-parsed; env var prefixes like `KEY=val cmd arg` are supported. |
| `sse`   | `url`, `auth_header`          | Uses SSE long-polling.                         |
| `http`  | `url`, `auth_header`          | Streamable HTTP. Sessions are persisted.       |

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
