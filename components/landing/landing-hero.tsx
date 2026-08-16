import { GlassButton } from '@/components/landing/glass-button'
import { HOME_PATH } from '@/lib/constants'

/**
 * Landing content: the two ways into the app. The scene and the brand above it
 * come from the `(marble)` layout, so this sits exactly where the auth card
 * does and swapping between them moves nothing else.
 */
export function LandingHero({ redirectTo }: { redirectTo: string }) {
  const query =
    redirectTo === HOME_PATH ? '' : `?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <div className="animate-scene-fade-in flex w-full max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
      <GlassButton href={`/auth/sign-up${query}`}>Sign up</GlassButton>
      <GlassButton href={`/login${query}`} variant="secondary">
        Log in
      </GlassButton>
    </div>
  )
}
