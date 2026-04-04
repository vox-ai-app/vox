import { app } from 'electron'
import path from 'node:path'
import {
  scheduleJob,
  cancelJob,
  cancelAllJobs,
  listJobs,
  computeNextRun
} from '@vox-ai-app/scheduler'
import { createStore } from '@vox-ai-app/scheduler/store'
import { logger } from './logger'

let store = null
let _agentHandler = null

function getStore() {
  if (!store) {
    store = createStore(path.join(app.getPath('userData'), 'scheduler'))
  }
  return store
}

export function setSchedulerAgentHandler(handler) {
  _agentHandler = handler
}

function handleScheduledRun(id, meta) {
  logger.info(`[scheduler] Triggering scheduled run: ${id}`)
  const schedule = getStore().get(id)
  if (!schedule) return

  if (_agentHandler) {
    _agentHandler({
      scheduleId: id,
      prompt: schedule.prompt,
      channel: schedule.channel || null,
      meta
    })
  }

  if (schedule.once) {
    logger.info(`[scheduler] One-shot schedule ${id} fired, removing`)
    removeSchedule(id)
  }
}

export function initScheduler() {
  const saved = getStore().list()
  let restored = 0

  for (const schedule of saved) {
    if (!schedule.enabled) continue
    try {
      scheduleJob(schedule.id, { expr: schedule.expr, tz: schedule.tz }, handleScheduledRun)
      restored++
    } catch (err) {
      logger.warn(`[scheduler] Failed to restore schedule ${schedule.id}:`, err)
    }
  }

  logger.info(`[scheduler] Restored ${restored}/${saved.length} schedules`)
}

export function addSchedule(config) {
  const id = config.id || `sched_${Date.now()}`
  const schedule = {
    id,
    expr: config.expr,
    tz: config.tz || null,
    prompt: config.prompt,
    channel: config.channel || null,
    enabled: config.enabled !== false,
    once: config.once === true
  }

  getStore().save(schedule)

  if (schedule.enabled) {
    scheduleJob(id, { expr: schedule.expr, tz: schedule.tz }, handleScheduledRun)
  }

  return schedule
}

export function removeSchedule(id) {
  cancelJob(id)
  getStore().remove(id)
}

export function getSchedules() {
  const saved = getStore().list()
  const running = listJobs()
  const runningMap = new Map(running.map((j) => [j.id, j]))

  return saved.map((s) => ({
    ...s,
    nextRun: runningMap.get(s.id)?.nextRun || computeNextRun(s.expr, s.tz)
  }))
}

export async function destroyScheduler() {
  cancelAllJobs()
}
