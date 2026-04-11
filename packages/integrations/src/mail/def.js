export const MAIL_TOOL_DEFINITIONS = [
  {
    name: 'read_emails',
    description:
      "Read emails from the user's Mail.app on macOS. By default 20 emails per account are returned; use offset for pagination. Returns a list of messages with id, sender, subject, date, read/unread status, flagged status, and account name, ordered newest first. Each message includes a unique id that can be used with other email tools (get_email_body, reply_to_email, forward_email, mark_email_read, delete_email, move_email, save_attachment). Requires Full Disk Access in System Settings → Privacy & Security.",
    parameters: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            'Mailbox folder name to read from. Default is "INBOX". Other examples: "Sent", "Drafts", "Archive".'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return. Default 20, max 200.'
        },
        offset: {
          type: 'number',
          description:
            'Number of matching messages to skip before returning results. Use for pagination. Default 0.'
        },
        unread_only: {
          type: 'boolean',
          description: 'If true, only return unread emails. Default false.'
        },
        search: {
          type: 'string',
          description:
            'Optional keyword to filter results by sender or subject. Case-insensitive. Filtering happens in the mail client for speed.'
        },
        account: {
          type: 'string',
          description:
            'Optional account name to read from (partial match, case-insensitive). If omitted, reads from all accounts. The account name is returned in read_emails results.'
        }
      },
      required: []
    }
  },
  {
    name: 'send_email',
    description:
      "Send an email from a specific or the default mail account via Mail.app on macOS. Always call search_contacts first if you only know the recipient's name, not their full email address.",
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description:
            'Recipient email address or comma-separated list of addresses. Must be fully resolved email addresses (e.g. sara@example.com), not names. Use search_contacts first if needed.'
        },
        subject: {
          type: 'string',
          description: 'Email subject line.'
        },
        body: {
          type: 'string',
          description: 'Plain text email body.'
        },
        cc: {
          type: 'string',
          description: 'Optional CC email address or comma-separated list.'
        },
        bcc: {
          type: 'string',
          description: 'Optional BCC email address or comma-separated list.'
        },
        attachments: {
          type: 'string',
          description:
            'Optional comma-separated list of absolute local file paths to attach. Supports ~/ shortcuts.'
        },
        account: {
          type: 'string',
          description:
            'Optional account name to send from (partial match, case-insensitive). If omitted, sends from the default account.'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'get_email_body',
    description:
      "Retrieve the full body/content of a specific email from the user's local mail client. Also returns a list of attachment names if the email has any. Prefer using message_id (from read_emails) for fast, unambiguous lookup. Falls back to sender/subject search if no id provided.",
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description:
            'The unique message id returned by read_emails. Fastest and most reliable way to identify a specific email.'
        },
        sender: {
          type: 'string',
          description:
            'Sender name or email address to match (partial match, case-insensitive). Used only if message_id is not provided.'
        },
        subject: {
          type: 'string',
          description:
            'Subject text to match (partial match, case-insensitive). Used only if message_id is not provided.'
        }
      },
      required: []
    }
  },
  {
    name: 'reply_to_email',
    description:
      'Reply to a specific email. Sends the reply immediately via the local mail client. Use the message id from read_emails or get_email_body to identify the email.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email to reply to (from read_emails).'
        },
        body: {
          type: 'string',
          description: 'The reply body text.'
        },
        reply_all: {
          type: 'boolean',
          description: 'If true, reply to all recipients. Default false.'
        },
        account: {
          type: 'string',
          description:
            'Optional account name to send the reply from (partial match). If omitted, replies from the account that received the email.'
        }
      },
      required: ['message_id', 'body']
    }
  },
  {
    name: 'forward_email',
    description:
      'Forward a specific email to one or more recipients. Sends immediately via the local mail client.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email to forward (from read_emails).'
        },
        to: {
          type: 'string',
          description:
            'Recipient email address or comma-separated list to forward to. Must be resolved email addresses.'
        },
        body: {
          type: 'string',
          description: 'Optional message to prepend above the forwarded content.'
        },
        account: {
          type: 'string',
          description:
            'Optional account name to forward from (partial match). If omitted, forwards from the account that received the email.'
        }
      },
      required: ['message_id', 'to']
    }
  },
  {
    name: 'mark_email_read',
    description: 'Mark a specific email as read or unread.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email (from read_emails).'
        },
        read: {
          type: 'boolean',
          description: 'True to mark as read, false to mark as unread. Default true.'
        }
      },
      required: ['message_id']
    }
  },
  {
    name: 'flag_email',
    description: 'Flag or unflag a specific email.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email (from read_emails).'
        },
        flagged: {
          type: 'boolean',
          description: 'True to flag, false to unflag. Default true.'
        }
      },
      required: ['message_id']
    }
  },
  {
    name: 'delete_email',
    description:
      'Delete a specific email (moves it to Trash). This action can usually be undone by the user in their mail client.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email to delete (from read_emails).'
        }
      },
      required: ['message_id']
    }
  },
  {
    name: 'move_email',
    description:
      'Move a specific email to a different mailbox folder (e.g. Archive, Work, Finance).',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email to move (from read_emails).'
        },
        target_folder: {
          type: 'string',
          description:
            'Name of the destination mailbox folder. Partial match is supported (e.g. "Archive", "Work").'
        }
      },
      required: ['message_id', 'target_folder']
    }
  },
  {
    name: 'create_draft',
    description:
      "Create an email draft without sending it. The draft opens in the user's mail client for review. Use this when the user wants to review before sending, or says 'draft' instead of 'send'.",
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address or comma-separated list.'
        },
        subject: {
          type: 'string',
          description: 'Email subject line.'
        },
        body: {
          type: 'string',
          description: 'Email body text.'
        },
        cc: {
          type: 'string',
          description: 'Optional CC email address or comma-separated list.'
        },
        bcc: {
          type: 'string',
          description: 'Optional BCC email address or comma-separated list.'
        },
        attachments: {
          type: 'string',
          description: 'Optional comma-separated list of absolute local file paths to attach.'
        },
        account: {
          type: 'string',
          description:
            'Optional account name to create the draft in (partial match). If omitted, uses the default account.'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'save_attachment',
    description:
      'Save/download an email attachment to a local folder. Use get_email_body first to see the list of attachment names, then call this with the attachment name to save it.',
    parameters: {
      type: 'object',
      properties: {
        message_id: {
          type: 'string',
          description: 'The unique message id of the email containing the attachment.'
        },
        attachment_name: {
          type: 'string',
          description: 'Name of the attachment to save (from get_email_body attachment list).'
        },
        save_path: {
          type: 'string',
          description:
            'Local directory path to save the attachment to. Defaults to ~/Downloads. Supports ~/ shortcuts.'
        }
      },
      required: ['message_id', 'attachment_name']
    }
  }
]
