# Vox

A local-first AI assistant that actually does things — control your screen, manage files, send emails, all on your machine with no cloud and no subscription.

Most local AI setups give you a chat box. Vox gives you an agent. You talk to it, it acts: reads your emails, drafts replies, opens apps, edits files, searches your documents. The model runs entirely on your hardware via Ollama — nothing leaves your device.

This is an early but fully working version. The goal is a general-purpose agentic system you can actually use day-to-day, not a demo. There's a lot of room to grow and we're building it in the open — contributions welcome.

> **Currently macOS only.** The core (MCP, tools, voice, indexing, UI) is platform-agnostic — macOS is just where the integrations exist today. Windows and Linux contributions are very welcome.

---

## What it does

**Example:** Say "summarize my unread emails and draft replies to anything urgent." Vox reads your Mail, identifies urgent threads, writes draft replies, and asks you to confirm before sending anything. No copy-pasting, no switching apps.

- **Voice activation** — wake word or `⌘⌥V` to start
- **Screen control** — click, type, scroll, and navigate any app via Accessibility
- **File management** — read, write, search, and organize files
- **Email** — send, read, and manage Apple Mail
- **iMessage** — read conversations and send replies; passphrase mode lets it reply autonomously
- **Documents** — create Word, PDF, and PowerPoint files
- **Web** — fetch and summarize web pages
- **Knowledge base** — index folders for semantic search across your files
- **MCP tools** — connect any [MCP server](https://modelcontextprotocol.io) to extend capabilities

---

## Getting started

**Download and install Vox** from the [latest release](https://github.com/vox-ai-app/vox/releases/latest).

The installer sets up Ollama and pulls the default model automatically. Open Vox when it's done.

Press `⌘⌥V` or say the wake word to start.

---

## Building from source

```sh
git clone https://github.com/vox-ai-app/vox.git
cd vox/local-app
npm install
npm run dev
```

---

## Permissions

On macOS, Vox requests these permissions on first use:

| Permission        | Used for                                           |
| ----------------- | -------------------------------------------------- |
| Microphone        | Wake word detection and voice input                |
| Accessibility     | Screen control (clicks, typing, reading UI)        |
| Screen Recording  | Screenshots                                        |
| Full Disk Access  | File indexing, reading Mail and iMessage databases |
| Automation → Mail | Sending emails via Apple Mail                      |

Nothing is sent off-device.

---

## Package structure

The monorepo publishes 7 packages. Most are platform-agnostic and usable in any Electron app or Node.js project:

| Package                                                       | Platform        | Description                                |
| ------------------------------------------------------------- | --------------- | ------------------------------------------ |
| [`@vox-ai-app/vox-mcp`](packages/mcp)                         | any             | MCP client (stdio, SSE, HTTP)              |
| [`@vox-ai-app/vox-tools`](packages/tools)                     | any             | Registry, builtins, docs, tool definitions |
| [`@vox-ai-app/vox-integrations`](packages/integrations)       | macOS (for now) | Mail, Screen, iMessage integrations        |
| [`@vox-ai-app/vox-voice`](packages/voice)                     | any             | Wake word detection and voice window       |
| [`@vox-ai-app/vox-indexing`](packages/indexing)               | any             | File indexing and full-text search         |
| [`@vox-ai-app/vox-parser`](packages/parser)                   | any             | Document parsing (PDF, DOCX, PPTX, etc.)  |
| [`@vox-ai-app/vox-ui`](packages/ui)                           | any             | React UI components and design tokens      |

`vox-integrations` is the only package with platform-specific code today. Adding Windows or Linux integrations means adding an implementation alongside the existing macOS one — the factory pattern already supports this without touching anything else.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```sh
npm install      # install all workspace deps
npm run dev      # run the app
npm run lint     # lint all packages + app
npm run format   # format with prettier
```

**Good first areas:**
- **Windows/Linux integrations** — the biggest gap; screen control, file access, and email on other platforms ([`packages/integrations/`](packages/integrations))
- **New tools** — calendar, contacts, browser control, terminal, anything useful day-to-day ([`packages/integrations/`](packages/integrations))
- **UI and UX** — this is v1; chat flow, settings, onboarding all have room to improve ([`packages/ui/`](packages/ui))
- **Indexing** — more file formats, smarter chunking, faster search ([`packages/indexing/`](packages/indexing))

Open an issue before starting large changes.

---

## License

MIT — see [LICENSE](LICENSE)
