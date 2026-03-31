import { z } from 'zod'

export function jsonSchemaToZod(schema) {
  if (!schema) return z.unknown()
  switch (schema.type) {
    case 'string':
      return z.string()
    case 'number':
    case 'integer':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.unknown())
    case 'object': {
      if (!schema.properties) return z.record(z.unknown())
      const required = new Set(schema.required || [])
      const shape = {}
      for (const [key, s] of Object.entries(schema.properties)) {
        const t = jsonSchemaToZod(s)
        shape[key] = required.has(key) ? t : t.optional()
      }
      return z.object(shape)
    }
    default:
      return z.unknown()
  }
}

export async function* sessionPromptGen(session, userPrompt, functions, signal) {
  const queue = []
  let resolve = null
  let done = false
  let finalError = null

  const enqueue = (event) => {
    queue.push(event)
    if (resolve) {
      const r = resolve
      resolve = null
      r()
    }
  }

  const promptPromise = session
    .prompt(userPrompt, {
      functions: functions && Object.keys(functions).length > 0 ? functions : undefined,
      onTextChunk: (chunk) => enqueue({ type: 'text', content: chunk }),
      signal
    })
    .then(() => {
      done = true
      if (resolve) {
        const r = resolve
        resolve = null
        r()
      }
    })
    .catch((err) => {
      finalError = err
      done = true
      if (resolve) {
        const r = resolve
        resolve = null
        r()
      }
    })

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()
    } else if (done) {
      break
    } else {
      await new Promise((r) => {
        resolve = r
      })
    }
  }

  await promptPromise
  if (finalError && finalError.name !== 'AbortError' && !signal?.aborted) throw finalError
}
