# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] - 2026-03-24

### Added

- `@info-arnav/vox-tools` — `setDocumentParser(fn, extensions)` injectable on `builtins/fs` to enable rich document parsing (PDF, DOCX, PPTX, etc.) inside `read_local_file`.

### Fixed

- `@info-arnav/vox-voice` — Wake word worker now only pauses when `_onDetected()` returns a non-false value, allowing callers to reject activation without stalling detection.

---

## [1.0.1] - 2026-03-24

### Changed

- Bumped all packages to 1.0.1 and configured GitHub Packages registry.

## [1.0.0] - 2026-03-24

### Added

- Initial open-source release.
- `@info-arnav/vox-mcp` — MCP client (stdio, SSE, HTTP).
- `@info-arnav/vox-tools` — tool registry, builtins (fs, shell, fetch), doc builders (Word, PDF, PPTX), and tool definitions.
- `@info-arnav/vox-integrations` — macOS integrations: Mail, Screen, iMessage with factory pattern.
- `@info-arnav/vox-voice` — wake word detection and voice window.
- `@info-arnav/vox-indexing` — file indexing and full-text search utility process.
- `@info-arnav/vox-ui` — shared React UI components and design tokens.
- Electron app wiring all packages together with local Ollama model support.
