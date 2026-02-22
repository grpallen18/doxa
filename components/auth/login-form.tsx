'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

export function LoginForm({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/'
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
    <Card className="w-full max-w-sm border-border bg-card">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-4">
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
                        <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="!mt-4 w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
                <div className="relative my-4">
                  <span className="relative flex justify-center text-xs text-muted-foreground">
                    or login with:
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SOCIAL_PROVIDERS.map(({ provider, label, Icon }) => (
                    <Button
                      key={provider}
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => handleSocialLogin(provider)}
                    >
                      {label}
                      <Icon className="size-4 shrink-0 text-black" />
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => {
                      emailSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                      setTimeout(() => emailSectionRef.current?.querySelector('input')?.focus(), 300)
                    }}
                  >
                    Email
                    <Mail className="size-4 shrink-0 text-black" />
                  </Button>
                </div>
              </form>
            </Form>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/auth/forgot-password" className="underline underline-offset-2 hover:text-foreground">
                Forgot password?
              </Link>
            </p>
          </CardContent>
          <Separator />
          <CardFooter className="flex flex-col gap-2 pt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/auth/sign-up" className="font-medium text-foreground underline underline-offset-2">
              Sign up
        </Link>
      </CardFooter>
    </Card>
  )
}
