export const CONTACTS_TOOL_DEFINITIONS = [
  {
    name: 'search_contacts',
    description:
      "Search the user's Contacts.app on macOS by name. Returns matching contacts with name, emails, phone numbers, organization, title, addresses, and notes. Supports pagination via limit/offset. Call this before send_email or when the user refers to a person by name.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Name (or partial name) to search for. Case-insensitive. Examples: "Sara", "John Smith".'
        },
        limit: {
          type: 'number',
          description: 'Max number of contacts to return (1–200). Default 25.'
        },
        offset: {
          type: 'number',
          description: 'Number of contacts to skip for pagination. Default 0.'
        }
      },
      required: ['query']
    }
  }
]
