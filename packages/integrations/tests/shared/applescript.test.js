import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = () => ({
  execAbortable: vi.fn().mockResolvedValue({ stdout: 'ok\n' }),
  esc: (s) => String(s).replace(/"/g, '\\"'),
  EXEC_TIMEOUT: 120000,
  writeTempScript: vi.fn().mockResolvedValue('/tmp/test.scpt'),
  cleanupTemp: vi.fn().mockResolvedValue(undefined)
})

describe('shared/applescript — toAppleDate', () => {
  let toAppleDate

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('@vox-ai-app/tools/exec', mockExec)
    ;({ toAppleDate } = await import('../../src/shared/applescript/index.js'))
  })

  it('should format an ISO date into AppleScript date literal', () => {
    const d = new Date('2025-04-11T14:30:00')
    const result = toAppleDate('2025-04-11T14:30:00')
    expect(result).toMatch(/^date "\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:00"$/)
    expect(result).toContain(`${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`)
  })

  it('should pad minutes to 2 digits', () => {
    const result = toAppleDate('2025-01-05T09:05:00')
    expect(result).toContain(':05:00')
  })
})

describe('shared/applescript — runAppleScript', () => {
  let runAppleScript, mockExecAbortable, mockWriteTempScript, mockCleanupTemp

  beforeEach(async () => {
    vi.resetModules()
    mockExecAbortable = vi.fn().mockResolvedValue({ stdout: 'ok\n' })
    mockWriteTempScript = vi.fn().mockResolvedValue('/tmp/test.scpt')
    mockCleanupTemp = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@vox-ai-app/tools/exec', () => ({
      execAbortable: mockExecAbortable,
      esc: (s) => String(s).replace(/"/g, '\\"'),
      EXEC_TIMEOUT: 120000,
      writeTempScript: mockWriteTempScript,
      cleanupTemp: mockCleanupTemp
    }))
    ;({ runAppleScript } = await import('../../src/shared/applescript/index.js'))
  })

  it('should join array lines into a script', async () => {
    await runAppleScript(['line 1', 'line 2'], null)
    expect(mockWriteTempScript).toHaveBeenCalledWith('line 1\nline 2', 'scpt')
  })

  it('should accept a string directly', async () => {
    await runAppleScript('single line', null)
    expect(mockWriteTempScript).toHaveBeenCalledWith('single line', 'scpt')
  })

  it('should return trimmed stdout', async () => {
    mockExecAbortable.mockResolvedValue({ stdout: '  hello  \n' })
    const result = await runAppleScript(['test'], null)
    expect(result).toBe('hello')
  })

  it('should throw on ERROR: prefix in output', async () => {
    mockExecAbortable.mockResolvedValue({ stdout: 'ERROR:event not found\n' })
    await expect(runAppleScript(['test'], null)).rejects.toThrow('event not found')
  })

  it('should wrap automation denied errors with code', async () => {
    mockExecAbortable.mockRejectedValue(new Error('not allowed to send apple events'))
    try {
      await runAppleScript(['test'], null)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err.code).toBe('AUTOMATION_DENIED')
      expect(err.message).toContain('Privacy & Security')
    }
  })

  it('should cleanup temp file even on error', async () => {
    mockExecAbortable.mockRejectedValue(new Error('some error'))
    await expect(runAppleScript(['test'], null)).rejects.toThrow('some error')
    expect(mockCleanupTemp).toHaveBeenCalledWith('/tmp/test.scpt')
  })

  it('should pass signal to execAbortable', async () => {
    const signal = new AbortController().signal
    await runAppleScript(['test'], signal)
    expect(mockExecAbortable).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 120000 }),
      signal
    )
  })
})
