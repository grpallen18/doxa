/**
 * Headers for POST /functions/v1/* from admin run-step and scripts.
 * Functions must be deployed with --no-verify-jwt when using sb_secret keys.
 */
export function edgeFunctionHeaders(serviceKey: string): Record<string, string> {
  const key = serviceKey.trim()
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for Edge Function calls.')
  }
  if (key.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is the publishable key, not the secret key. Use sb_secret_... or legacy service_role JWT (eyJ...).'
    )
  }
  return { Authorization: `Bearer ${key}`, apikey: key }
}
