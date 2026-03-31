# @vox-ai-app/integrations

macOS system integrations for Vox: Apple Mail, Screen control, and iMessage. Each integration ships with tool implementations and LLM tool definitions.

Requires macOS. Each integration needs specific system permissions granted by the user.

## Install

```sh
npm install @vox-ai-app/integrations
```

Peer dependency: `electron >= 28`

## Exports

| Export                                    | Contents                      |
| ----------------------------------------- | ----------------------------- |
| `@vox-ai-app/integrations`                | All exports                   |
| `@vox-ai-app/integrations/defs`           | All tool definitions          |
| `@vox-ai-app/integrations/mail`           | Mail functions                |
| `@vox-ai-app/integrations/screen`         | Screen capture + control      |
| `@vox-ai-app/integrations/screen/capture` | Capture only                  |
| `@vox-ai-app/integrations/screen/control` | Control only                  |
| `@vox-ai-app/integrations/screen/queue`   | Session acquire/release       |
| `@vox-ai-app/integrations/imessage`       | iMessage data, reply, service |

## Mail

Requires **Automation permission** for Mail (System Settings → Privacy & Security → Automation).

```js
import { sendEmail, readEmails, searchContacts, replyToEmail } from '@vox-ai-app/integrations/mail'

const emails = await readEmails({ account: 'Work', folder: 'INBOX', limit: 20 })
await sendEmail({ to: 'user@example.com', subject: 'Hi', body: 'Hello.' })
await replyToEmail({ messageId: '...', body: 'Thanks!' })
```

Tool definitions:

```js
import { MAIL_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs'
```

## Screen

Requires **Accessibility permission** (System Settings → Privacy & Security → Accessibility).

```js
import {
  captureFullScreen,
  clickAt,
  typeText,
  getUiElements
} from '@vox-ai-app/integrations/screen'
import { acquireScreen, releaseScreen } from '@vox-ai-app/integrations/screen/queue'

const session = await acquireScreen()
try {
  const img = await captureFullScreen()
  await clickAt({ x: 100, y: 200 })
  await typeText({ text: 'Hello' })
} finally {
  await releaseScreen(session)
}
```

Tool definitions:

```js
import { SCREEN_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs'
```

## iMessage

Requires **Full Disk Access** (System Settings → Privacy & Security → Full Disk Access).

### Tool use (read conversations, send messages)

```js
import { listConversations, listContacts, sendReply } from '@vox-ai-app/integrations/imessage'

const conversations = listConversations()
const contacts = listContacts()
await sendReply('+15551234567', 'Hello from Vox!')
```

### Gateway service (AI replies to incoming iMessages)

```js
import { createIMessageService } from '@vox-ai-app/integrations/imessage'

const svc = createIMessageService({
  logger,
  onTranscript: (text, handle) => {
    /* emit to UI */
  },
  onOpenSettings: () => shell.openExternal('x-apple.systempreferences:...'),
  onMessage: async (text, handle) => {
    // call your AI here, return the reply string
    return await askAI(text)
  }
})

svc.start('my-passphrase')
// user sends "my-passphrase\nWhat's the weather?" → AI replies back
```

`onMessage` must return a `Promise<string | null>`. Returning `null` skips the reply.

Tool definitions:

```js
import { IMESSAGE_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs'
```

## License

MIT
