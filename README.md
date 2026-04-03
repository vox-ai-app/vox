# Vox

The first local AI that actually does things on your Mac — control your screen, manage files, send emails, reply to iMessages, all on your machine with no cloud and no subscription.

Most AI assistants give you a chat box. Vox gives you an agent. You talk to it, it acts: reads your emails, drafts replies, opens apps, edits files, searches your documents, and even texts people back for you. The model runs entirely on your hardware via llama.cpp — nothing leaves your device. Not the smartest AI. But the only one that's truly yours.

> **Mac-first, not Mac-only.** The core (MCP, tools, voice, indexing, UI) is platform-agnostic — macOS is just where the integrations exist today. Windows and Linux are the #1 contributor priority.

<p align="center">
  <img src="vids/vox-demo.gif" alt="Vox app demo" width="720" />
</p>

---

## What it does

Say "summarize my unread emails and draft replies to anything urgent." Vox reads your Mail, identifies urgent threads, writes draft replies, and asks you to confirm before sending. No copy-pasting, no switching apps.

### Core capabilities

- **Voice activation** — wake word or `⌘⌥V` to start; barge-in lets you interrupt mid-response
- **Overlay** — a floating always-on-top window so you can chat, delegate tasks, and capture screen regions without leaving your current app
- **Screen control** — click, type, scroll, and navigate any app via Accessibility
- **File management** — read, write, edit, search, and organize files
- **Grep & Glob** — regex search across files and find files by pattern
- **Email** — send, read, search, and manage Apple Mail (attachments, drafts, flags)
- **Documents** — create Word, PDF, and PowerPoint files
- **Web** — fetch and summarize web pages
- **Knowledge base** — index folders for semantic search across 50+ file types
- **Background agents** — queue multi-step tasks that run independently while you keep chatting
- **MCP tools** — connect any [MCP server](https://modelcontextprotocol.io) to extend capabilities
- **Custom tools** — build your own tools and register them in the app

### iMessage & phone control

Vox reads your iMessage conversations and can send replies. But the real feature is **passphrase mode**: set a passphrase (e.g. `VOX`), and anyone who texts it followed by a question gets an AI-powered reply sent back automatically.

This means you can text your own Mac from your phone — or from anyone's phone — and get intelligent responses without opening the app. Your AI assistant, accessible via text message.

```
You (from phone):  VOX what meetings do I have tomorrow?
Vox (auto-reply):  You have 2 meetings: Design review at 10am and 1:1 with Sarah at 2pm.
```

### Overlay

The overlay is a floating window that stays on top of everything. Press `⌥Space` to toggle it. Use it to:

- Chat with Vox while working in another app
- See background task progress in the activity tab
- Capture any screen region and ask Vox to analyze it
- Drag and resize to fit your workflow

<p align="center">
  <img src="vids/vox-overlay-agents.gif" alt="Vox overlay with background agents" width="720" />
</p>

You never have to switch windows to interact with Vox.

---

## Getting started

**Download and install Vox** from the [latest release](https://github.com/vox-ai-app/vox/releases/latest).

The installer downloads llama-server (llama.cpp) and the default Qwen3-4B model automatically. Open Vox when it's done.

Press `⌘⌥V` or say the wake word to start.

---

## Building from source

```sh
git clone https://github.com/vox-ai-app/vox.git
cd vox
npm install
npm run dev
```

Requires Node.js 20+ and npm 10+.

---

## Permissions

On macOS, Vox requests these permissions on first use:

| Permission        | Used for                                           |
| ----------------- | -------------------------------------------------- |
| Microphone        | Wake word detection and voice input                |
| Accessibility     | Screen control (clicks, typing, reading UI)        |
| Screen Recording  | Screenshots and region capture                     |
| Full Disk Access  | File indexing, reading Mail and iMessage databases |
| Automation → Mail | Sending emails via Apple Mail                      |

Nothing is sent off-device.

---

## Platform roadmap

| Platform | Status | Notes |
| -------- | ------ | ----- |
| **macOS** | Stable (v1.0.3) | Full feature set — voice, iMessage, screen control, email, overlay |
| **Windows** | Planned | Core architecture is ready. Needs platform integrations. [Help wanted.](https://github.com/vox-ai-app/vox/issues) |
| **Linux** | Planned | Same path as Windows. [Help wanted.](https://github.com/vox-ai-app/vox/issues) |

The only macOS-specific code lives in `@vox-ai-app/integrations`. Everything else — MCP, tools, voice, indexing, parser, storage, UI — is already cross-platform. Adding a new platform means adding implementations alongside the existing `mac/` directory using the factory pattern.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Electron Shell                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ Main    │  │ Overlay  │  │ Renderer (React UI)  │ │
│  │ Process │  │ Window   │  │ Chat · Activity ·    │ │
│  │         │  │          │  │ Knowledge · Settings │ │
│  └────┬────┘  └────┬─────┘  └──────────┬───────────┘ │
│       │            │                    │             │
│  ┌────┴────────────┴────────────────────┴──────────┐ │
│  │              IPC Bridge                          │ │
│  └────┬────────────┬────────────┬──────────────────┘ │
│       │            │            │                     │
│  ┌────┴────┐ ┌─────┴────┐ ┌────┴─────┐              │
│  │ Voice   │ │ AI (LLM) │ │ Storage  │              │
│  │ Pipeline│ │ llama.cpp│ │ SQLite   │              │
│  └─────────┘ └──────────┘ └──────────┘              │
│                                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Packages (npm workspaces)            │ │
│  │  mcp · tools · integrations · voice · indexing   │ │
│  │  parser · storage · ui                           │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
         │
    ┌────┴─────┐
    │ llama-   │
    │ server   │   ← runs locally on localhost:19741
    │ (llama.  │
    │  cpp)    │
    └──────────┘
```

---

## Package structure

The monorepo publishes 8 packages. Most are platform-agnostic and usable in any Electron app or Node.js project:

| Package                                             | Platform        | Description                                             |
| --------------------------------------------------- | --------------- | ------------------------------------------------------- |
| [`@vox-ai-app/mcp`](packages/mcp)                   | any             | MCP client (stdio, SSE, HTTP)                           |
| [`@vox-ai-app/tools`](packages/tools)               | any             | Registry, builtins (fs, shell, fetch, grep, glob), docs |
| [`@vox-ai-app/integrations`](packages/integrations) | macOS (for now) | Mail, Screen, iMessage integrations                     |
| [`@vox-ai-app/voice`](packages/voice)               | any             | Wake word detection and voice window                    |
| [`@vox-ai-app/indexing`](packages/indexing)         | any             | File indexing and full-text search                      |
| [`@vox-ai-app/parser`](packages/parser)             | any             | Document parsing (PDF, DOCX, PPTX, etc.)                |
| [`@vox-ai-app/storage`](packages/storage)           | any             | Local message and config persistence (SQLite)           |
| [`@vox-ai-app/ui`](packages/ui)                     | any             | React UI components and design tokens                   |

`@vox-ai-app/integrations` is the only package with platform-specific code today. Adding Windows or Linux integrations means adding an implementation alongside the existing macOS one without changing the rest of the workspace.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

```sh
npm install      # install all workspace deps
npm run dev      # run the app
npm run lint     # lint all packages + app
npm run format   # format with prettier
npm run test     # run all tests
```

### Good first issues

| Area                           | What to do                                                                                    | Where                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Windows/Linux integrations** | The biggest gap — screen control, file access, email, iMessage equivalents on other platforms | [`packages/integrations/`](packages/integrations)                           |
| **New tools**                  | Calendar, contacts, browser control, terminal, reminders — anything useful day-to-day         | [`packages/integrations/`](packages/integrations)                           |
| **Overlay improvements**       | Mini mode, pinned responses, quick-action buttons, theme support                              | [`src/main/overlay/`](src/main/overlay)                                     |
| **Voice UX**                   | Custom wake words, voice profile training, TTS voice selection                                | [`packages/voice/`](packages/voice)                                         |
| **iMessage enhancements**      | Group chat support, rich replies, reaction handling                                           | [`packages/integrations/src/imessage/`](packages/integrations/src/imessage) |
| **UI and UX**                  | Chat flow, settings, onboarding — this is v1 and has room to improve                          | [`packages/ui/`](packages/ui)                                               |
| **Indexing**                   | More file formats, smarter chunking, faster search, OCR                                       | [`packages/indexing/`](packages/indexing)                                   |
| **Background agents**          | Better task scheduling, dependency chains, retry logic                                        | [`src/main/chat/agent/`](src/main/chat/agent)                               |

### How to add a new tool

1. Create `packages/tools/src/tools/<name>/` with `execute.js`, `def.js`, and `index.js`
2. Export from `packages/tools/src/tools/index.js`
3. That's it — the tool auto-registers and shows up in the model's tool list

### How to add a platform integration

The integrations package uses a factory pattern. Each capability exports a platform factory. Adding a new platform means creating a new directory alongside `mac/`:

```
packages/integrations/src/screen/control/
├── mac/        ← exists today
└── windows/    ← add this
```

The factory selects the right implementation at runtime via `process.platform`.

Open an issue before starting large changes.

---

## License

MIT — see [LICENSE](LICENSE)
