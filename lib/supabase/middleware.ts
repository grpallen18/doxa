import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getUserRole } from '@/lib/auth-utils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Use getUser() to validate against the Auth server. getSession() reads from cookies
  // only and can return stale data (e.g. deleted users).
  const { data: userData, error } = await supabase.auth.getUser()
  const user = userData?.user

  // Clear invalid session cookies (e.g. from deleted users). Skip on network errors
  // (status 0) — signOut would call Auth again and spam "fetch failed" in the dev log.
  if (error && error.status !== 0) {
    await supabase.auth.signOut()
  }

  const pathname = request.nextUrl.pathname
  const isAuthPage = pathname === '/login' || pathname.startsWith('/auth/')

  // Public explore: read without an account. Contribute/admin still require auth.
  const isPublicExplore =
    pathname === '/' ||
    pathname === '/about' ||
    pathname === '/search' ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/topics/') ||
    pathname.startsWith('/entities/') ||
    pathname.startsWith('/people/') ||
    pathname.startsWith('/api/explore') ||
    pathname.startsWith('/api/topics/search') ||
    pathname.startsWith('/api/theme-presets') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/logo-color-no-bg.png' ||
    pathname === '/logo-color-no-bg-dark.png'

  if (user && isAuthPage) {
    const redirectTo = request.nextUrl.searchParams.get('redirect') ?? '/'
    const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url))
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie.name, cookie.value)
    )
    return redirectResponse
  }

  if (!user && !isAuthPage && !isPublicExplore) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirect', pathname)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie.name, cookie.value)
    )
    return redirectResponse
  }

  if (user && pathname.startsWith('/admin')) {
    const { data: sessionData } = await supabase.auth.getSession()
    const role = getUserRole(sessionData?.session?.access_token ?? '')
    if (role !== 'admin') {
      const redirectResponse = NextResponse.redirect(new URL('/', request.url))
      supabaseResponse.cookies.getAll().forEach((cookie) =>
        redirectResponse.cookies.set(cookie.name, cookie.value)
      )
      return redirectResponse
    }
  }

  return supabaseResponse
}
