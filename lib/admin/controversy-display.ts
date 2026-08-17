const QUESTION_PREFIX = /^What are the competing views concerning\s+/i

export function controversyDisplayName(input: {
  uid: string
  title?: string | null
  topic_key?: string | null
}): string {
  const title = input.title?.trim()
  if (title && !title.startsWith('Untitled controversy')) {
    const stripped = title.replace(QUESTION_PREFIX, '').replace(/\?$/, '').trim()
    if (!QUESTION_PREFIX.test(title)) return title
    if (stripped) return stripped
  }
  const fromTopic = input.topic_key?.replace(/^sim:/, '').trim()
  if (fromTopic) return fromTopic
  return input.uid
}
