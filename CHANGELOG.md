# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.5] - 2026-04-10

### Fixed

- **Fatal crash on dock icon click (Sentry VOX-CHAT-LOCAL-APP-5)** — Clicking the dock icon after closing the main window threw `TypeError: Object has been destroyed`. The `app.activate` handler used optional chaining (`mainWindow?.show()`) which doesn't detect a natively destroyed Electron `BrowserWindow`. Added `isDestroyed()` guard and hide-on-close behavior so the window hides instead of being destroyed on macOS (standard macOS app pattern).
- **Dock icon not showing / wrong size** — Explicitly set the dock icon via `app.dock.setIcon()` using `build/icon.icns` (multi-resolution) with PNG fallback. Ensures the Vox icon appears in the dock in both dev and production.
- **`quitting` variable referenced before declaration** — Moved `let quitting` declaration above the `close` handler that reads it, preventing potential temporal dead zone issues.

---

## [2.1.4] - 2026-04-10

### Fixed

- **Keyboard input bug:** All macOS screen typing tools now set modifier flags explicitly for every key event, preventing sticky shift/ctrl/alt bugs. Unicode fallback now uses keycode 10 (unused) instead of 0 (the 'a' key), so no extra 'a' appears in any app. All keys (a-z, A-Z, 0-9, punctuation, shifted symbols, Unicode) now type correctly in every tested app.

### Changed

- **@vox-ai-app/integrations** 1.0.3 → 1.0.4 — keyboard event bugfix.

---

## [2.1.3] - 2026-04-10

### Fixed

- **Screen typing tool only producing "aaaa"** — `pyTypeText` was using virtual keycode `0` (the `a` key) for every character. `CGEventKeyboardSetUnicodeString` was meant to override the character but many macOS apps read the keycode instead. Now uses the correct macOS virtual keycode per character with shift flag for uppercase and shifted symbols (`!@#$%` etc.), falling back to Unicode string only for characters without a known keycode (emoji, non-Latin scripts).

### Changed

- **`@vox-ai-app/integrations` 1.0.2 → 1.0.3** — fixed `pyTypeText` keycode mapping.

---

## [2.1.2] - 2026-04-06

### Fixed

- **Tool type badge missing on tools page** — DB repos return camelCase (`sourceType`, `isEnabled`) but the renderer reads snake_case (`source_type`, `is_enabled`). Added `toolToWire()` normalizer at the IPC boundary so every tool object reaching the renderer has the correct fields.
- **MCP synced status always showing "Never synced"** — `last_synced_at` column was missing from the `mcp_servers` table. Added migration `003_mcp_last_synced`, wired it through the repo `mapServer` and UPDATE SQL, and added `serverToWire()` normalizer in the MCP IPC layer.
- **Edit tool form fields empty** — `source_code`, `webhook_url`, `tags` were undefined because the returned tool used camelCase. Now correctly mapped through `toolToWire()`.
- **MCP create returning raw input instead of DB record** — `mcp:create` handler now returns the actual DB result from `addMcpServer()` instead of the raw request payload.
- **Tool update spreading raw renderer data into repo** — replaced `{ ...data }` spread with explicit field-by-field mapping from snake_case input to camelCase repo fields.

### Changed

- **`@vox-ai-app/storage` 1.0.3 → 1.0.4** — added `last_synced_at` to `mcp_servers` schema, `mapServer`, and UPDATE query.

---

## [2.1.1] - 2026-04-06

### Fixed

- **llama-server SIGABRT on all non-dev machines** — the downloaded llama-server binary (b8635) depends on ~24 companion shared libraries (libllama, libggml, libggml-metal, etc.) that ship in the release archive. Only the binary was being extracted; the dylibs were discarded. Missing libraries caused immediate SIGABRT on launch. Worked on dev machines only because Homebrew's llama-server is self-contained.
- **Download integrity** — added size verification after streaming download. Incomplete downloads now throw instead of silently installing a corrupt binary.
- **Binary validation** — runs `--version` after install to verify the binary is functional before writing the version stamp. Failed validation auto-purges and gives actionable macOS Privacy & Security guidance.
- **SIGABRT auto-recovery** — tracks rapid consecutive SIGABRT crashes. After 3 instant crashes, purges the entire installation and prompts user to check Gatekeeper settings.

### Changed

