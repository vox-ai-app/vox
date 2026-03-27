# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
