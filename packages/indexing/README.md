# @vox-ai-app/indexing

Local file indexing, full-text search, and document parsing for Vox. Runs in a separate Electron utility process to keep the main process responsive.

## Install

```sh
npm install @vox-ai-app/indexing
```

Peer dependency: `electron >= 28`

## Requirements

- `VOX_USER_DATA_PATH` — writable directory, database stored as `knowledge-index.db`
- `VOX_APP_PATH` — app path, used to locate the parser worker
- Build config must emit two separate entry points (see Build section)

## Usage

```js
import {
  bootIndexingRuntime,
  shutdownIndexingRuntime,
  addIndexFolder,
  removeIndexFolder,
  searchIndexedContextForTool,
  getIndexingStatus,
  setLogger,
  setSentryCapture
} from '@vox-ai-app/indexing'

setLogger(logger)
setSentryCapture(captureException)

await bootIndexingRuntime()

await addIndexFolder('/Users/me/Documents')

const results = await searchIndexedContextForTool('query text', { limit: 5 })

await shutdownIndexingRuntime()
```

## API

### Runtime lifecycle

```ts
bootIndexingRuntime() // start the indexing utility process
shutdownIndexingRuntime() // graceful shutdown
rebuildIndexing() // wipe and re-index all folders
resetIndexingState() // clear state without reindexing
```

### Folder management

```ts
addIndexFolder(path) // add a folder to the index
removeIndexFolder(path) // remove a folder and its data
getTrackedIndexFolders() // list all tracked folders
pickIndexFolder() // open a native folder picker dialog
```

### Query

```ts
searchIndexedContextForTool(query, opts) // full-text search
listIndexedFilesForTool(path, opts) // list files under a path
readIndexedFileForTool(path) // read a specific indexed file
getIndexedChildren(path) // explorer tree children
getIndexingStatus() // current status + progress
```

### IPC registration

For Electron apps that expose indexing over IPC, import from the `./ipc` sub-export and pass your app's IPC helper factories:

```js
import { registerIndexingIpc } from '@vox-ai-app/indexing/ipc'

registerIndexingIpc({ createHandler, registerHandler })
// Registers: indexing:get-folders, indexing:add-folder, indexing:remove-folder,
//            indexing:rebuild, indexing:get-status, indexing:pick-folder,
//            indexing:get-indexed-children, indexing:reset-state
```

### Process status subscription (advanced)

Push-based status updates are available via the `./process` sub-export:

```js
import { setOnStatusChange } from '@vox-ai-app/indexing/process'

setOnStatusChange((status) => {
  // status shape matches getIndexingStatus()
  // updates are coalesced (~100ms) to avoid noisy bursts
  console.log(status)
})
```

## Supported file types

`.pdf`, `.docx`, `.pptx`, `.xlsx`, `.odt`, `.odp`, `.ods`, `.rtf`, and plain text files.

## Build

The indexing package needs two additional Electron entry points — the utility process and the parser worker. They are resolved at runtime from the built output, so register them in your build config:

```js
// electron.vite.config.js
export default {
  main: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/main/index.js',
          'indexing.process': 'node_modules/@vox-ai-app/indexing/src/process/process.js',
          'indexing.parser.worker': 'node_modules/@vox-ai-app/indexing/src/parser/worker.js'
        }
      }
    }
  }
}
```

At runtime the host resolves the process entry as `out/main/indexing.process.js` (relative to `app.getAppPath()`).

## License

MIT
