/** Derive Question uid from stable Controversy overlay uid (Session 3+). */
export function questionUidFromControversyUid(controversyUid: string): string | null {
  const trimmed = controversyUid.trim()
  if (!trimmed.startsWith('ctr_')) return null
  const slug = trimmed.slice(4)
  if (!slug) return null
  return `cq:${slug}`
}

export function neoUnionQuestionHref(questionUid: string): string {
  return `/admin/neo/union?focus=${encodeURIComponent(`question:${questionUid}`)}`
}
