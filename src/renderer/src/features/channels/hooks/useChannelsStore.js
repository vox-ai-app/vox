import { useState, useEffect, useCallback, useRef } from 'react'

const CHANNEL_DEFS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    description: 'Scan a QR code and Vox replies to your WhatsApp messages.',
    connectedHint: 'Vox is listening. Send any WhatsApp message and it will reply.',
    fields: [],
    steps: [
      { title: 'Tap "Start" below' },
      { title: 'A QR code will appear — scan it with your phone' },
      { title: 'On your phone: WhatsApp → Settings → Linked Devices → Link a Device' }
    ]
  },
  {
    id: 'telegram',
    label: 'Telegram',
    color: '#2AABEE',
    description: 'Create a Telegram bot in under a minute — Vox handles the rest.',
    connectedHint: 'Vox is listening. Message your bot on Telegram and it will reply.',
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'Paste the token from BotFather' }
    ],
    steps: [
      { title: 'Open @BotFather on Telegram', link: 'https://t.me/BotFather' },
      { title: 'Send /newbot and pick a name' },
      { title: 'BotFather will give you a token — copy it' },
      { title: 'Paste it below and tap Connect' }
    ]
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865F2',
    description: 'Add Vox as a Discord bot in any server you manage.',
    connectedHint: 'Vox is online in your server. Mention the bot to start a conversation.',
    fields: [{ key: 'botToken', label: 'Bot Token', placeholder: 'Paste your Discord bot token' }],
    steps: [
      {
        title: 'Open the Discord Developer Portal',
        link: 'https://discord.com/developers/applications'
      },
      { title: 'Create a New Application → go to the Bot tab' },
      { title: 'Click Reset Token and copy it' },
      { title: 'Under OAuth2 → URL Generator, select "bot"' },
      { title: 'Open the generated link to invite Vox to your server' },
      { title: 'Paste the token below and tap Connect' }
    ]
  },
  {
    id: 'slack',
    label: 'Slack',
    color: '#E01E5A',
    description: 'Bring Vox into your Slack workspace — it responds in any channel.',
    connectedHint: 'Vox is in your workspace. Mention the bot in any channel to chat.',
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...' },
      { key: 'appToken', label: 'App-Level Token', placeholder: 'xapp-...' }
    ],
    steps: [
      { title: 'Open the Slack API dashboard', link: 'https://api.slack.com/apps' },
      { title: 'Create New App → From scratch' },
      { title: 'Turn on Socket Mode — copy the App-Level Token (xapp-…)' },
      { title: 'Go to OAuth & Permissions → add chat:write scope' },
      { title: 'Install the app to your workspace' },
      { title: 'Copy the Bot User OAuth Token (xoxb-…)' },
      { title: 'Paste both tokens below and tap Connect' }
    ]
  }
]

const CHANNEL_META = Object.fromEntries(CHANNEL_DEFS.map((d) => [d.id, d]))

function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export { CHANNEL_META, timeAgo }

export function useChannelsStore() {
  const [connectedMap, setConnectedMap] = useState({})
  const [connecting, setConnecting] = useState({})
  const [error, setError] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [activeDrawer, setActiveDrawer] = useState(null)
  const [activity, setActivity] = useState([])
  const [threadTarget, setThreadTarget] = useState(null)
  const [threadData, setThreadData] = useState(null)
  const cleanupRef = useRef(null)
  const qrCleanupRef = useRef(null)
  const activityCleanupRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.channels.list()
      const data = result?.data || result || []
      const map = {}
      for (const ch of data) {
        if (ch.connected) map[ch.id] = true
      }
      setConnectedMap(map)
    } catch {
      /* list may fail before channels are ready */
    }
  }, [])

  const loadActivity = useCallback(async () => {
    try {
      const result = await window.api.channels.getActivity(50)
      const data = result?.data || result || []
      setActivity(data)
    } catch {
      /* activity may not be available yet */
    }
  }, [])

  useEffect(() => {
    cleanupRef.current = window.api.channels.onStatus((status) => {
      const isConnected = status.status === 'connected'
      setConnectedMap((prev) => ({ ...prev, [status.channel]: isConnected }))
      setConnecting((prev) => ({ ...prev, [status.channel]: false }))
      if (isConnected && status.channel === 'whatsapp') {
        setQrCode(null)
      }
    })
    qrCleanupRef.current = window.api.channels.onQR((data) => {
      if (data?.qr) {
        setQrCode(data.qr)
        setConnecting((prev) => ({ ...prev, whatsapp: false }))
      }
    })
    activityCleanupRef.current = window.api.channels.onActivity((entry) => {
      if (entry) setActivity((prev) => [entry, ...prev].slice(0, 100))
    })
    return () => {
      if (typeof cleanupRef.current === 'function') cleanupRef.current()
      if (typeof qrCleanupRef.current === 'function') qrCleanupRef.current()
      if (typeof activityCleanupRef.current === 'function') activityCleanupRef.current()
    }
  }, [refresh, loadActivity])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void refresh()
    void loadActivity()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh, loadActivity])

  const connect = useCallback(async (channelId, config) => {
    setError(null)
    setConnecting((prev) => ({ ...prev, [channelId]: true }))
    try {
      await window.api.channels.init(channelId, config)
    } catch (err) {
      setError({ channelId, message: err?.message || String(err) })
      setConnecting((prev) => ({ ...prev, [channelId]: false }))
    }
  }, [])

  const disconnect = useCallback(async (channelId) => {
    setError(null)
    try {
      await window.api.channels.disconnect(channelId)
      setConnectedMap((prev) => ({ ...prev, [channelId]: false }))
    } catch (err) {
      setError({ channelId, message: err?.message || String(err) })
    }
  }, [])

  const openSetup = useCallback((channelId) => {
    setError(null)
    setQrCode(null)
    setActiveDrawer(channelId)
  }, [])

  const closeSetup = useCallback(() => {
    setActiveDrawer(null)
    setQrCode(null)
  }, [])

  const openThread = useCallback(async (channel, peerId) => {
    setThreadTarget({ channel, peerId })
    try {
      const result = await window.api.channels.getThread(channel, peerId)
      const data = result?.data || result || { senderName: peerId, messages: [] }
      setThreadData(data)
    } catch {
      setThreadData({ senderName: peerId, messages: [] })
    }
  }, [])

  const closeThread = useCallback(() => {
    setThreadTarget(null)
    setThreadData(null)
  }, [])

  return {
    definitions: CHANNEL_DEFS,
    connectedMap,
    connecting,
    error,
    qrCode,
    activeDrawer,
    activity,
    threadTarget,
    threadData,
    connect,
    disconnect,
    openSetup,
    closeSetup,
    openThread,
    closeThread,
    refresh
  }
}
