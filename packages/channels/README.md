# @vox-ai-app/channels

> **Beta** — functional and tested but still being refined. Report issues on [GitHub](https://github.com/vox-ai-app/vox/issues).

Chat channel adapters for Vox — connect WhatsApp, Telegram, Discord, and Slack with a unified interface, automatic reconnection, message deduplication, and text chunking.

## Install

```sh
npm install @vox-ai-app/channels
```

## Exports

| Export                          | Contents                                    |
| ------------------------------- | ------------------------------------------- |
| `@vox-ai-app/channels`          | All channel exports                         |
| `@vox-ai-app/channels/adapter`  | Base `ChannelAdapter` class and `chunkText` |
| `@vox-ai-app/channels/whatsapp` | WhatsApp via Baileys                        |
| `@vox-ai-app/channels/telegram` | Telegram via grammY                         |
| `@vox-ai-app/channels/discord`  | Discord via discord.js                      |
| `@vox-ai-app/channels/slack`    | Slack via Bolt                              |

## Usage

```js
import { TelegramChannel } from '@vox-ai-app/channels'

const tg = new TelegramChannel({ botToken: process.env.TELEGRAM_BOT_TOKEN })
tg.on('message', ({ peerId, text }) => {
  console.log(`${peerId}: ${text}`)
})
await tg.connect()
await tg.send('chatId', 'Hello from Vox')
```

## Channels

| Channel  | Adapter class     | Config                                       |
| -------- | ----------------- | -------------------------------------------- |
| WhatsApp | `WhatsAppChannel` | `{ authDir, allowFrom? }`                    |
| Telegram | `TelegramChannel` | `{ botToken, allowedChatIds? }`              |
| Discord  | `DiscordChannel`  | `{ botToken, allowedGuildIds? }`             |
| Slack    | `SlackChannel`    | `{ botToken, appToken, allowedChannelIds? }` |

## Base adapter

All channels extend `ChannelAdapter` which provides:

- **EventEmitter** — `message`, `status`, and `error` events
- **Reconnection** — exponential backoff with configurable `initialMs`, `maxMs`, `factor`, `jitter`, and `maxAttempts`
- **Deduplication** — automatic message dedup with configurable `dedupeMaxSize` and `dedupeTtlMs`
- **Text chunking** — `chunkText(text, maxLen)` splits long messages at newline boundaries while preserving code fences
- **Safe disconnect** — `disconnect()` aborts the reconnect controller before closing the underlying client, preventing zombie socket races

```js
import { ChannelAdapter, chunkText } from '@vox-ai-app/channels/adapter'

const chunks = chunkText(longMessage, 2000)
```

## API

Every channel implements:

```js
await channel.connect()
await channel.send(peerId, text, options?)
await channel.disconnect()
channel.toJSON() // { id, connected }
```

Events:

```js
channel.on('message', ({ channel, peerId, text, timestamp, raw }) => {})
channel.on('status', ({ channel, status }) => {})
channel.on('error', ({ channel, error }) => {})
```

## License

MIT
