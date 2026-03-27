import { execFile } from 'child_process'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { logger } from '../logger'

export async function synthesize(text) {
  if (!text?.trim()) return null

  const safeTxt = text.replace(/[\r\n]+/g, ' ').trim()
  const tmpPath = join(tmpdir(), `vox-tts-${randomUUID()}.wav`)

  await new Promise((resolve, reject) => {
    execFile(
      'say',
      ['-o', tmpPath, '--file-format=WAVE', '--data-format=LEI16@16000', safeTxt],
      { timeout: 30_000 },
      (err) => (err ? reject(err) : resolve())
    )
  })

  let wav
  try {
    wav = await readFile(tmpPath)
  } finally {
    unlink(tmpPath).catch(() => {})
  }

  return extractPcm(wav)
}

function extractPcm(wav) {
  let offset = 12
  while (offset < wav.byteLength - 8) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === 'data') {
      return wav.subarray(offset + 8, offset + 8 + size)
    }
    offset += 8 + size
    if (size % 2 !== 0) offset++
  }
  logger.warn('[tts] No data chunk found in WAV, falling back to offset 44')
  return wav.subarray(44)
}
