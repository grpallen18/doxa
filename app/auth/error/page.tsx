import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params?.error ?? 'An unspecified error occurred.'

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
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                Back to sign in
              </Link>
            </CardContent>
          </Card>
        </Panel>
      </div>
    </main>
  )
}
