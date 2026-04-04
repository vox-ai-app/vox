import { Cron } from 'croner'

const jobs = new Map()
const CRON_EVAL_CACHE_MAX = 512
const cronEvalCache = new Map()
const MIN_REFIRE_GAP_MS = 2000

function resolveTimezone(tz) {
  if (tz && typeof tz === 'string' && tz.trim()) return tz.trim()
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function getCachedCron(expr, timezone) {
  const key = `${timezone}\0${expr}`
  const cached = cronEvalCache.get(key)
  if (cached) return cached
  if (cronEvalCache.size >= CRON_EVAL_CACHE_MAX) {
    const oldest = cronEvalCache.keys().next().value
    cronEvalCache.delete(oldest)
  }
  const cron = new Cron(expr, { timezone, catch: false })
  cronEvalCache.set(key, cron)
  return cron
}

export function scheduleJob(id, config, handler) {
  if (jobs.has(id)) cancelJob(id)

  const { expr, tz, runImmediately, timeoutMs } = config
  const timezone = resolveTimezone(tz)
  let lastFireMs = 0

  const cron = new Cron(
    expr,
    {
      timezone,
      catch: (err) => {
        if (config.onError) config.onError(err)
      }
    },
    () => {
      const now = Date.now()
      if (now - lastFireMs < MIN_REFIRE_GAP_MS) return
      lastFireMs = now

      const context = { scheduledAt: now, expr, timezone }
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), timeoutMs)
        Promise.resolve(handler(id, { ...context, signal: ac.signal })).finally(() =>
          clearTimeout(timer)
        )
      } else {
        handler(id, context)
      }
    }
  )

  const job = {
    id,
    cron,
    expr,
    timezone,
    createdAt: Date.now(),
    handler,
    timeoutMs: timeoutMs || null,
    lastFireMs: 0,
    state: { runCount: 0, lastError: null, lastRunAtMs: null }
  }

  jobs.set(id, job)

  if (runImmediately) {
    handler(id, { scheduledAt: Date.now(), expr, timezone, immediate: true })
  }

  return job
}

export function cancelJob(id) {
  const job = jobs.get(id)
  if (!job) return false
  job.cron.stop()
  jobs.delete(id)
  return true
}

export function cancelAllJobs() {
  for (const [, job] of jobs) {
    job.cron.stop()
  }
  jobs.clear()
}

export function getJob(id) {
  const job = jobs.get(id)
  if (!job) return null
  return {
    id: job.id,
    expr: job.expr,
    timezone: job.timezone,
    createdAt: job.createdAt,
    nextRun: job.cron.nextRun()?.getTime() || null,
    running: job.cron.isBusy(),
    state: { ...job.state }
  }
}

export function listJobs() {
  return Array.from(jobs.values()).map((job) => ({
    id: job.id,
    expr: job.expr,
    timezone: job.timezone,
    createdAt: job.createdAt,
    nextRun: job.cron.nextRun()?.getTime() || null,
    running: job.cron.isBusy(),
    state: { ...job.state }
  }))
}

export function computeNextRun(expr, tz) {
  const timezone = resolveTimezone(tz)
  const cron = getCachedCron(expr, timezone)
  const next = cron.nextRun()
  return next ? next.getTime() : null
}

export function parseAbsoluteTimeMs(input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function scheduleAt(id, config, handler) {
  if (jobs.has(id)) cancelJob(id)

  const atMs = typeof config.at === 'number' ? config.at : parseAbsoluteTimeMs(config.at)
  if (!atMs || atMs <= Date.now()) return null

  const delay = atMs - Date.now()
  const timer = setTimeout(() => {
    handler(id, { scheduledAt: atMs, once: true })
    jobs.delete(id)
  }, delay)

  const job = {
    id,
    timer,
    atMs,
    createdAt: Date.now(),
    handler,
    kind: 'at'
  }
  jobs.set(id, job)
  return job
}

export function scheduleEvery(id, config, handler) {
  if (jobs.has(id)) cancelJob(id)

  const { intervalMs, timeoutMs } = config
  if (!intervalMs || intervalMs < 1000) return null

  const interval = setInterval(() => {
    const context = { scheduledAt: Date.now(), intervalMs }
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), timeoutMs)
      Promise.resolve(handler(id, { ...context, signal: ac.signal })).finally(() => clearTimeout(t))
    } else {
      handler(id, context)
    }
  }, intervalMs)

  const job = {
    id,
    interval,
    intervalMs,
    createdAt: Date.now(),
    handler,
    kind: 'every'
  }
  jobs.set(id, job)

  if (config.runImmediately) {
    handler(id, { scheduledAt: Date.now(), intervalMs, immediate: true })
  }

  return job
}
