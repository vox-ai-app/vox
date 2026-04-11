import { MAIL_TOOL_DEFINITIONS } from './def.js'
import {
  sendEmail,
  readEmails,
  getEmailBody,
  replyToEmail,
  forwardEmail,
  markEmailRead,
  flagEmail,
  deleteEmail,
  moveEmail,
  createDraft,
  saveAttachment
} from './index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const executors = resolveExecutors(
  {
    darwin: {
      read_emails: readEmails,
      send_email: sendEmail,
      get_email_body: getEmailBody,
      reply_to_email: replyToEmail,
      forward_email: forwardEmail,
      mark_email_read: markEmailRead,
      flag_email: flagEmail,
      delete_email: deleteEmail,
      move_email: moveEmail,
      create_draft: createDraft,
      save_attachment: saveAttachment
    }
  },
  'Mail'
)

export const MAIL_TOOLS = makePlatformTools(MAIL_TOOL_DEFINITIONS, executors)
