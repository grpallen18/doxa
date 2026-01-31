import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { Panel } from '@/components/Panel'

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-md flex-col gap-8 pt-12">
        <div className="text-center">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-[0.18em] text-muted transition-colors hover:text-accent-primary"
          >
            DOXA
          </Link>
        </div>
        <Panel variant="soft" interactive={false} className="p-6">
          <ForgotPasswordForm />
        </Panel>
      </div>
    </main>
  )
}
