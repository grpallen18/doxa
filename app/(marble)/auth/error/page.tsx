import Link from 'next/link'
import { AuthCardHeading, authLinkClassName, AuthScene } from '@/components/auth/auth-scene'
import { cn } from '@/lib/utils'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params?.error ?? 'An unspecified error occurred.'

  return (
    <AuthScene>
      <AuthCardHeading title="Sorry, something went wrong." description={error} />
      <Link href="/login" className={cn('mt-4 inline-block text-sm', authLinkClassName)}>
        Back to log in
      </Link>
    </AuthScene>
  )
}
