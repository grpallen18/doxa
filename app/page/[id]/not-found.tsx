import { NotFoundView } from '@/components/landing/not-found-view'
import { HOME_PATH } from '@/lib/constants'

export default function TopicNotFound() {
  return (
    <NotFoundView
      message="This topic isn't here — it may have been removed, or the link is out of date."
      homeHref={HOME_PATH}
    />
  )
}
