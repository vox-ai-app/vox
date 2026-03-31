# Contributing to Vox

Vox is a local-first AI assistant built on Electron. The core packages (MCP, tools, voice, indexing, UI) are platform-agnostic. The macOS-specific parts live in `@vox-ai-app/integrations` — that's where platform parity work happens, and it's one of the best places to contribute.

## Prerequisites

- Node.js 20+
- npm 10+
- Ollama or LMStudio running locally
- macOS to run the app itself (for now — see [Platform support](#platform-support) below)

## Monorepo setup

This is an npm workspaces monorepo. The root `package.json` manages the Electron app. Shared packages live in `packages/`.

```
vox/
├── src/                  Electron app source (main + renderer)
├── packages/
│   ├── mcp/              @vox-ai-app/mcp
│   ├── tools/            @vox-ai-app/tools
│   ├── integrations/     @vox-ai-app/integrations
│   ├── voice/            @vox-ai-app/voice
│   ├── indexing/         @vox-ai-app/indexing
│   ├── parser/           @vox-ai-app/parser
│   └── ui/               @vox-ai-app/ui
└── package.json
```

```sh
git clone https://github.com/vox-ai-app/vox.git
cd vox
npm install       # installs all workspace packages and app deps
npm run dev       # starts the app with hot reload
```

## How packages fit together

```
@vox-ai-app/mcp
  └── @vox-ai-app/tools (registry uses @vox-ai-app/mcp for MCP reconnection)
        └── @vox-ai-app/integrations (mail/screen/iMessage use tool utilities)

@vox-ai-app/voice     (standalone — wake word + voice window)
@vox-ai-app/indexing  (standalone — file indexing runtime)
@vox-ai-app/parser    (standalone — document parsing)
@vox-ai-app/ui        (standalone — React components)
```

When changing a package that others depend on, bump its version and update the dependent's `package.json` too.

## Platform support

The app currently runs on macOS. This is not a permanent constraint — it reflects where the integrations exist today, not a limitation of the architecture.

**What is platform-specific:**

- `@vox-ai-app/integrations` — screen control, Mail, iMessage (all use macOS APIs: osascript, Accessibility, SQLite DBs)
- The Electron app's permission requests (microphone, screen recording, etc.)

**What is already cross-platform:**

- `@vox-ai-app/mcp`, `@vox-ai-app/tools`, `@vox-ai-app/voice`, `@vox-ai-app/indexing`, `@vox-ai-app/parser`, `@vox-ai-app/ui` — all pure Node.js / React, no OS-specific code

**How to add Windows or Linux support:**

The integrations package uses a factory pattern. Each capability (screen, mail, etc.) exports a platform factory. Adding a new platform means creating a new implementation directory alongside the existing `mac/` one:

```
packages/integrations/src/screen/control/
├── mac/        ← exists today
└── windows/    ← add this
```

The factory in `src/screen/index.js` selects the right implementation at runtime based on `process.platform`. No other packages need to change.

## Running a single package in isolation

Each package has its own `src/` and is consumed directly from source in dev, except `@vox-ai-app/ui`, which builds to `dist/` before publish.

```sh
# lint just one package
cd packages/tools
npm run lint
```

## Making changes

1. Fork the repo and create a branch: `git checkout -b feat/my-change`
2. Make your changes
3. Run `npm run lint` from the root — all packages must pass
4. Run `npm run format` to auto-fix style
5. Open a PR against `main`

For changes to a published package, add a changeset:

```sh
npx changeset
```

This creates a file in `.changeset/` describing the bump. The release workflow picks it up automatically.

## PR conventions

- Title must follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- One logical change per PR
- Include a test plan in the PR description (manual steps to verify the change works)
- Link the issue your PR closes: `Closes #123`

## Commit messages

```
feat(integrations): add calendar tool
fix(voice): handle microphone permission denial gracefully
chore(deps): bump better-sqlite3 to 12.6
docs(indexing): update README with build config example
```

## Adding a new integration

1. Create `packages/integrations/src/<name>/` with `index.js` as the barrel
2. Add `def.js` and `tools.js` inside `packages/integrations/src/<name>/`
3. Export the module and its tool definitions from `packages/integrations/src/index.js`
4. Add the new tool list to `packages/integrations/src/tools.js` and any public path to `packages/integrations/package.json`
5. Document it in `packages/integrations/README.md`

## Adding a new builtin tool

1. Create `packages/tools/src/tools/<name>/` with `execute.js`, `def.js`, and `index.js`
2. Export the tool from `packages/tools/src/tools/index.js`
3. Re-export any public helpers from `packages/tools/src/index.js`

## Questions

Open a [GitHub Discussion](https://github.com/vox-ai-app/vox/discussions) for questions. Use issues for confirmed bugs and feature requests.
