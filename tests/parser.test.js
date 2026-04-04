import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('parser — readDocumentFile', () => {
  let readDocumentFile, PARSED_EXTENSIONS

  beforeEach(async () => {
    vi.resetModules()
    ;({ readDocumentFile, PARSED_EXTENSIONS } = await import('../packages/parser/src/index.js'))
  })

  it('should export PARSED_EXTENSIONS as a Set', () => {
    expect(PARSED_EXTENSIONS).toBeInstanceOf(Set)
    expect(PARSED_EXTENSIONS.has('.pdf')).toBe(true)
    expect(PARSED_EXTENSIONS.has('.docx')).toBe(true)
    expect(PARSED_EXTENSIONS.has('.pptx')).toBe(true)
    expect(PARSED_EXTENSIONS.has('.xlsx')).toBe(true)
    expect(PARSED_EXTENSIONS.has('.odt')).toBe(true)
    expect(PARSED_EXTENSIONS.has('.rtf')).toBe(true)
  })

  it('should return unsupported for unknown extensions', async () => {
    const result = await readDocumentFile('/tmp/test.xyz')
    expect(result.unsupported).toBe(true)
    expect(result.text).toBe('')
    expect(result.unsupportedReason).toContain('.xyz')
  })

  it('should return unsupported for .txt files', async () => {
    const result = await readDocumentFile('/tmp/readme.txt')
    expect(result.unsupported).toBe(true)
  })

  it('should handle parser errors gracefully', async () => {
    const result = await readDocumentFile('/tmp/nonexistent.pdf')
    expect(result.unsupported).toBe(true)
    expect(result.unsupportedReason).toContain('Failed')
  })

  it('should include all expected extensions', () => {
    const expected = [
      '.pdf',
      '.docx',
      '.pptx',
      '.xlsx',
      '.odt',
      '.odp',
      '.ods',
      '.rtf',
      '.doc',
      '.docm',
      '.ppt',
      '.pptm',
      '.xls',
      '.xlsm'
    ]
    for (const ext of expected) {
      expect(PARSED_EXTENSIONS.has(ext)).toBe(true)
    }
  })
})
