import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('tools/schema — validateArgs', () => {
  let validateArgs

  beforeEach(async () => {
    vi.resetModules()
    ;({ validateArgs } = await import('../packages/tools/src/core/schema.js'))
  })

  it('should return empty array for valid args', () => {
    const schema = {
      required: ['name'],
      properties: { name: { type: 'string' } }
    }
    expect(validateArgs(schema, { name: 'Alice' })).toEqual([])
  })

  it('should report missing required fields', () => {
    const schema = {
      required: ['name', 'age'],
      properties: { name: { type: 'string' }, age: { type: 'number' } }
    }
    const issues = validateArgs(schema, { name: 'Alice' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('"age"')
  })

  it('should report type mismatches', () => {
    const schema = {
      properties: { count: { type: 'number' } }
    }
    const issues = validateArgs(schema, { count: 'not a number' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('must be number')
  })

  it('should validate enum values', () => {
    const schema = {
      properties: { color: { type: 'string', enum: ['red', 'blue'] } }
    }
    const issues = validateArgs(schema, { color: 'green' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('one of')
  })

  it('should validate string minLength and maxLength', () => {
    const schema = {
      properties: { name: { type: 'string', minLength: 2, maxLength: 5 } }
    }
    expect(validateArgs(schema, { name: 'A' })).toHaveLength(1)
    expect(validateArgs(schema, { name: 'ABCDEF' })).toHaveLength(1)
    expect(validateArgs(schema, { name: 'ABC' })).toEqual([])
  })

  it('should validate number minimum and maximum', () => {
    const schema = {
      properties: { n: { type: 'number', minimum: 0, maximum: 100 } }
    }
    expect(validateArgs(schema, { n: -1 })).toHaveLength(1)
    expect(validateArgs(schema, { n: 101 })).toHaveLength(1)
    expect(validateArgs(schema, { n: 50 })).toEqual([])
  })

  it('should skip validation for missing optional fields', () => {
    const schema = {
      properties: { opt: { type: 'string' } }
    }
    expect(validateArgs(schema, {})).toEqual([])
  })

  it('should handle null schema gracefully', () => {
    expect(validateArgs(null, {})).toEqual([])
    expect(validateArgs({}, {})).toEqual([])
  })

  it('should detect array type', () => {
    const schema = {
      properties: { items: { type: 'array' } }
    }
    expect(validateArgs(schema, { items: [1, 2] })).toEqual([])
    expect(validateArgs(schema, { items: 'not array' })).toHaveLength(1)
  })
})

describe('tools/schema — assertValidDefinition', () => {
  let assertValidDefinition

  beforeEach(async () => {
    vi.resetModules()
    ;({ assertValidDefinition } = await import('../packages/tools/src/core/schema.js'))
  })

  it('should accept valid definition', () => {
    expect(() => assertValidDefinition({ name: 'test', description: 'A test tool' })).not.toThrow()
  })

  it('should reject null', () => {
    expect(() => assertValidDefinition(null)).toThrow('must be an object')
  })

  it('should reject missing name', () => {
    expect(() => assertValidDefinition({ description: 'desc' })).toThrow('string "name"')
  })

  it('should reject missing description', () => {
    expect(() => assertValidDefinition({ name: 'test' })).toThrow('string "description"')
  })

  it('should reject non-object parameters', () => {
    expect(() =>
      assertValidDefinition({ name: 'test', description: 'desc', parameters: 'bad' })
    ).toThrow('"parameters" must be an object')
  })

  it('should allow parameters as object', () => {
    expect(() =>
      assertValidDefinition({ name: 'test', description: 'desc', parameters: { type: 'object' } })
    ).not.toThrow()
  })
})

describe('tools/schema — clampNumber', () => {
  let clampNumber

  beforeEach(async () => {
    vi.resetModules()
    ;({ clampNumber } = await import('../packages/tools/src/core/schema.js'))
  })

  it('should clamp within range', () => {
    expect(clampNumber(5, 0, 1, 10)).toBe(5)
  })

  it('should clamp below minimum', () => {
    expect(clampNumber(-5, 0, 0, 10)).toBe(0)
  })

  it('should clamp above maximum', () => {
    expect(clampNumber(15, 0, 0, 10)).toBe(10)
  })

  it('should use fallback for NaN', () => {
    expect(clampNumber('abc', 42, 0, 100)).toBe(42)
  })

  it('should use fallback for Infinity', () => {
    expect(clampNumber(Infinity, 42, 0, 100)).toBe(42)
  })
})

describe('tools/network — assertPublicUrl & isPrivateHost', () => {
  let assertPublicUrl, isPrivateHost

  beforeEach(async () => {
    vi.resetModules()
    ;({ assertPublicUrl, isPrivateHost } = await import('../packages/tools/src/core/network.js'))
  })

  it('should accept public URLs', () => {
    expect(() => assertPublicUrl('https://example.com')).not.toThrow()
    expect(() => assertPublicUrl('http://api.github.com/repos')).not.toThrow()
  })

  it('should reject invalid URLs', () => {
    expect(() => assertPublicUrl('not a url')).toThrow('Invalid URL')
  })

  it('should reject non-http protocols', () => {
    expect(() => assertPublicUrl('ftp://example.com')).toThrow('Only http and https')
    expect(() => assertPublicUrl('file:///etc/passwd')).toThrow('Only http and https')
  })

  it('should reject localhost', () => {
    expect(() => assertPublicUrl('http://localhost:3000')).toThrow('private')
  })

  it('should reject 127.x.x.x', () => {
    expect(() => assertPublicUrl('http://127.0.0.1')).toThrow('private')
  })

  it('should reject 10.x.x.x', () => {
    expect(() => assertPublicUrl('http://10.0.0.1')).toThrow('private')
  })

  it('should reject 192.168.x.x', () => {
    expect(() => assertPublicUrl('http://192.168.1.1')).toThrow('private')
  })

  it('should reject 172.16-31.x.x', () => {
    expect(() => assertPublicUrl('http://172.16.0.1')).toThrow('private')
    expect(() => assertPublicUrl('http://172.31.255.255')).toThrow('private')
  })

  it('should reject 169.254.x.x (link-local)', () => {
    expect(() => assertPublicUrl('http://169.254.1.1')).toThrow('private')
  })

  it('should detect private hosts correctly', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('10.0.0.1')).toBe(true)
    expect(isPrivateHost('192.168.0.1')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('example.com')).toBe(false)
  })
})

describe('tools/registry — register and run', () => {
  let mod

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('../packages/tools/src/core/registry.js')
  })

  it('should register tools and retrieve declarations', () => {
    const tools = [
      {
        definition: {
          name: 'test_tool',
          description: 'Test',
          parameters: { type: 'object', properties: {} }
        },
        execute: () => (_args) => JSON.stringify({ ok: true })
      }
    ]
    mod.registerAll(tools, {})
    const decls = mod.getDeclarations()
    expect(decls.find((d) => d.name === 'test_tool')).toBeTruthy()
  })

  it('should run a registered tool', async () => {
    const tools = [
      {
        definition: {
          name: 'echo',
          description: 'Echo',
          parameters: { type: 'object', properties: { msg: { type: 'string' } } }
        },
        execute: () => (args) => `echoed: ${args.msg}`
      }
    ]
    mod.registerAll(tools, {})
    const result = await mod.run('echo', { msg: 'hi' })
    expect(result).toBe('echoed: hi')
  })

  it('should throw for unknown tool', async () => {
    await expect(mod.run('nonexistent', {})).rejects.toThrow('Unknown desktop tool')
  })

  it('should validate args before running', async () => {
    const tools = [
      {
        definition: {
          name: 'strict',
          description: 'Strict',
          parameters: { type: 'object', required: ['x'], properties: { x: { type: 'string' } } }
        },
        execute: () => () => 'ok'
      }
    ]
    mod.registerAll(tools, {})
    await expect(mod.run('strict', {})).rejects.toThrow('Invalid args')
  })

  it('should throw on aborted signal', async () => {
    const tools = [
      {
        definition: {
          name: 'slow',
          description: 'Slow',
          parameters: { type: 'object', properties: {} }
        },
        execute: () => () => 'done'
      }
    ]
    mod.registerAll(tools, {})
    const ac = new AbortController()
    ac.abort()
    await expect(mod.run('slow', {}, { signal: ac.signal })).rejects.toThrow('aborted')
  })
})
