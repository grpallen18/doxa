/** Slack Block Kit helpers — section mrkdwn is capped at 3000 characters. */

export const SLACK_SECTION_TEXT_MAX = 3000
/** Leave headroom for footer lines appended to the last chunk. */
export const SLACK_SECTION_SAFE_MAX = 2700

export function chunkMrkdwn(text: string, maxLen = SLACK_SECTION_SAFE_MAX): string[] {
  const normalized = text.trim()
  if (!normalized) return ['']
  if (normalized.length <= maxLen) return [normalized]

  const chunks: string[] = []
  let rest = normalized
  while (rest.length > maxLen) {
    let splitAt = rest.lastIndexOf('\n', maxLen)
    if (splitAt < maxLen * 0.4) splitAt = maxLen
    chunks.push(rest.slice(0, splitAt).trim())
    rest = rest.slice(splitAt).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

export type SlackBlock = Record<string, unknown>

export function sectionBlocks(text: string, maxLen = SLACK_SECTION_SAFE_MAX): SlackBlock[] {
  return chunkMrkdwn(text, maxLen).map((chunk) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }))
}

export function approvalActionBlock(proposalUid: string): SlackBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve' },
        style: 'primary',
        action_id: 'l3_approve',
        value: proposalUid,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Reject' },
        style: 'danger',
        action_id: 'l3_reject',
        value: proposalUid,
      },
    ],
  }
}

const FOOTER =
  'Reply `approve`, or `reject: your reason` in this thread. The Reject button asks for a required reason.'

export function buildApprovalCardBlocks(proposalUid: string, bodyText: string): SlackBlock[] {
  const chunks = chunkMrkdwn(bodyText)
  const sections = chunks.map((chunk, i) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: i === chunks.length - 1 ? `${chunk}\n\n${FOOTER}` : chunk,
    },
  }))
  return [...sections, approvalActionBlock(proposalUid)]
}
