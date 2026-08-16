import Link from 'next/link'
import { AuthCardHeading, authLinkClassName, AuthScene } from '@/components/auth/auth-scene'
import { cn } from '@/lib/utils'

export default function SignUpSuccessPage() {
  return (
    <AuthScene>
      <AuthCardHeading
        title="Check your email"
        description="We sent you a confirmation link. Click it to activate your account, then sign in."
      />
      <Link href="/login" className={cn('mt-4 inline-block text-sm', authLinkClassName)}>
        Go to log in
      </Link>
    </AuthScene>
  )
}
