import Link from 'next/link'
import { Panel } from '@/components/Panel'

export default function SignUpSuccessPage() {
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
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent you a confirmation link. Click it to activate your account, then sign in.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            Go to sign in
          </Link>
        </Panel>
      </div>
    </main>
  )
}
