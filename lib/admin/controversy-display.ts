const QUESTION_PREFIX = /^What are the competing views concerning\s+/i

export function controversyDisplayName(input: {
  uid: string
  title?: string | null
  topic_key?: string | null
}): string {
  const fromTopic = input.topic_key?.replace(/^sim:/, '').trim()
  if (fromTopic) return fromTopic
  const title = input.title?.trim()
  if (!title) return input.uid
  const stripped = title.replace(QUESTION_PREFIX, '').replace(/\?$/, '').trim()
  return stripped || title
}
