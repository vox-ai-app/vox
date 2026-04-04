# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.4] - 2026-04-04

### Fixed

- **WhatsApp reconnect loop** — calling `disconnect()` on a connected WhatsApp session triggered a "conflict: replaced" error loop. The socket's `connection: 'close'` event fired `_scheduleReconnect()` before the abort controller was signalled, causing a zombie socket to race the new one. `disconnect()` now aborts the controller **before** ending the socket, and `_scheduleReconnect` treats a null controller as "stop".
- **Channel adapter reconnect guard** — `_scheduleReconnect` checked `this._abortController?.signal.aborted` which evaluated to `undefined` (falsy) when the controller was already nulled by `super.disconnect()`. Now checks `!this._abortController || this._abortController.signal.aborted`.

### Changed

- `@vox-ai-app/channels` bumped to 1.1.1
- Test suite: 528 tests across 21 test files (up from 490+)

---

## [1.0.3] - 2026-06-14

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
- Bridge streaming — cross-chunk `<think>` tag handling for blocks split across SSE chunks
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