- **Extracted `binary.manager.js`** — split binary lifecycle (download, install, validate, purge) out of `server.js` into a dedicated module. Single `purge()` function replaces duplicated cleanup logic. Version-stamped directory (`bin/b8635/`) isolates versions cleanly.
- **Removed Homebrew fallback** — `findBinary()` no longer falls back to `/opt/homebrew/bin/llama-server`. All users get the same managed binary, eliminating "works on my machine" version mismatches.

### Added

- **13 tests for `binary.manager.js`** — covers resolve, purge, purgeAllVersions, ensure (download, install, dylib copy, validation failure, HTTP errors, incomplete downloads).

---

## [2.1.0] - 2026-04-05

### Fixed

- **Agent planning loop** — removed `toolChoice: 'required'` and journal-only tool restriction during planning phase. All tools now available from iteration 1 with `toolChoice: 'auto'`, matching server behavior. Planning is prompt-guided, not structurally enforced. Eliminates the loop where Qwen called `update_journal` repeatedly because it was the only tool available.
- **Consecutive journal cap** — agent runner tracks consecutive `update_journal` calls with no real tool between them. After 3 in a row, injects a correction nudge.
- **`getExitCode(undefined)` crash** — `buildTimeline` could pass `undefined` to `getExitCode` when a tool call had no matched result. Changed strict `=== null` to loose `== null` to handle both.
- **`useActivityCache` loose `||` operators** — `data.name || null` and `data.result || null` replaced with explicit type checks so empty strings and `0` values are preserved.
- **Activity timeline type safety** — replaced all `||`/`??` fallback chains with a single `normalizeEvent()` function that uses explicit `typeof` checks to guarantee shape once at the boundary.
- **Journal activity deduplication** — consecutive journal entries with identical plan text collapse with `×N` badge instead of rendering separately.

### Changed

- **Rich journal rendering** — journal activity events now carry full journal data (`understanding`, `currentPlan`, `completed[]`, `blockers[]`, `discoveries[]`, `done`, `doneReason`). New `JournalDetails` component renders structured sections with icons instead of raw key-value dump.
- **Unified activity timeline** — removed separate `kind: 'action' | 'journal'` discriminator. All timeline entries render through `ActionItem`. Journal entries show as "Plan updated" or "Task complete" with expandable detail.
- **Removed dead code** — `tryParseJournalJson`, `JOURNAL_KEYS`, `MAX_PLANNING_ITERATIONS`, `planningIterations` counter removed from agent runner.

---

## [2.0.0] - 2026-04-05

### Fixed

- **VAD session release crash** — `destroyVad()` threw unhandled rejection when ONNX runtime returned "invalid session id" during cleanup. Root cause: the JS-side session object held a stale WASM session ID that the runtime no longer recognized. `session.release()` is now wrapped in try-catch, and session reference is nulled before awaiting release to prevent double-release races.
- **Unhandled promise rejection in STT teardown** — `destroyStt()` called async `destroyVad()` without await or catch, surfacing as `auto.node.onunhandledrejection` in Sentry. Now catches the rejection.
- **Double destroyStt in shutdown** — `forceCleanup()` called `destroyStt()` both via `destroyVoiceOrchestrator()` and directly. Removed the duplicate call.
- **Agent planning text leak** — character-by-character JSON leaked to UI during agent planning phase. Removed `text` from `recordActivity` filter in task queue and from `chat:event` broadcast in bridge.
- **Channel messages bleeding into main chat** — WhatsApp/channel messages appeared in main chat UI because `silent` flag wasn't implemented in bridge. Added silent parameter throughout `handleChatSend`.
- **toolChoice passthrough** — `client.js` now passes `toolChoice` parameter to llama-server instead of hardcoding `'auto'`. Agent planning uses `toolChoice: 'required'` to force tool calls.

### Added

- **Agent planning JSON recovery** — `tryParseJournalJson()` in agent runner recovers when model dumps journal JSON as text instead of a tool call, using brace-depth parsing and `JOURNAL_KEYS` validation.
- **Planning text suppression** — `isPlanning` flag suppresses text emit during agent planning phase.

---

## [1.0.7] - 2026-04-05

### Fixed

