import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type L3Bot = {
  bot_id: string
  kind: string
  rate_limit_per_min: number
}

export async function authenticateMcpBot(authHeader: string | null): Promise<L3Bot | null> {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null
  const supabase = createAdminClient()
  const hash = hashMcpToken(token)
  const { data } = await supabase
    .from('l3_bots')
    .select('bot_id, kind, rate_limit_per_min')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!data) return null
  await supabase
    .from('l3_bots')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('bot_id', data.bot_id)
  return data as L3Bot
}

export async function rateLimitOk(bot: L3Bot): Promise<boolean> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('l3_mcp_audit')
    .select('*', { count: 'exact', head: true })
    .eq('bot_id', bot.bot_id)
    .gte('created_at', since)
  return (count ?? 0) < (bot.rate_limit_per_min ?? 60)
}
