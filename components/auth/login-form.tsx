'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { HOME_PATH } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  authLinkClassName,
  glassFieldClassName,
  glassOutlineButtonClassName,
} from '@/components/auth/auth-scene'
import { GlassSubmitButton } from '@/components/landing/glass-button'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SiFacebook, SiGithub, SiGoogle, SiX } from 'react-icons/si'
import { FaMicrosoft } from 'react-icons/fa'
import { Mail } from 'lucide-react'

type OAuthProvider = 'facebook' | 'github' | 'google' | 'azure' | 'twitter'

const SOCIAL_PROVIDERS: { provider: OAuthProvider; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { provider: 'facebook', label: 'Facebook', Icon: SiFacebook },
  { provider: 'github', label: 'Github', Icon: SiGithub },
  { provider: 'google', label: 'Google', Icon: SiGoogle },
  { provider: 'azure', label: 'Microsoft', Icon: FaMicrosoft },
  { provider: 'twitter', label: 'X', Icon: SiX },
]

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm({
  redirectTo,
  onLoginSuccess,
}: {
  /** Resolved on the server, so this form needs no Suspense boundary. */
  redirectTo: string
  onLoginSuccess?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const emailSectionRef = useRef<HTMLDivElement>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const supabase = createClient()

  async function handleSocialLogin(provider: OAuthProvider) {
    setError(null)
    const callbackUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    })
    if (oauthError) {
      setError(oauthError.message)
      return
    }
    if (data?.url) {
      window.location.href = data.url
    }
  }

  async function onSubmit(values: LoginValues) {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (signInError) {
      setError(signInError.message)
      return
    }
    onLoginSuccess?.()
  }

  return (
    <div className="space-y-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div ref={emailSectionRef}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className={glassFieldClassName}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <FormLabel>Password</FormLabel>
                  <Link href="/auth/forgot-password" className={cn(authLinkClassName, 'text-sm')}>
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    className={glassFieldClassName}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <GlassSubmitButton className="!mt-5 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Signing in…' : 'Log in'}
          </GlassSubmitButton>
          <div className="flex items-center gap-3 pt-1">
            <Separator className="flex-1 bg-[rgba(36,31,26,0.14)]" />
            <span className="text-xs text-muted">or log in with</span>
            <Separator className="flex-1 bg-[rgba(36,31,26,0.14)]" />
          </div>
          {/* Two columns until the card is wide enough for "Microsoft" to fit a third. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SOCIAL_PROVIDERS.map(({ provider, label, Icon }) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                className={cn('w-full justify-between', glassOutlineButtonClassName)}
                onClick={() => handleSocialLogin(provider)}
              >
                {label}
                <Icon className="size-4 shrink-0 text-foreground" />
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className={cn('w-full justify-between', glassOutlineButtonClassName)}
              onClick={() => {
                emailSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                setTimeout(() => emailSectionRef.current?.querySelector('input')?.focus(), 300)
              }}
            >
              Email
              <Mail className="size-4 shrink-0 text-foreground" />
            </Button>
          </div>
        </form>
      </Form>
      <p className="w-full border-t border-[rgba(36,31,26,0.14)] pt-4 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link
          href={
            redirectTo === HOME_PATH
              ? '/auth/sign-up'
              : `/auth/sign-up?redirect=${encodeURIComponent(redirectTo)}`
          }
          className={authLinkClassName}
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