- **ONNX WASM path resolution** — `onnxruntime-web` in Node.js tried to fetch WASM binaries from `https://cdn.jsdelivr.net` which Electron's ESM loader rejects (`ERR_UNSUPPORTED_ESM_URL_SCHEME`). Root cause: CJS `require()` and ESM `import()` of `onnxruntime-web` create separate module instances with independent `env` objects — setting `wasmPaths` on the CJS instance had no effect on the ESM instance used by `@huggingface/transformers`. Fix: set `env.backends.onnx.wasm.wasmPaths` on transformers' own env object after import, pointing to local `node_modules/onnxruntime-web/dist/` WASM files.
- **Postinstall shim for onnxruntime-node** — `@huggingface/transformers` bundles a nested `onnxruntime-node` that crashes in Electron (ABI mismatch). `scripts/patch-onnx.js` replaces it with a one-line shim re-exporting `onnxruntime-web`, runs automatically via `postinstall`.
- **Storage package restructure** — moved 9 repository files from flat `packages/storage/src/` into `packages/storage/src/repos/` subdirectory with updated exports map.
- **Stale file cleanup** — removed 11 dead/duplicate files (6 stale `llm.*.js`, 2 root copies, 2 dead chat files, 1 scheduler store).
- **Scheduler store export** — removed dangling `createStore` export from `@vox-ai-app/scheduler` after `store.js` was deleted.
- **Test suite fixes** — fixed `getAllSettings` return type assertion, `checkpointId` type, empty catches, unused variables. Tests: 506 passed, 0 failed, 1 skipped.
- **Lint cleanup** — resolved 8 lint errors across 3 test files.

### Added

- `scripts/patch-onnx.js` — postinstall script that replaces nested `onnxruntime-node` with `onnxruntime-web` shim.

### Changed

- `packages/storage/` — repository files moved to `src/repos/` subdirectory.
- STT and embedding workers set `env.backends.onnx.wasm.wasmPaths` to local filesystem path before calling `pipeline()`.
- `postinstall` script now runs `electron-builder install-app-deps && node scripts/patch-onnx.js`.

---

## [1.0.6] - 2026-04-05

### Fixed

- **ONNX Runtime NAPI crash (the real fix)** — v1.0.5's single-thread mitigation didn't resolve the crash. Root cause: `onnxruntime-node` ships prebuilt NAPI binaries compiled for stock Node.js V8, but Electron 41 uses its own V8 (Chromium 146). When `napi_new_instance` ran in a `worker_thread`, V8's `JSDispatchTable::SetCodeNoWriteBarrier` hit an ABI assertion — `EXC_BREAKPOINT` on ARM64. Switched both the wake word worker and STT worker from native `onnxruntime-node` to `onnxruntime-web` (pure WebAssembly). Zero native bindings, same `InferenceSession`/`Tensor` API, no NAPI crash.
- **STT worker `onnxruntime-node` isolation** — `@huggingface/transformers` auto-imports `onnxruntime-node` in Node environments. Blocked the import via `Module._resolveFilename` hook so transformers falls through to `onnxruntime-web` (WASM) naturally, using `device: 'wasm'` and correct execution providers.

### Added

- **Update button in sidebar** — shows a pink "Update to vX.X.X" button above the profile section when a new version is downloaded and ready to install.

### Changed

- `onnxruntime-web` added as direct dependency (replaces `onnxruntime-node` for inference)
- `electron.vite.config.mjs` — `onnxruntime-web` and `onnxruntime-common` added to externals
- `electron-builder.yml` — `onnxruntime-web` added to `asarUnpack`
- `packages/voice` peer dependency changed from `onnxruntime-node` to `onnxruntime-web`

---

## [1.0.5] - 2026-04-04

### Fixed

- **ONNX Runtime native crash** — two worker_threads (wake word + STT) each spawned onnxruntime with default thread pool settings, creating 10+ native threads on Apple Silicon that raced on shared memory causing `EXC_BAD_ACCESS (SIGSEGV)`. Both workers now use `intraOpNumThreads: 1, interOpNumThreads: 1` — the models are tiny enough that single-threaded inference is faster anyway.
- **llama-server companion libraries** — installer only extracted the binary; companion `.dylib`/`.so`/`.dll` files (e.g. `libmtmd.0.dylib`) were missing, causing SIGABRT on launch. Install now copies all shared libraries alongside the binary.
- **sharp/semver module resolution** — `sharp` depends on `semver` v7 but the root had v6; added `sharp` to externals and `semver` to `asarUnpack`.
- **pvrecorder-node missing** — peer dependency of `@vox-ai-app/voice` wasn't externalized; added to `EXTRA_EXTERNALS` and explicit dependency.
- **destroyScheduler crash** — was sync but called with `.catch()`; made `async`.

