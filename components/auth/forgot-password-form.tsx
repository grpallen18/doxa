'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import {
  AuthCardHeading,
  authLinkClassName,
  glassFieldClassName,
} from '@/components/auth/auth-scene'
import { GlassSubmitButton } from '@/components/landing/glass-button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const supabase = createClient()

  async function onSubmit(values: ForgotPasswordValues) {
    setError(null)
    setMessage(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/update-password`,
    })
    if (resetError) {
      setError(resetError.message)
      return
    }
    setMessage('Check your email for the reset link.')
  }

  return (
    <div className="space-y-5">
      <AuthCardHeading
        title="Forgot password"
        description="Enter your email and we'll send you a link to reset your password."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-800" role="status">
              {message}
            </p>
          )}
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
          <GlassSubmitButton className="!mt-5 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
          </GlassSubmitButton>
        </form>
      </Form>
      <p className="border-t border-[rgba(36,31,26,0.14)] pt-4 text-center text-sm">
        <Link href="/login" className={authLinkClassName}>
          Back to log in
        </Link>
      </p>
    </div>
  )
}
