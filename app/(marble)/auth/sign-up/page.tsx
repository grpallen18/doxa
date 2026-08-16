import { SignUpForm } from '@/components/auth/sign-up-form'
import { AuthScene } from '@/components/auth/auth-scene'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = sanitizeRedirectPath(params.redirect)

  return (
    <AuthScene>
      <SignUpForm redirectTo={redirectTo} />
    </AuthScene>
  )
}
