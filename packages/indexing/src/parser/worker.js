import { parentPort } from 'worker_threads'
import path from 'path'
import parsePdf from '@vox-ai-app/parser/formats/pdf'
import parseDocx from '@vox-ai-app/parser/formats/docx'
import parsePptx from '@vox-ai-app/parser/formats/pptx'
import parseXlsx from '@vox-ai-app/parser/formats/xlsx'
import parseOpenDoc from '@vox-ai-app/parser/formats/opendoc'
import parseRtf from '@vox-ai-app/parser/formats/rtf'
const PARSERS = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.pptx': parsePptx,
  '.xlsx': parseXlsx,
  '.odt': parseOpenDoc,
  '.odp': parseOpenDoc,
  '.ods': parseOpenDoc,
  '.rtf': parseRtf
}
parentPort.on('message', async ({ id, filePath, maxChars }) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const parser = PARSERS[ext]
    if (!parser) throw new Error(`Unsupported format: ${ext}`)
    const result = await parser(filePath, maxChars)
    parentPort.postMessage({
      id,
      ...result
    })
  } catch (err) {
    parentPort.postMessage({
      id,
      error: err.message
    })
  }
})
