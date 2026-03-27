# @vox-ai-app/parser

Document parsing for Vox. Extracts plain text from PDF, DOCX, PPTX, XLSX, ODT, RTF, and XML files.

## Install

```sh
npm install @vox-ai-app/parser
```

## Usage

```js
import { readDocumentFile, PARSED_EXTENSIONS } from '@vox-ai-app/parser'

// Read any supported document
const result = await readDocumentFile('/path/to/file.pdf')
console.log(result.text) // extracted plain text
console.log(result.truncated) // true if maxChars was hit

// Check if an extension is supported
PARSED_EXTENSIONS.has('.pdf') // true
PARSED_EXTENSIONS.has('.docx') // true
```

## Individual parsers

```js
import parseDocx from '@vox-ai-app/parser/formats/docx'
import parsePdf from '@vox-ai-app/parser/formats/pdf'
import parsePptx from '@vox-ai-app/parser/formats/pptx'
import parseXlsx from '@vox-ai-app/parser/formats/xlsx'
import parseOpenDoc from '@vox-ai-app/parser/formats/opendoc'
import parseRtf from '@vox-ai-app/parser/formats/rtf'
import parseXml from '@vox-ai-app/parser/formats/xml'

const { text } = await parseDocx('/path/to/file.docx', 60_000)
```

Each parser accepts `(filePath, maxChars?)` and returns `{ text, truncated }`.

## Supported formats

| Extension              | Parser   |
| ---------------------- | -------- |
| `.pdf`                 | unpdf    |
| `.docx`                | adm-zip  |
| `.pptx`                | adm-zip  |
| `.xlsx`                | adm-zip  |
| `.odt`, `.odp`, `.ods` | adm-zip  |
| `.rtf`                 | built-in |
| `.xml`, `.svg`         | built-in |

## License

MIT
