import { randomUUID } from 'crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'

export const STORE_THRESHOLD = 50_000
const READ_CHUNK_SIZE = 20_000
const STORE_DIR = join(tmpdir(), 'vox-results')

function resultPath(taskId, resultId) {
  return join(STORE_DIR, taskId, `${resultId}.txt`)
}

export function storeResult(taskId, content) {
  const resultId = randomUUID()
  const filePath = resultPath(taskId, resultId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return resultId
}

export function readResult(taskId, resultId, offset = 0) {
  if (!/^[0-9a-f-]+$/i.test(resultId)) throw new Error('Invalid result ID')
  const content = readFileSync(resultPath(taskId, resultId), 'utf8')
  const chunk = content.slice(offset, offset + READ_CHUNK_SIZE)
  return {
    chunk,
    offset,
    length: chunk.length,
    remaining: Math.max(0, content.length - offset - chunk.length),
    total: content.length
  }
}

export function createReadResultTool(taskId) {
  const definition = {
    name: 'read_result',
    description: 'Read a stored tool result by ID. Use offset to page through large results.',
    parameters: {
      type: 'object',
      properties: {
        resultId: {
          type: 'string',
          description: 'The result ID returned when the result was stored.'
        },
        offset: { type: 'number', description: 'Byte offset to start reading from (default 0).' }
      },
      required: ['resultId']
    }
  }

  return {
    definition,
    execute:
      () =>
      ({ resultId, offset = 0 }) =>
        readResult(taskId, resultId, offset)
  }
}