### Added

- **Auto-updater** — `electron-updater` checks for updates 15s after launch, auto-downloads, and installs on quit. Preload exposes `updater.install()`, `onAvailable()`, `onDownloaded()`.
- **llama-server install revision** — `INSTALL_REVISION` counter forces re-download when install logic changes, without bumping the llama.cpp version.

### Changed

- `electron-builder.yml` — expanded `asarUnpack` to include `onnxruntime-node`, `onnxruntime-common`, `semver`, `@picovoice/pvrecorder-node`, `sharp`, `@img`, `detect-libc`
- `electron.vite.config.mjs` — `EXTRA_EXTERNALS` now includes `sharp` and `@picovoice/pvrecorder-node`

---

## [1.0.4] - 2026-04-04

### Fixed

- **WhatsApp reconnect loop** — calling `disconnect()` on a connected WhatsApp session triggered a "conflict: replaced" error loop. The socket's `connection: 'close'` event fired `_scheduleReconnect()` before the abort controller was signalled, causing a zombie socket to race the new one. `disconnect()` now aborts the controller **before** ending the socket, and `_scheduleReconnect` treats a null controller as "stop".
- **Channel adapter reconnect guard** — `_scheduleReconnect` checked `this._abortController?.signal.aborted` which evaluated to `undefined` (falsy) when the controller was already nulled by `super.disconnect()`. Now checks `!this._abortController || this._abortController.signal.aborted`.

### Changed

- `@vox-ai-app/channels` bumped to 1.1.1
- Test suite: 528 tests across 21 test files (up from 490+)

---

## [1.0.3] - 2026-04-03

### Added

- **`@vox-ai-app/scheduler`** — new package: cron-based job scheduler with timezone support, persistent JSON store, and automatic restore on restart (croner ^9.0.0)
- **`@vox-ai-app/skills`** — new package: SKILL.md loader with YAML frontmatter parsing, recursive directory scanning, and LLM prompt formatting
- **`@vox-ai-app/channels`** — new package: chat channel adapters for WhatsApp (Baileys), Telegram (grammY), Discord (discord.js), and Slack (Bolt) with unified EventEmitter interface, automatic reconnection with exponential backoff, message deduplication, and text chunking
- `schedule_task` / `list_schedules` / `remove_schedule` agent tools — the model can create, list, and cancel recurring agentic tasks via cron expressions with timezone support, minimum 5-minute interval enforcement, and one-shot mode
- Skills service integration — loads SKILL.md files from workspace and user directories at startup and injects them into the system prompt
- Channels service integration — manages multi-platform chat channel connections with message routing to the agent
- Scheduler service integration — persists schedules to userData, restores on boot, supports one-shot auto-removal after firing
- `find_tools` / `run_tool` meta-tools — model discovers and executes tools on demand instead of receiving all tools in every request context
- MCP tool routing through `find_tools` / `run_tool`, reducing per-request tool context from ~80 to ~40 definitions
- Text tool-call parser fallback (`llm.text-tool-parser.js`) for models that embed tool calls in prose instead of structured output
- Agent fake-completion guard — prevents `done=true` without any real tool calls having been executed
- Agent repetition safety break — forcibly stops the loop after 2 consecutive same-action warnings
- Barge-in immediate interrupt — hearing detection instantly aborts LLM generation and cancels TTS playback
- Anti-hallucination defense — system prompt and agent prompt include explicit grounding rules; bridge validates responses against tool call evidence
- 43-test tool execution audit covering all 47 tools across 12 categories
- Comprehensive test suite: 528 tests across 21 test files covering all 11 packages

### Fixed

- Agent infinite loop when journal rollback and done flag occurred in the same tool call (rollback early-return prevented done from being set)
- AppleScript newline handling in email compose, reply, forward, and draft (`\n` → `" & return & "`)
- Email send defaults for `cc`, `bcc`, and `attachments` parameters
- Model download crash — `reader.pipeTo()` replaced with `resp.body.pipeTo()` (`ReadableStreamDefaultReader` lacks `pipeTo`)
- Mail date parsing — removed incorrect Core Data epoch offset (Apple Mail `date_received` is already a Unix timestamp)
- Bridge streaming — cross-chunk `leshoot` tag handling for blocks split across SSE chunks
- Unicode literal rendering — replaced `\u2014` and `\u2026` with actual characters across source and UI
- STT worker crash on packaged app — added `asarUnpack` for ONNX voice models
- STT service error emission — fixed missing error event forwarding
- SetupScreen error handling — wrapped model download in try/catch with user feedback
- Channel test mock constructors — moved vi.mock to top level with proper `function` syntax for `new`-able mocks

