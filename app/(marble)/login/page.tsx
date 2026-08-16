import { LoginExperience } from '@/components/auth/login-experience'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  return <LoginExperience redirectTo={sanitizeRedirectPath(params.redirect)} />
}
