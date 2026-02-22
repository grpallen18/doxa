import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') ?? 'github'
  const redirectTo = searchParams.get('redirect') ?? '/'
  const origin = request.nextUrl.origin
  const callbackUrl = `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'facebook' | 'github' | 'google' | 'azure' | 'twitter',
    options: { redirectTo: callbackUrl },
  })

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(error.message)}`, request.url)
    )
  }

  if (data?.url) {
    return NextResponse.redirect(data.url)
  }

  return NextResponse.redirect(new URL('/auth/error?error=No+OAuth+URL', request.url))
}
