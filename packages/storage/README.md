# @vox-ai-app/storage

Local persistence for Vox: conversations, messages, tasks, settings, tool registry, MCP servers, schedules, secrets, patterns, and vector embeddings. Built on SQLite via `better-sqlite3` with WAL mode and automatic migrations.

## Install

```sh
npm install @vox-ai-app/storage
```

## Exports

| Export                             | Contents                        |
| ---------------------------------- | ------------------------------- |
| `@vox-ai-app/storage`              | All exports                     |
| `@vox-ai-app/storage/db`           | Database lifecycle (open/close) |
| `@vox-ai-app/storage/messages`     | Conversations and messages      |
| `@vox-ai-app/storage/tasks`        | Task and task activity storage  |
| `@vox-ai-app/storage/tools`        | Custom tool definitions         |
| `@vox-ai-app/storage/settings`     | Key-value settings persistence  |
| `@vox-ai-app/storage/mcp-servers`  | MCP server configurations       |
| `@vox-ai-app/storage/schedules`    | Scheduled job persistence       |
| `@vox-ai-app/storage/tool-secrets` | Encrypted tool secret storage   |
| `@vox-ai-app/storage/patterns`     | Conversation pattern storage    |
| `@vox-ai-app/storage/vectors`      | Vector embedding storage        |

## Database

```js
import { openDb, closeDb } from '@vox-ai-app/storage/db'

const db = openDb('/path/to/storage.db')
closeDb('/path/to/storage.db')
```

The database uses WAL journal mode and foreign keys. Schema is managed via migrations in `src/migrations/`.

## Messages

```js
import {
  ensureConversation,
  appendMessage,
  getMessages,
  getMessagesBeforeId,
  clearMessages,
  saveSummaryCheckpoint,
  loadSummaryCheckpoint
} from '@vox-ai-app/storage/messages'

ensureConversation(db, 'main')
appendMessage(db, 'user', 'Hello', 'main')
appendMessage(db, 'assistant', 'Hi there!', 'main')

const messages = getMessages(db, 'main', 50)
const older = getMessagesBeforeId(db, messages[0].id, 'main', 20)

saveSummaryCheckpoint(db, 'summary text', 42, 'main')
const { summary, checkpointId } = loadSummaryCheckpoint(db, 'main')

clearMessages(db, 'main')
```

## Tasks

```js
import {
  upsertTask,
  getTask,
  loadTasks,
  appendTaskActivity,
  loadTaskActivity
} from '@vox-ai-app/storage/tasks'

upsertTask(db, {
  taskId: 'abc-123',
  instructions: 'Summarize the document',
  status: 'running'
})

const task = getTask(db, 'abc-123')
const allTasks = loadTasks(db)

appendTaskActivity(db, {
  id: 'act-1',
  taskId: 'abc-123',
  type: 'tool_call',
  name: 'read_local_file',
  timestamp: new Date().toISOString(),
  data: { path: '~/doc.md' }
})

const activity = loadTaskActivity(db, 'abc-123')
```

## Settings

```js
import { getSetting, setSetting, getSettingJson, getAllSettings, deleteSetting } from '@vox-ai-app/storage/settings'

setSetting(db, 'theme', 'dark')
const theme = getSetting(db, 'theme')      // raw string
const json  = getSettingJson(db, 'prefs', {}) // parsed JSON with fallback
const all   = getAllSettings(db)           // { key: rawString, ... }
deleteSetting(db, 'theme')
```

## MCP Servers

```js
import {
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServers
} from '@vox-ai-app/storage/mcp-servers'

const srv = createMcpServer(db, {
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx -y @modelcontextprotocol/server-filesystem /home',
  isEnabled: true
})

const all = listMcpServers(db)                    // all servers
const enabled = listMcpServers(db, true)           // enabled only
updateMcpServer(db, srv.id, { isEnabled: false })
deleteMcpServer(db, srv.id)
```

## Vectors

Cosine-similarity vector store backed by SQLite. Intended for small local knowledge bases (< ~50 k vectors).

```js
import { vectorUpsert, vectorSearch } from '@vox-ai-app/storage/vectors'

// Store an embedding (Float32Array or number[])
vectorUpsert(db, 'knowledge', 'doc-1', embeddingValues, { path: '/docs/readme.md' })

// Cosine-similarity search with optional BM25 reranking
const results = vectorSearch(db, 'knowledge', queryEmbedding, 'search text', 10)
// [{ id, score, metadata }]
```

## License

MIT
