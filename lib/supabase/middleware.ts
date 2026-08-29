import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getUserRole } from '@/lib/auth-utils'
import { HOME_PATH, LANDING_PATH } from '@/lib/constants'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Auth routes a signed-in user must still be able to reach: the callbacks that
 * create the session, the post-login loader, and password recovery (which
 * itself signs the user in before they set a new password).
 */
const AUTH_ROUTES_ALLOWED_WITH_SESSION = new Set([
  '/auth/callback',
  '/auth/confirm',
  '/auth/oauth',
  '/auth/transition',
  '/auth/update-password',
  '/auth/sign-up-success',
  '/auth/error',
])

/** Assets the landing and auth pages need before a session exists. */
const PUBLIC_FILES = new Set([
  '/logo-color-no-bg.png',
  '/logo-color-no-bg-dark.png',
  '/landing-marble-background.jpg',
])

function isAuthRoute(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/auth/')
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === LANDING_PATH ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/apple-touch-icon.png' ||
    PUBLIC_FILES.has(pathname)
  )
}

/** Remote MCP bots authenticate with Bearer tokens on the route, not Supabase sessions. */
function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/mcp/')
}

/**
 * Carry refreshed Supabase auth cookies (with their original options) onto a
 * response we build ourselves, so a redirect never drops a rotated session.
 */
function withSessionCookies(response: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie)
  })
  return response
}

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
  const isApiRequest = pathname.startsWith('/api/')

  // Landing is marketing-only; signed-in visitors belong on the explore home.
  if (user && pathname === LANDING_PATH) {
    let redirectTo = sanitizeRedirectPath(request.nextUrl.searchParams.get('redirect'))
    // An explicit `?redirect=/` would bounce forever — map it to the app home.
    if (redirectTo === LANDING_PATH) redirectTo = HOME_PATH
    return withSessionCookies(
      NextResponse.redirect(new URL(redirectTo, request.url)),
      supabaseResponse
    )
  }

  const isSignedInDeadEnd =
    isAuthRoute(pathname) && !AUTH_ROUTES_ALLOWED_WITH_SESSION.has(pathname)

  if (user && isSignedInDeadEnd) {
    let redirectTo = sanitizeRedirectPath(request.nextUrl.searchParams.get('redirect'))
    if (redirectTo === LANDING_PATH) redirectTo = HOME_PATH
    return withSessionCookies(
      NextResponse.redirect(new URL(redirectTo, request.url)),
      supabaseResponse
    )
  }

  // Everything outside the landing page, the auth flow, and its assets requires
  // a session.
  if (!user && !isAuthRoute(pathname) && !isPublicPath(pathname) && !isPublicApiPath(pathname)) {
    if (isApiRequest) {
      // API callers get a machine-readable 401 rather than landing-page HTML.
      return withSessionCookies(
        NextResponse.json(
          { data: null, error: { message: 'Authentication required' } },
          { status: 401 }
        ),
        supabaseResponse
      )
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = LANDING_PATH
    redirectUrl.search = ''
    const attempted = `${pathname}${request.nextUrl.search}`
    if (attempted !== LANDING_PATH) {
      redirectUrl.searchParams.set('redirect', attempted)
    }
    return withSessionCookies(NextResponse.redirect(redirectUrl), supabaseResponse)
  }

  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) {
    // getUser() above already validated this access token against the Auth
    // server, so its claims can be trusted here.
    const { data: sessionData } = await supabase.auth.getSession()
    const role = getUserRole(sessionData?.session?.access_token ?? '')
    if (role !== 'admin') {
      if (isApiRequest) {
        return withSessionCookies(
          NextResponse.json(
            { data: null, error: { message: 'Admin access required' } },
            { status: 403 }
          ),
          supabaseResponse
        )
      }
      return withSessionCookies(
        NextResponse.redirect(new URL(HOME_PATH, request.url)),
        supabaseResponse
      )
    }
  }

  return supabaseResponse
}