### Changed

- Tool delivery model replaced: removed `filterToolsForMessage` category-based system in favor of `find_tools` / `run_tool` discovery pattern
- Bridge streaming loop rewritten for robust think-tag extraction and text tool-call fallback
- MCP tools integrated into `find_tools` search results alongside built-in custom tools
- Package count increased from 8 to 11 published npm packages under `@vox-ai-app` org

---

## [1.0.2] - 2026-04-01

### Added

- **`edit_local_file` tool** — targeted string replacement in files without rewriting the entire file. Supports `replace_all` for multi-match edits.
- **`grep_local` tool** — regex search across files with context lines, glob filtering, and configurable result limits.
- **`glob_local` tool** — find files by glob pattern across directories.
- **Argument validation** — the tool registry now validates arguments against each tool's parameter schema before execution (type checks, enums, min/max, minLength/maxLength).
- **Line-range reads** — `read_local_file` supports `startLine`/`endLine` for reading specific line ranges.
- **Background commands** — `run_local_command` supports `background: true` for long-running processes like servers and watch modes.
- **File staleness checks** — writes and edits track mtime from the last read and warn about concurrent modifications.
- **SSRF DNS resolution check** — `fetch_webpage` resolves hostnames and rejects responses where the DNS result points to a private IP address.
- **Redirect detection** — `fetch_webpage` uses manual redirect mode and surfaces redirect targets instead of following them silently.
- **Shell dangerous pattern detection** — commands containing `rm -rf /`, `mkfs`, `dd if=`, `:(){ :|:& };:`, and similar patterns are rejected.
- **Write path restrictions** — writes to system directories (`/etc`, `/System`, `/usr`, `/bin`, etc.) are blocked.
- **Device file blocking** — reads and writes to device files (`/dev/`, `/proc/`, `/sys/`) are rejected.
- **Symlink traversal protection** — `delete_local_path` resolves symlinks via `realpath` before checking path restrictions.
- **Read-only tool classification** — tools declare `readOnly: true` to enable safe parallel execution by the agent.
- **Similar file suggestions** — when a read or write targets a non-existent file, nearby files with similar names are suggested.
- **`@vox-ai-app/storage`** — new package for local message, task, and config persistence via SQLite. First publish.

### Changed

- `@vox-ai-app/tools` `ALL_BUILTIN_TOOLS` now includes `editLocalFileTool`, `grepLocalTool`, and `globLocalTool`.
- `read_local_file` now throws on unsupported formats and missing files instead of returning empty content.
- `run_local_command` streams stdout/stderr and emits progress events during execution.

## [1.0.1] - 2026-03-25

### Added

- `@vox-ai-app/indexing/process` now exposes `setOnStatusChange(fn)` to subscribe to runtime status updates from the indexing utility process.

### Changed

- Indexing runtime status updates are now forwarded from the child process to the host process.
- Status notifications are debounced (~100ms) before emission to reduce high-frequency update noise.

## [1.0.0] - 2026-03-24

### Added

- Initial open-source release under `@vox-ai-app` org.
- `@vox-ai-app/mcp` — MCP client (stdio, SSE, HTTP).
- `@vox-ai-app/tools` — tool registry, builtins (fs, shell, fetch), doc builders (Word, PDF, PPTX), and tool definitions.
- `@vox-ai-app/integrations` — macOS integrations: Mail, Screen, iMessage with factory pattern.
- `@vox-ai-app/voice` — wake word detection and voice window; wake word worker pauses only when `_onDetected()` returns a non-false value.
- `@vox-ai-app/indexing` — file indexing and full-text search utility process.
- `@vox-ai-app/parser` — document parsing (PDF, DOCX, PPTX, etc.) used by `read_local_file`.
- `@vox-ai-app/ui` — shared React UI components and design tokens.
- Electron app wiring all packages together with local Ollama model support.
