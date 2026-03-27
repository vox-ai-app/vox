import { Document, HeadingLevel, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import fs from 'fs/promises'
import path from 'path'
import { parseDocx } from '@vox-ai-app/parser'
import {
  clampNumber,
  normalizeHexColor,
  normalizeStructuredBlocks,
  parseBlocksFromContent,
  resolveDocumentContent,
  resolveDocxPath,
  resolvePathInputFromPayload,
  toDocxHalfPoints,
  toDocxTwips
} from '../utils.js'
const getDocxAlignment = (alignment) => {
  const normalized = String(alignment || '')
    .trim()
    .toLowerCase()
  if (normalized === 'center') return AlignmentType.CENTER
  if (normalized === 'right') return AlignmentType.RIGHT
  if (normalized === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}
const normalizeWordTheme = (theme) => {
  const safeTheme = theme && typeof theme === 'object' ? theme : {}
  const headingDefaults = [22, 18, 16, 14]
  const providedHeadingSizes = Array.isArray(safeTheme.headingSizes) ? safeTheme.headingSizes : []
  return {
    titleColor: normalizeHexColor(safeTheme.titleColor, '1F1F1F'),
    headingColor: normalizeHexColor(safeTheme.headingColor, '222222'),
    textColor: normalizeHexColor(safeTheme.textColor, '2B2B2B'),
    quoteColor: normalizeHexColor(safeTheme.quoteColor, '5A5A5A'),
    titleSize: clampNumber(safeTheme.titleSize, 28, 12, 72),
    headingSizes: headingDefaults.map((fallback, index) =>
      clampNumber(providedHeadingSizes[index], fallback, 10, 60)
    ),
    bodySize: clampNumber(safeTheme.bodySize, 11, 8, 36),
    align: String(safeTheme.align || 'left')
      .trim()
      .toLowerCase()
  }
}
const getWordFontSize = (block, theme) => {
  if (block.style.size) return block.style.size
  if (block.type === 'heading') {
    return theme.headingSizes[Math.max(0, Math.min(block.level - 1, 3))] || theme.headingSizes[0]
  }
  if (block.type === 'quote') return Math.max(theme.bodySize - 1, 8)
  return theme.bodySize
}
const getWordTextColor = (block, theme) => {
  if (block.style.color) return block.style.color
  if (block.type === 'heading') return theme.headingColor
  if (block.type === 'quote') return theme.quoteColor
  return theme.textColor
}
const getWordParagraphSpacing = (block) => {
  if (block.type === 'heading') {
    return {
      before: clampNumber(block.style.spacingBefore, 8, 0, 120),
      after: clampNumber(block.style.spacingAfter, 8, 0, 120)
    }
  }
  if (block.type === 'bullet') {
    return {
      before: clampNumber(block.style.spacingBefore, 2, 0, 120),
      after: clampNumber(block.style.spacingAfter, 3, 0, 120)
    }
  }
  if (block.type === 'quote') {
    return {
      before: clampNumber(block.style.spacingBefore, 4, 0, 120),
      after: clampNumber(block.style.spacingAfter, 6, 0, 120)
    }
  }
  return {
    before: clampNumber(block.style.spacingBefore, 2, 0, 120),
    after: clampNumber(block.style.spacingAfter, 6, 0, 120)
  }
}
const createWordParagraph = (text, block, theme) => {
  const safeText = String(text || '')
  const size = getWordFontSize(block, theme)
  const color = getWordTextColor(block, theme)
  const spacing = getWordParagraphSpacing(block)
  const paragraphIndent = clampNumber(block.style.indent, 0, 0, 2000)
  const isHeading = block.type === 'heading'
  const isQuote = block.type === 'quote'
  const isBullet = block.type === 'bullet'
  const headingByLevel = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4
  }
  return new Paragraph({
    heading: isHeading ? headingByLevel[block.level] || HeadingLevel.HEADING_2 : undefined,
    bullet: isBullet
      ? {
          level: Math.max(0, Math.min(block.level - 1, 6))
        }
      : undefined,
    alignment: getDocxAlignment(block.style.align || theme.align),
    spacing: {
      before: toDocxTwips(spacing.before),
      after: toDocxTwips(spacing.after)
    },
    indent: isQuote
      ? {
          left: 360 + paragraphIndent
        }
      : paragraphIndent > 0
        ? {
            left: paragraphIndent
          }
        : undefined,
    children: [
      new TextRun({
        text: safeText,
        size: toDocxHalfPoints(size),
        color,
        bold: isHeading || block.style.bold,
        italics: isQuote || block.style.italic
      })
    ]
  })
}
export async function createWordDocument(payload) {
  const safePayload = payload && typeof payload === 'object' ? payload : {}
  const pathInput = resolvePathInputFromPayload(safePayload)
  if (!pathInput) {
    throw new Error('Path is required. Provide path/filePath/targetPath, or directory + filename.')
  }
  const targetPath = resolveDocxPath(pathInput)
  const title = String(safePayload?.title || '').trim()
  const shouldCreateParents = safePayload?.createParents !== false
  const appendMode = Boolean(safePayload?.append)
  const hasProvidedBlocks = Array.isArray(safePayload?.blocks) && safePayload.blocks.length > 0
  let existingText = ''
  let blockPayload = {
    ...safePayload
  }
  if (appendMode) {
    try {
      await fs.access(targetPath)
      existingText = (await parseDocx(targetPath, Infinity))?.text || ''
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    if (existingText) {
      if (hasProvidedBlocks) {
        blockPayload = {
          ...blockPayload,
          blocks: [
            ...parseBlocksFromContent(existingText),
            {
              type: 'separator',
              text: ''
            },
            ...safePayload.blocks
          ]
        }
      } else {
        const newContent = resolveDocumentContent(blockPayload)
        const mergedContent = newContent.trim() ? `${existingText}\n\n${newContent}` : existingText
        blockPayload = {
          ...blockPayload,
          content: mergedContent
        }
      }
    }
  }
  const blocks = normalizeStructuredBlocks(blockPayload)
  const hasRenderableBlocks = blocks.some((block) => block.type !== 'separator')
  const theme = normalizeWordTheme(safePayload?.theme)
  if (!title && !hasRenderableBlocks) {
    throw new Error(
      'No Word content provided. Pass content/blocks (or body/text/markdown), or include a title.'
    )
  }
  if (shouldCreateParents) {
    await fs.mkdir(path.dirname(targetPath), {
      recursive: true
    })
  }
  const documentParagraphs = []
  if (title) {
    documentParagraphs.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: getDocxAlignment(theme.align),
        spacing: {
          before: toDocxTwips(0),
          after: toDocxTwips(12)
        },
        children: [
          new TextRun({
            text: title,
            size: toDocxHalfPoints(theme.titleSize),
            color: theme.titleColor,
            bold: true
          })
        ]
      })
    )
  }
  for (const block of blocks) {
    if (block.type === 'separator') {
      documentParagraphs.push(
        new Paragraph({
          spacing: {
            before: toDocxTwips(2),
            after: toDocxTwips(clampNumber(block.style.spacingAfter, 8, 0, 120))
          },
          children: [new TextRun('')]
        })
      )
      continue
    }
    if (block.type === 'bullet') {
      const items = block.items.length > 0 ? block.items : [block.text]
      for (const item of items) {
        documentParagraphs.push(createWordParagraph(item, block, theme))
      }
      continue
    }
    documentParagraphs.push(createWordParagraph(block.text, block, theme))
  }
  if (documentParagraphs.length === 0) {
    documentParagraphs.push(
      new Paragraph({
        children: [new TextRun('')]
      })
    )
  }
  const document = new Document({
    sections: [
      {
        children: documentParagraphs
      }
    ]
  })
  const docBuffer = await Packer.toBuffer(document)
  await fs.writeFile(targetPath, docBuffer)
  const stats = await fs.stat(targetPath)
  return {
    path: targetPath,
    fileSize: stats.size,
    paragraphs: documentParagraphs.length,
    blocks: blocks.length,
    appendMode,
    appendedExistingText: Boolean(existingText),
    existingChars: existingText.length
  }
}
