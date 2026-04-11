# @vox-ai-app/integrations

macOS system integrations for Vox: Apple Mail, Screen control, iMessage, Contacts, Shortcuts, Music, Calendar, and Reminders. Each integration ships with tool implementations and LLM tool definitions.

Requires macOS. Each integration needs specific system permissions granted by the user.

## Install

```sh
npm install @vox-ai-app/integrations
```

Peer dependency: `electron >= 28`

## Exports

| Export                                      | Contents                      |
| ------------------------------------------- | ----------------------------- |
| `@vox-ai-app/integrations`                  | All exports                   |
| `@vox-ai-app/integrations/defs/mail`        | Mail tool definitions         |
| `@vox-ai-app/integrations/defs/screen`      | Screen tool definitions       |
| `@vox-ai-app/integrations/defs/imessage`    | iMessage tool definitions     |
| `@vox-ai-app/integrations/defs/contacts`    | Contacts tool definitions     |
| `@vox-ai-app/integrations/defs/shortcuts`   | Shortcuts tool definitions    |
| `@vox-ai-app/integrations/defs/music`       | Music tool definitions        |
| `@vox-ai-app/integrations/defs/calendar`    | Calendar tool definitions     |
| `@vox-ai-app/integrations/defs/reminders`   | Reminders tool definitions    |
| `@vox-ai-app/integrations/mail`             | Mail functions                |
| `@vox-ai-app/integrations/screen`           | Screen capture + control      |
| `@vox-ai-app/integrations/screen/capture`   | Capture only                  |
| `@vox-ai-app/integrations/screen/control`   | Control only                  |
| `@vox-ai-app/integrations/screen/queue`     | Session acquire/release       |
| `@vox-ai-app/integrations/imessage`         | iMessage data, reply, service |
| `@vox-ai-app/integrations/contacts`         | Contacts search               |
| `@vox-ai-app/integrations/shortcuts`        | List and run Shortcuts        |
| `@vox-ai-app/integrations/music`            | Apple Music control           |
| `@vox-ai-app/integrations/calendar`         | Calendar events CRUD          |
| `@vox-ai-app/integrations/reminders`        | Reminders management          |

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
import { MAIL_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/mail'
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
import { SCREEN_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/screen'
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
import { IMESSAGE_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/imessage'
```

## Contacts

Requires **Contacts permission** (System Settings → Privacy & Security → Contacts).

```js
import { searchContacts } from '@vox-ai-app/integrations/contacts'

const result = await searchContacts({ query: 'John', limit: 25, offset: 0 })
// { count, total, limit, offset, has_more, items: [{ name, emails, phones, org, title, addresses, notes }] }
```

Tool definitions:

```js
import { CONTACTS_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/contacts'
```

## Shortcuts

```js
import { listShortcuts, runShortcut } from '@vox-ai-app/integrations/shortcuts'

const result = await listShortcuts({ limit: 100, offset: 0 })
// { count, total, limit, offset, has_more, items: ['Shortcut Name', ...] }

const output = await runShortcut({ name: 'My Shortcut', input: 'hello' })
```

Tool definitions:

```js
import { SHORTCUTS_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/shortcuts'
```

## Music

Requires **Media & Apple Music permission** (System Settings → Privacy & Security → Media & Apple Music).

```js
import {
  getNowPlaying,
  playMusic,
  pauseMusic,
  nextTrack,
  previousTrack,
  setVolume
} from '@vox-ai-app/integrations/music'

const track = await getNowPlaying()
await playMusic({ query: 'Bohemian Rhapsody' })
await pauseMusic()
await nextTrack()
await previousTrack()
await setVolume({ level: 50 })
```

Tool definitions:

```js
import { MUSIC_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/music'
```

## Calendar

Requires **Calendars permission** (System Settings → Privacy & Security → Calendars).

```js
import { listEvents, createEvent, updateEvent, deleteEvent } from '@vox-ai-app/integrations/calendar'

const result = await listEvents({ from: '2026-04-01', to: '2026-04-30', limit: 25, offset: 0 })
// { count, total, limit, offset, has_more, items: [{ title, start, end, location, notes, calendar }] }

await createEvent({ title: 'Meeting', start: '2026-04-15T10:00', end: '2026-04-15T11:00' })
await updateEvent({ title: 'Meeting', newTitle: 'Updated Meeting' })
await deleteEvent({ title: 'Meeting', date: '2026-04-15' })
```

Tool definitions:

```js
import { CALENDAR_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/calendar'
```

## Reminders

Requires **Reminders permission** (System Settings → Privacy & Security → Reminders).

```js
import { listReminders, createReminder, completeReminder } from '@vox-ai-app/integrations/reminders'

const result = await listReminders({ list: 'Work', limit: 25, offset: 0 })
// { count, total, limit, offset, has_more, items: [{ name, list, dueDate, completed, notes }] }

await createReminder({ name: 'Buy groceries', list: 'Personal', dueDate: '2026-04-15' })
await completeReminder({ name: 'Buy groceries', list: 'Personal' })
```

Tool definitions:

```js
import { REMINDERS_TOOL_DEFINITIONS } from '@vox-ai-app/integrations/defs/reminders'
```

## License

MIT
