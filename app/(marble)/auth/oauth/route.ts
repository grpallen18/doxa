import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

const ALLOWED_PROVIDERS = ['facebook', 'github', 'google', 'azure', 'twitter'] as const
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number]

function parseProvider(value: string | null): AllowedProvider | null {
  return ALLOWED_PROVIDERS.includes(value as AllowedProvider) ? (value as AllowedProvider) : null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const provider = parseProvider(searchParams.get('provider') ?? 'github')
  const redirectTo = sanitizeRedirectPath(searchParams.get('redirect'))
  const origin = request.nextUrl.origin
  const callbackUrl = `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`

  if (!provider) {
    return NextResponse.redirect(
      new URL('/auth/error?error=Unsupported+sign-in+provider', request.url)
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
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
