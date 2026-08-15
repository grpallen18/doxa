import { SignUpForm } from '@/components/auth/sign-up-form'
import { Panel } from '@/components/Panel'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = sanitizeRedirectPath(params.redirect)

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-md flex-col gap-8 pt-12">
        <div className="text-center">
          <span className="text-6xl font-semibold uppercase tracking-[0.18em] text-[rgb(96,84,72)] sm:text-7xl">
            DOXA
          </span>
        </div>
        <Panel variant="soft" interactive={false} className="p-6">
          <SignUpForm redirectTo={redirectTo} />
        </Panel>
      </div>
    </main>
  )
}
