import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const CHAT_EVENT_CHANNEL = 'chat:event'
const CHAT_STATUS_CHANNEL = 'chat:status'

const subscribeToRendererEvent = (channel, listener) => {
  if (typeof listener !== 'function') return () => {}
  const wrappedListener = (_event, payload) => listener(payload)
  electronAPI.ipcRenderer.on(channel, wrappedListener)
  return () => electronAPI.ipcRenderer.removeListener(channel, wrappedListener)
}

const invoke = async (channel, ...args) => {
  const result = await electronAPI.ipcRenderer.invoke(channel, ...args)
  if (
    result === null ||
    result === undefined ||
    typeof result !== 'object' ||
    !('success' in result)
  ) {
    return result
  }
  if (result.success) return result.data
  const err = new Error(result.error?.message || `IPC ${channel} failed`)
  err.code = result.error?.code || 'IPC_ERROR'
  throw err
}

const api = {
  chat: {
    connect: () => invoke('chat:connect'),
    ensureConnected: () => invoke('chat:ensure-connected'),
    disconnect: () => invoke('chat:disconnect'),
    getStatus: () => invoke('chat:get-status'),
    sendMessage: (content) => invoke('chat:send-message', { content }),
    setMode: (mode) => invoke('chat:set-mode', { mode }),
    loadOlder: (offsetId) => invoke('chat:load-older', { offsetId }),
    abort: () => invoke('chat:abort'),
    getMessages: () => invoke('chat:get-messages'),
    getMessageCacheStatus: () => invoke('chat:get-message-cache-status'),
    onStatus: (listener) => subscribeToRendererEvent(CHAT_STATUS_CHANNEL, listener),
    onEvent: (listener) => subscribeToRendererEvent(CHAT_EVENT_CHANNEL, listener)
  },

  tasks: {
    list: (params) => invoke('task:list', params || {}),
    get: (taskId) => invoke('task:get', { taskId }),
    abort: (taskId) => invoke('task:abort', { taskId }),
    resume: (taskId) => invoke('task:resume', { taskId }),
    getCachedTasks: () => invoke('task:get-cached-tasks'),
    getCachedActivity: () => invoke('task:get-cached-activity'),
    getCacheStatus: () => invoke('task:get-cache-status'),
    loadAndCache: (params) => invoke('task:load-and-cache', params),
    refreshCache: () => invoke('task:refresh-cache')
  },

  models: {
    list: () => invoke('models:list'),
    isReady: () => invoke('models:is-ready'),
    getActive: () => invoke('models:get-active'),
    setActive: (path) => invoke('models:set-active', { path }),
    pull: (hfRepo, hfFile) => invoke('models:pull', { hfRepo, hfFile }),
    cancelDownload: (path) => invoke('models:cancel-download', { path }),
    delete: (path) => invoke('models:delete', { path }),
    pickFile: () => invoke('models:pick-file'),
    reload: () => invoke('models:reload'),
    getRecommended: () => invoke('models:get-recommended'),
    onReady: (listener) => subscribeToRendererEvent('models:ready', listener),
    onNoModel: (listener) => subscribeToRendererEvent('models:no-model', listener),
    onError: (listener) => subscribeToRendererEvent('models:load-error', listener),
    onProgress: (listener) => subscribeToRendererEvent('models:progress', listener),
    onSttStatus: (listener) => subscribeToRendererEvent('models:stt-status', listener),
    onSttProgress: (listener) => subscribeToRendererEvent('models:stt-progress', listener),
    onLoadProgress: (listener) => subscribeToRendererEvent('models:load-progress', listener),
    onRestarting: (listener) => subscribeToRendererEvent('models:restarting', listener),
    getDownloads: () => invoke('models:get-downloads'),
    onEngineStatus: (listener) => subscribeToRendererEvent('engine:status', listener),
    onEngineProgress: (listener) => subscribeToRendererEvent('engine:progress', listener),
    onEmbedStatus: (listener) => subscribeToRendererEvent('models:embed-status', listener),
    onEmbedProgress: (listener) => subscribeToRendererEvent('models:embed-progress', listener),
    getContextSize: () => invoke('models:get-context-size')
  },

  indexing: {
    getFolders: () => invoke('indexing:get-folders'),
    addFolder: (folderPath) => invoke('indexing:add-folder', { folderPath }),
    removeFolder: (folderPath) => invoke('indexing:remove-folder', { folderPath }),
    rebuild: () => invoke('indexing:rebuild'),
    resetState: () => invoke('indexing:reset-state'),
    getStatus: () => invoke('indexing:get-status'),
    pickFolder: () => invoke('indexing:pick-folder'),
    getIndexedChildren: (folderPath, basePath) =>
      invoke('indexing:get-indexed-children', { folderPath, basePath }),
    onStatusChange: (listener) => subscribeToRendererEvent('indexing:status-change', listener)
  },

  voice: {
    sendAudio: (buffer) => {
      electronAPI.ipcRenderer.send('voice:send-audio', buffer)
      return Promise.resolve()
    },
    sessionStart: () => invoke('voice:session-start'),
    sessionEnd: () => invoke('voice:session-end'),
    setIgnoreMouseEvents: (ignore) => electronAPI.ipcRenderer.send('voice:mouse-ignore', ignore),
    onActivate: (listener) => subscribeToRendererEvent('voice:activate', listener)
  },

  store: {
    get: (key) => invoke('store:get', { key }).then((r) => r.value),
    set: (key, value) => invoke('store:set', { key, value }),
    delete: (key) => invoke('store:delete', { key })
  },

  power: {
    getKeepAwake: () => invoke('power:get-keep-awake').then((r) => r.active),
    setKeepAwake: (enabled) => invoke('power:set-keep-awake', { enabled })
  },

  overlay: {
    hide: () => invoke('overlay:hide'),
    captureRegion: () => invoke('overlay:capture-region'),
    setIgnoreMouseEvents: (ignore) => electronAPI.ipcRenderer.send('overlay:mouse-ignore', ignore)
  },

  imessage: {
    getStatus: () => invoke('imessage:get-status'),
    start: (passphrase) => invoke('imessage:start', { passphrase }),
    stop: () => invoke('imessage:stop'),
    listConversations: () => invoke('imessage:list-conversations'),
    listContacts: () => invoke('imessage:list-contacts')
  },

  setup: {
    getPhase: () => invoke('setup:get-phase'),
    onPhase: (listener) => subscribeToRendererEvent('setup:phase', listener)
  },

  updater: {
    onAvailable: (listener) => subscribeToRendererEvent('update:available', listener),
    onDownloaded: (listener) => subscribeToRendererEvent('update:downloaded', listener),
    install: () => invoke('update:install')
  },

  channels: {
    list: () => invoke('channels:list'),
    init: (channelId, config) => invoke('channels:init', { channelId, config }),
    disconnect: (channelId) => invoke('channels:disconnect', { channelId }),
    getActivity: (limit) => invoke('channels:get-activity', { limit }),
    getThread: (channel, peerId) => invoke('channels:get-thread', { channel, peerId }),
    onStatus: (listener) => subscribeToRendererEvent('channels:status', listener),
    onQR: (listener) => subscribeToRendererEvent('channels:qr', listener),
    onActivity: (listener) => subscribeToRendererEvent('channels:activity', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
