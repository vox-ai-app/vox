import { createHandler, registerHandler, emitAll } from '../ipc/shared'
import {
  initChannel,
  getConnectedChannels,
  disconnectChannel,
  sendToChannel,
  destroyChannels,
  setChannelStatusHandler,
  setChannelQrHandler
} from '../channels.service'
import { getRecentActivity, getThread } from './channels.sessions'

export function registerChannelsIpc() {
  setChannelStatusHandler((status) => {
    emitAll('channels:status', status)
  })

  setChannelQrHandler((data) => {
    emitAll('channels:qr', data)
  })

  registerHandler(
    'channels:list',
    createHandler(() => getConnectedChannels())
  )

  registerHandler(
    'channels:init',
    createHandler(async (_e, { channelId, config }) => {
      await initChannel(channelId, config || {})
      return { channelId, connected: true }
    })
  )

  registerHandler(
    'channels:disconnect',
    createHandler(async (_e, { channelId }) => {
      await disconnectChannel(channelId)
      return { channelId, connected: false }
    })
  )

  registerHandler(
    'channels:send',
    createHandler(async (_e, { channelId, peerId, text, opts }) => {
      await sendToChannel(channelId, peerId, text, opts || {})
      return { sent: true }
    })
  )

  registerHandler(
    'channels:destroy-all',
    createHandler(async () => {
      await destroyChannels()
      return { destroyed: true }
    })
  )

  registerHandler(
    'channels:get-activity',
    createHandler((_e, { limit } = {}) => getRecentActivity(limit))
  )

  registerHandler(
    'channels:get-thread',
    createHandler((_e, { channel, peerId }) => getThread(channel, peerId))
  )
}
