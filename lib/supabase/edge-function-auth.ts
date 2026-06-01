import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Legacy anon JWT for preview branch (gateway only when using sb_secret). */
function previewLegacyAnonJwt(): string | undefined {
  const fromEnv = process.env.SUPABASE_LEGACY_ANON_JWT?.trim()
  if (fromEnv?.startsWith('eyJ')) return fromEnv
  try {
    const meta = JSON.parse(
      readFileSync(join(process.cwd(), 'supabase', 'preview-branch.json'), 'utf8')
    ) as { legacy_anon_jwt?: string }
    return meta.legacy_anon_jwt?.startsWith('eyJ') ? meta.legacy_anon_jwt : undefined
  } catch {
    return undefined
  }
}

/**
 * Headers for POST /functions/v1/*.
 * sb_secret keys work for Supabase JS / REST but the Edge gateway verify_jwt expects a JWT Bearer.
 */
export function edgeFunctionHeaders(serviceKey: string): Record<string, string> {
  if (serviceKey.startsWith('eyJ')) {
    return { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
  }
  const bearer = previewLegacyAnonJwt()
  if (!bearer) {
    throw new Error(
      'sb_secret keys need a legacy JWT for Edge Function calls. Use legacy service_role JWT as SUPABASE_SERVICE_ROLE_KEY, or set SUPABASE_LEGACY_ANON_JWT.'
    )
  }
  return { Authorization: `Bearer ${bearer}`, apikey: serviceKey }
}
