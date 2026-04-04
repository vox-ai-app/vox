import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('scheduler/cron', () => {
  let scheduleJob, cancelJob, cancelAllJobs, getJob, listJobs, computeNextRun

  beforeEach(async () => {
    vi.resetModules()
    ;({ scheduleJob, cancelJob, cancelAllJobs, getJob, listJobs, computeNextRun } =
      await import('../packages/scheduler/src/cron.js'))
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

describe('scheduler/store', () => {
  let createStore
  let tmpDir

  beforeEach(async () => {
    vi.resetModules()
    ;({ createStore } = await import('../packages/scheduler/src/store.js'))
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-store-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should save and retrieve a schedule', () => {
    const store = createStore(tmpDir)
    store.save({ id: 's1', expr: '0 0 * * *', prompt: 'hello' })
    const got = store.get('s1')
    expect(got).not.toBeNull()
    expect(got.id).toBe('s1')
    expect(got.prompt).toBe('hello')
    expect(got.createdAt).toBeDefined()
  })

  it('should list all schedules', () => {
    const store = createStore(tmpDir)
    store.save({ id: 's1', expr: '0 0 * * *', prompt: 'a' })
    store.save({ id: 's2', expr: '*/5 * * * *', prompt: 'b' })
    const all = store.list()
    expect(all).toHaveLength(2)
  })

  it('should update existing schedule', () => {
    const store = createStore(tmpDir)
    store.save({ id: 's1', expr: '0 0 * * *', prompt: 'original' })
    store.save({ id: 's1', prompt: 'updated' })
    const got = store.get('s1')
    expect(got.prompt).toBe('updated')
    expect(got.updatedAt).toBeDefined()
  })

  it('should remove a schedule', () => {
    const store = createStore(tmpDir)
    store.save({ id: 's1', expr: '0 0 * * *', prompt: 'a' })
    expect(store.remove('s1')).toBe(true)
    expect(store.get('s1')).toBeNull()
    expect(store.list()).toHaveLength(0)
  })

  it('should return false for removing non-existent schedule', () => {
    const store = createStore(tmpDir)
    expect(store.remove('nope')).toBe(false)
  })

  it('should persist across store instances', () => {
    const store1 = createStore(tmpDir)
    store1.save({ id: 's1', expr: '0 0 * * *', prompt: 'persistent' })

    const store2 = createStore(tmpDir)
    const got = store2.get('s1')
    expect(got.prompt).toBe('persistent')
  })

  it('should handle empty/missing file gracefully', () => {
    const store = createStore(tmpDir)
    expect(store.list()).toEqual([])
    expect(store.get('x')).toBeNull()
  })

  it('should create directory if needed', () => {
    const nested = path.join(tmpDir, 'deep', 'nested')
    const store = createStore(nested)
    store.save({ id: 's1', prompt: 'test' })
    expect(store.get('s1').prompt).toBe('test')
  })
})
