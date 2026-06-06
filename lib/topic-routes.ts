export function topicPath(topicId: string) {
  return `/topics/${topicId}`
}

export function positionPath(topicId: string, positionId: string) {
  return `/topics/${topicId}/positions/${positionId}`
}
