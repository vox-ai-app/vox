# Vox

<p align="center">
  <a href="https://github.com/vox-ai-app/vox/releases/latest"><img src="https://img.shields.io/github/v/release/vox-ai-app/vox?display_name=tag&label=release&style=flat-square" alt="Latest release" /></a>
  <a href="https://www.vox-ai.chat/download/mac"><img src="https://img.shields.io/badge/download-macOS-111827?logo=apple&logoColor=white&style=flat-square" alt="Download Vox for macOS" /></a>
  <a href="https://www.vox-ai.chat/blog"><img src="https://img.shields.io/badge/updates-blog-355070?style=flat-square" alt="Vox blog" /></a>
  <a href="https://www.vox-ai.chat/privacy"><img src="https://img.shields.io/badge/privacy-policy-0F766E?style=flat-square" alt="Privacy policy" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0F766E?style=flat-square" alt="MIT license" /></a>
  <a href="https://www.producthunt.com/products/vox-3"><img src="https://img.shields.io/badge/Product%20Hunt-Vox-DA552F?logo=producthunt&logoColor=white&style=flat-square" alt="Product Hunt" /></a>
</p>

The first local AI that actually does things on your Mac — control your screen, manage files, send emails, reply to iMessages, all on your machine with no cloud and no subscription.

Most AI assistants give you a chat box. Vox gives you an agent. You talk to it, it acts: reads your emails, drafts replies, opens apps, edits files, searches your documents, and even texts people back for you. The model runs entirely on your hardware via llama.cpp — nothing leaves your device. Not the smartest AI. But the only one that's truly yours.

> **Mac-first, not Mac-only.** The core (MCP, tools, voice, indexing, UI) is platform-agnostic — macOS is just where the integrations exist today. Windows and Linux are the #1 contributor priority.

<p align="center">
  <img src="vids/vox-demo.gif" alt="Vox app demo" width="720" />
</p>

---

## What it does

Say "summarize my unread emails and draft replies to anything urgent." Vox reads your Mail, identifies urgent threads, writes draft replies, and asks you to confirm before sending. No copy-pasting, no switching apps.

<p align="center">
  <img src="screens/email-reply-overlay.webp" alt="Vox replying to emails in the overlay" width="720" />
</p>

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
- **Scheduled tasks** — set up recurring agent runs with cron expressions (e.g. "summarize my email every morning at 9am")
- **MCP tools** — connect any [MCP server](https://modelcontextprotocol.io) to extend capabilities
- **Custom tools** — build your own tools and register them in the app
- **Chat channels** — connect WhatsApp, Telegram, Discord, or Slack so the agent can respond across platforms
- **Skills** — load SKILL.md files to give the agent specialized domain knowledge

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

### Beta features

These features are functional but still being refined. Expect rough edges.

| Feature               | Status | What it does                                                                                                                                                 |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chat channels**     | Beta   | Connect WhatsApp, Telegram, Discord, or Slack — Vox responds to messages across platforms using your local model. WhatsApp uses QR-code pairing via Baileys. |
| **Scheduled tasks**   | Beta   | Tell Vox to do something on a schedule ("summarize my email every morning at 9am"). Cron-based, timezone-aware, persists across restarts.                    |
| **Skills**            | Beta   | Drop SKILL.md files into your workspace to give Vox specialized domain knowledge — coding standards, writing style, project context.                         |
| **Background agents** | Beta   | Queue multi-step tasks that run independently. Vox works on them while you keep chatting.                                                                    |
| **Custom tools**      | Beta   | Register your own tools in the app. Vox discovers them automatically via `find_tools`.                                                                       |

Beta features may change behavior between releases. Report issues on [GitHub](https://github.com/vox-ai-app/vox/issues).

Background agents stream their steps into the activity timeline so you can inspect what the model did, what tools it used, and where it finished.

<p align="center">
  <img src="screens/activity-timeline.webp" alt="Activity timeline showing agent steps" width="640" />
</p>

---

## Getting started

**Download and install Vox** from the [latest release](https://github.com/vox-ai-app/vox/releases/latest).

The installer downloads llama-server (llama.cpp) and the default Qwen3-4B model automatically. Open Vox when it's done. You can switch local models later in Settings.

<p align="center">
  <img src="screens/settings-models.webp" alt="Settings page with model selection" width="640" />
</p>

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

| Platform    | Status          | Notes                                                                                                               |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **macOS**   | Stable          | Full feature set — voice, iMessage, screen control, email, overlay. Tested on Apple Silicon (M1–M4) and Intel Macs. |
| **Windows** | Planned         | Core architecture is ready. Needs platform integrations. [Help wanted.](https://github.com/vox-ai-app/vox/issues)   |
| **Linux**   | Planned         | Same path as Windows. [Help wanted.](https://github.com/vox-ai-app/vox/issues)                                      |

Most of the codebase is already portable. Today, platform-specific work is concentrated in `@vox-ai-app/integrations`, and the current voice stack is still tuned for the macOS app build. Adding Windows or Linux mainly means implementing the platform adapters alongside the existing `mac/` directories and validating the voice/runtime packaging on those targets.

---

## System architecture

Vox is a layered Electron app. The renderer surfaces stay thin, the preload script exposes a narrow IPC contract, and the main process owns orchestration, tool execution, model lifecycle, storage, and OS-facing automation.


- `src/renderer` contains the product UI for the main app, overlay, and voice surfaces.
- `src/preload/index.js` is the trust boundary. Renderer code does not reach into Node or Electron directly; it calls a curated `window.api`.
- `src/main` is the composition root: it wires IPC handlers, task execution, channels, iMessage, scheduler, storage, updater, and model bootstrapping.
- Expensive work is intentionally pushed out of the UI thread into `llama-server`, the indexing utility process, and worker threads.

---

## Package structure

The workspace is split into 11 packages. The Electron app in `src/` composes them; most are reusable in other Electron apps, and several are plain Node libraries.

| Package                                             | Platform        | Description                                             |
| --------------------------------------------------- | --------------- | ------------------------------------------------------- |
| [`@vox-ai-app/mcp`](packages/mcp)                   | any             | MCP client (stdio, SSE, HTTP)                           |
| [`@vox-ai-app/tools`](packages/tools)               | any             | Registry, builtins (fs, shell, fetch, grep, glob), docs |
| [`@vox-ai-app/integrations`](packages/integrations) | macOS (for now) | Mail, Screen, iMessage integrations                     |
| [`@vox-ai-app/voice`](packages/voice)               | macOS today     | Wake word detection, shortcut handling, and voice window |
| [`@vox-ai-app/indexing`](packages/indexing)         | any             | File indexing and full-text search                      |
| [`@vox-ai-app/parser`](packages/parser)             | any             | Document parsing (PDF, DOCX, PPTX, etc.)                |
| [`@vox-ai-app/storage`](packages/storage)           | any             | Local message and config persistence (SQLite)           |
| [`@vox-ai-app/ui`](packages/ui)                     | any             | React UI components and design tokens                   |
| [`@vox-ai-app/scheduler`](packages/scheduler)       | any             | Cron-based job scheduling with timezone support         |
| [`@vox-ai-app/skills`](packages/skills)             | any             | SKILL.md loader and LLM prompt formatter                |
| [`@vox-ai-app/channels`](packages/channels)         | any             | Chat adapters (WhatsApp, Telegram, Discord, Slack)      |

The package boundaries are intentionally narrow: packages encapsulate reusable capabilities, while the app layer handles Electron-specific lifecycle, window management, IPC, and product behavior.

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
