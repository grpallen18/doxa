import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing')
  console.error('Key (PUBLISHABLE_KEY or ANON_KEY):', supabaseKey ? '✓ Set' : '✗ Missing')
  throw new Error('Missing Supabase environment variables. Check .env.local file.')
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll from Server Component can be ignored when middleware refreshes sessions
        }
      },
    },
  })
}

function serviceRoleKeyHint(): string {
  const urlRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  const lines = [
    'Check SUPABASE_SERVICE_ROLE_KEY in .env.local matches NEXT_PUBLIC_SUPABASE_URL (same Supabase project).',
    'Dashboard → Project Settings → API Keys: use the secret key (sb_secret_...) or legacy service_role JWT — not the publishable key.',
  ]
  if (urlRef) {
    lines.push(`Current URL project ref: ${urlRef}. Preview branch: npm run env:branch (see .env.local.branch.example).`)
  }
  return lines.join(' ')
}

function getSupabaseKeyUrlMismatchHint(serviceKey: string): string | null {
  const urlRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!urlRef) return null

  try {
    const branchPath = join(process.cwd(), 'supabase', 'preview-branch.json')
    const branchEnvPath = join(process.cwd(), '.env.local.branch')
    if (!existsSync(branchPath) || !existsSync(branchEnvPath)) return null

    const branch = JSON.parse(readFileSync(branchPath, 'utf8')) as { url?: string }
    const branchRef = branch.url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!branchRef || urlRef === branchRef) return null

    const branchEnv = readFileSync(branchEnvPath, 'utf8')
    const match = branchEnv.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
    const branchKey = match?.[1]?.trim()
    if (branchKey && branchKey === serviceKey) {
      return (
        `SUPABASE_SERVICE_ROLE_KEY is from preview branch (${branchRef}) but NEXT_PUBLIC_SUPABASE_URL is ${urlRef}. ` +
        `For preview work run npm run env:branch and restart dev. For main, use the secret key from the ${urlRef} dashboard.`
      )
    }
  } catch {
    /* ignore */
  }

  return null
}

/** Admin client with service role - bypasses RLS. Use for writes and edge invokes. */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    throw new Error(`Missing SUPABASE_SERVICE_ROLE_KEY for admin operations. ${serviceRoleKeyHint()}`)
  }
  if (serviceKey.startsWith('sb_publishable_')) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY is the publishable key, not the secret key. ${serviceRoleKeyHint()}`
    )
  }
  const mismatchHint = getSupabaseKeyUrlMismatchHint(serviceKey)
  if (mismatchHint) {
    throw new Error(mismatchHint)
  }
  return createSupabaseClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

/** Map Supabase REST errors to actionable admin messages. */
export function formatSupabaseAdminError(message: string): string {
  if (message.toLowerCase().includes('invalid api key')) {
    return `Invalid API key for admin operations. ${serviceRoleKeyHint()}`
  }
  return message
}
