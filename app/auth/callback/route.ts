import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirect') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const transitionUrl = new URL('/auth/transition', origin)
      transitionUrl.searchParams.set('redirect', redirectTo)
      return NextResponse.redirect(transitionUrl)
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', origin))
}
