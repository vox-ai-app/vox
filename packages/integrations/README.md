# @vox-ai-app/integrations

System integrations for Vox: email, screen control, and messaging. Each integration exposes a **platform-agnostic API** backed by OS-specific implementations in subdirectories (e.g. `mac/`). Tool definitions are OS-independent and work unchanged across platforms.

The macOS implementations ship today. Adding Windows or Linux support means providing a sibling implementation directory and re-exporting it from the existing dispatch layer — no interface changes required.

## Install

```sh
npm install @vox-ai-app/integrations
```

Peer dependency: `electron >= 28`

## Architecture

Each integration follows this structure:

```
src/
  mail/
    index.js          ← platform-agnostic dispatch + input normalisation
    def.js            ← OS-independent LLM tool definitions
    send/
      index.js        ← re-exports from ./mac/
      mac/            ← macOS implementation (AppleScript/JXA)
    read/
      index.js
      mac/
    manage/
      index.js
      mac/
    shared/
      index.js
      mac/
  screen/
    index.js
    def.js
    capture/
      index.js
      mac/
    control/
      index.js
      mac/
    queue.js          ← platform-agnostic session serialiser
  imessage/
    index.js
    def.js
    mac/              ← reads chat.db, AppleScript reply, gateway service
```

## Exports

| Export                                    | Contents                                   |
| ----------------------------------------- | ------------------------------------------ |
| `@vox-ai-app/integrations`                | All exports                                |
| `@vox-ai-app/integrations/defs/mail`      | Mail tool definitions (OS-independent)     |
| `@vox-ai-app/integrations/defs/screen`    | Screen tool definitions (OS-independent)   |
| `@vox-ai-app/integrations/defs/imessage`  | iMessage tool definitions (OS-independent) |
| `@vox-ai-app/integrations/mail`           | Mail functions                             |
| `@vox-ai-app/integrations/screen`         | Screen capture + control                   |
| `@vox-ai-app/integrations/screen/capture` | Capture only                               |
| `@vox-ai-app/integrations/screen/control` | Control only                               |
| `@vox-ai-app/integrations/screen/queue`   | Session acquire/release                    |
| `@vox-ai-app/integrations/imessage`       | Messaging data, reply, gateway service     |

## Mail

### Usage

```js
import {
  sendEmail,
  readEmails,
  getEmailBody,
  searchContacts,
  replyToEmail,
  forwardEmail,
  markEmailRead,
  flagEmail,
  deleteEmail,
  moveEmail,
  createDraft,
  saveAttachment
} from '@vox-ai-app/integrations/mail'

const { messages } = await readEmails({ folder: 'INBOX', limit: 20, unreadOnly: true })
await sendEmail({ to: 'user@example.com', subject: 'Hi', body: 'Hello.' })
await replyToEmail({ messageId: messages[0].id, body: 'Thanks!' })
```

### Tool definitions

```js
import { MAIL_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/mail'
```

### Current implementation: macOS (Apple Mail via AppleScript)

Requires **Automation permission** for Mail.app — System Settings → Privacy & Security → Automation.

## Screen

### Usage

```js
import {
  captureFullScreen,
  captureRegion,
  waitForScreenPermission,
  clickAt,
  moveMouse,
  typeText,
  keyPress,
  scroll,
  drag,
  getMousePosition,
  getUiElements,
  clipboardRead,
  clipboardWrite,
  focusApp,
  launchApp,
  listApps
} from '@vox-ai-app/integrations/screen'
import { acquireScreen, releaseScreen, getScreenSession } from '@vox-ai-app/integrations/screen/queue'

// Serialise screen access across concurrent agent tasks
const session = await acquireScreen()
try {
  const img = await captureFullScreen()
  await clickAt({ x: 100, y: 200 })
  await typeText({ text: 'Hello' })
} finally {
  await releaseScreen(session)
}
```

### Tool definitions

```js
import { SCREEN_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/screen'
```

### Current implementation: macOS (Accessibility API + screencapture)

Requires **Accessibility permission** — System Settings → Privacy & Security → Accessibility.

## Messaging (iMessage)

### Tool use — read conversations and send messages

```js
import {
  canReadDb,
  listConversations,
  listContacts,
  queryNewMessages,
  sendReply
} from '@vox-ai-app/integrations/imessage'

const conversations = await listConversations()
const contacts = await listContacts()
await sendReply('+15551234567', 'Hello from Vox!')
```

### Gateway service — AI replies to incoming messages

```js
import { createIMessageService } from '@vox-ai-app/integrations/imessage'

const svc = createIMessageService({
  logger,
  onTranscript: (text, handle) => { /* emit to UI */ },
  onOpenSettings: () => shell.openExternal('x-apple.systempreferences:...'),
  onMessage: async (text, handle) => {
    // return the reply string, or null to skip
    return await askAI(text)
  }
})

svc.start('my-passphrase')
// anyone who texts "my-passphrase\n<question>" gets an AI reply
```

### Tool definitions

```js
import { IMESSAGE_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/imessage'
```

### Current implementation: macOS (chat.db + Messages AppleScript)

Requires **Full Disk Access** — System Settings → Privacy & Security → Full Disk Access.

## Contributing

To add a Windows or Linux implementation for any integration:

1. Create a sibling directory alongside `mac/` (e.g. `windows/` or `linux/`)
2. Implement the same exported function signatures
3. Update the dispatch `index.js` to re-export from the correct directory based on `process.platform`

The tool definitions (`def.js`) and the platform-agnostic input normalisation in each top-level `index.js` require no changes.

## License

MIT
