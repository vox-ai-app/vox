export const KNOWLEDGE_TOOL_DEFINITIONS = [
  {
    name: 'list_indexed_files',
    description:
      'List indexed file paths from the local index manifest. Supports pagination, optional path prefix filtering, and optional fuzzy query matching by file/path.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          description: 'Page number starting from 1.'
        },
        pageSize: {
          type: 'integer',
          description: 'Number of files per page (max 200).'
        },
        prefix: {
          type: 'string',
          description: 'Optional absolute path prefix filter.'
        },
        query: {
          type: 'string',
          description: 'Optional case-insensitive substring query over file path and name.'
        }
      }
    }
  },
  {
    name: 'read_indexed_file',
    description:
      'Read file data by absolute path, restricted to indexed files only. Returns extracted text for supported formats. Supports pagination via offset/length — call again with a higher offset to read more.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute file path present in indexed files.'
        },
        offset: {
          type: 'integer',
          description: 'Character offset to start reading from. Default 0.'
        },
        length: {
          type: 'integer',
          description: 'Number of characters to return (default 30000, max 60000).'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_indexed_context',
    description:
      'Search the local knowledge index built from the user-selected files on this machine. Returns paginated chunk-level matches with file paths and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query to search the local indexed knowledge base.'
        },
        page: {
          type: 'integer',
          description: 'Page number starting from 1.'
        },
        pageSize: {
          type: 'integer',
          description: 'Number of results per page.'
        },
        prefix: {
          type: 'string',
          description: 'Optional absolute path prefix filter.'
        }
      },
      required: ['query']
    }
  }
]
