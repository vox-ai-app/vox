function extractBlock(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.startsWith('---')) return null
  const endIdx = normalized.indexOf('\n---', 3)
  if (endIdx === -1) return null
  return { raw: normalized.slice(4, endIdx), endOffset: endIdx + 4 }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function extractMultiLineValue(lines, startIndex) {
  const valueLines = []
  let i = startIndex + 1
  while (i < lines.length) {
    const line = lines[i]
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) break
    valueLines.push(line)
    i++
  }
  return { value: valueLines.join('\n').trim(), linesConsumed: i - startIndex }
}

function parseLineFrontmatter(block) {
  const result = {}
  const lines = block.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (!match) {
      i++
      continue
    }
    const key = match[1]
    const inlineValue = match[2].trim()
    if (!key) {
      i++
      continue
    }

    if (inlineValue && (inlineValue.startsWith('{') || inlineValue.startsWith('['))) {
      const openChar = inlineValue[0]
      const closeChar = openChar === '{' ? '}' : ']'
      let depth = 0
      for (const ch of inlineValue) {
        if (ch === openChar) depth++
        if (ch === closeChar) depth--
      }
      if (depth === 0) {
        result[key] = { value: inlineValue, kind: 'inline', rawInline: inlineValue }
        i++
        continue
      }
      const gathered = [inlineValue]
      let j = i + 1
      while (j < lines.length && depth > 0) {
        const gLine = lines[j]
        for (const ch of gLine) {
          if (ch === openChar) depth++
          if (ch === closeChar) depth--
        }
        gathered.push(gLine)
        j++
      }
      result[key] = { value: gathered.join('\n'), kind: 'multiline', rawInline: inlineValue }
      i = j
      continue
    }

    if (!inlineValue && i + 1 < lines.length) {
      const nextLine = lines[i + 1]
      if (nextLine.startsWith(' ') || nextLine.startsWith('\t')) {
        const { value, linesConsumed } = extractMultiLineValue(lines, i)
        if (value) result[key] = { value, kind: 'multiline', rawInline: inlineValue }
        i += linesConsumed
        continue
      }
    }

    const value = stripQuotes(inlineValue)
    if (value) result[key] = { value, kind: 'inline', rawInline: inlineValue }
    i++
  }

  return result
}

function _coerceValue(val) {
  if (val === null || val === undefined) return undefined
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return undefined
    }
  }
  return undefined
}

function tryJsonParse(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

export function parseFrontmatter(content) {
  const extracted = extractBlock(content)
  if (!extracted) return { fields: {}, body: content }

  const { raw, endOffset } = extracted
  const lineParsed = parseLineFrontmatter(raw)

  const fields = {}
  for (const [key, entry] of Object.entries(lineParsed)) {
    fields[key] = entry.value
  }

  const metaEntry = lineParsed.metadata
  if (metaEntry) {
    const parsed = tryJsonParse(metaEntry.value)
    if (parsed && typeof parsed === 'object') {
      fields.metadata = parsed
    } else {
      delete fields.metadata
    }
  }

  if (fields['allowed-tools']) {
    fields['allowed-tools'] = fields['allowed-tools']
      .split(',')
      .map((t) => t.trim().replace(/^["'[\]]+|["'[\]]+$/g, ''))
      .filter(Boolean)
  }

  const body = content.slice(endOffset).replace(/^\n+/, '').trim()
  return { fields, body }
}
