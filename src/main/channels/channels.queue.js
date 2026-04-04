import { logger } from '../logger'

const MAX_CONCURRENT = 1
const MAX_QUEUE_SIZE = 200

const queue = []
let activeCount = 0
let _handler = null

export function setChannelQueueHandler(fn) {
  _handler = fn
}

export function enqueueChannelMessage(msg) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    logger.warn(
      `[channels.queue] Queue full (${MAX_QUEUE_SIZE}), dropping message from ${msg.channel}/${msg.peerId}`
    )
    return
  }
  queue.push(msg)
  drain()
}

function drain() {
  if (!_handler) return
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const msg = queue.shift()
    activeCount++
    _handler(msg)
      .catch((err) => {
        logger.warn(`[channels.queue] Handler failed for ${msg.channel}/${msg.peerId}:`, err)
      })
      .finally(() => {
        activeCount--
        drain()
      })
  }
}

export function getQueueStats() {
  return { pending: queue.length, active: activeCount }
}
