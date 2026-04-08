import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('scheduler/cron', () => {
  let scheduleJob, cancelJob, cancelAllJobs, getJob, listJobs, computeNextRun

  beforeEach(async () => {
    vi.resetModules()
    ;({ scheduleJob, cancelJob, cancelAllJobs, getJob, listJobs, computeNextRun } =
      await import('../src/cron.js'))
  })

  afterEach(() => {
    cancelAllJobs()
  })

  it('should schedule a job and return it', () => {
    const handler = vi.fn()
    const job = scheduleJob('j1', { expr: '0 0 * * *' }, handler)
    expect(job.id).toBe('j1')
    expect(job.expr).toBe('0 0 * * *')
  })

  it('should list scheduled jobs', () => {
    const handler = vi.fn()
    scheduleJob('j1', { expr: '0 0 * * *' }, handler)
    scheduleJob('j2', { expr: '*/5 * * * *' }, handler)
    const jobs = listJobs()
    expect(jobs).toHaveLength(2)
    expect(jobs.map((j) => j.id).sort()).toEqual(['j1', 'j2'])
  })

  it('should get a job by id', () => {
    const handler = vi.fn()
    scheduleJob('j1', { expr: '0 12 * * *' }, handler)
    const job = getJob('j1')
    expect(job).not.toBeNull()
    expect(job.id).toBe('j1')
    expect(job.expr).toBe('0 12 * * *')
    expect(job.nextRun).toBeDefined()
  })

  it('should return null for unknown job', () => {
    expect(getJob('nope')).toBeNull()
  })

  it('should cancel a job', () => {
    const handler = vi.fn()
    scheduleJob('j1', { expr: '0 0 * * *' }, handler)
    expect(cancelJob('j1')).toBe(true)
    expect(getJob('j1')).toBeNull()
    expect(listJobs()).toHaveLength(0)
  })

  it('should return false when cancelling unknown job', () => {
    expect(cancelJob('nope')).toBe(false)
  })

  it('should cancel all jobs', () => {
    const handler = vi.fn()
    scheduleJob('j1', { expr: '0 0 * * *' }, handler)
    scheduleJob('j2', { expr: '*/5 * * * *' }, handler)
    cancelAllJobs()
    expect(listJobs()).toHaveLength(0)
  })

  it('should replace existing job with same id', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    scheduleJob('j1', { expr: '0 0 * * *' }, handler1)
    scheduleJob('j1', { expr: '*/10 * * * *' }, handler2)
    expect(listJobs()).toHaveLength(1)
    expect(getJob('j1').expr).toBe('*/10 * * * *')
  })

  it('should fire handler immediately with runImmediately', () => {
    const handler = vi.fn()
    scheduleJob('j1', { expr: '0 0 * * *', runImmediately: true }, handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('j1', expect.objectContaining({ immediate: true }))
  })

  it('should compute next run for a cron expression', () => {
    const next = computeNextRun('0 0 * * *')
    expect(next).toBeGreaterThan(Date.now() - 1000)
  })

  it('should compute next run with timezone', () => {
    const next = computeNextRun('0 12 * * *', 'America/New_York')
    expect(typeof next).toBe('number')
    expect(next).toBeGreaterThan(0)
  })
})
