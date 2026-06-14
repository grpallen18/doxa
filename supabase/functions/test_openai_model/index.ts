const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseOpenAiError(body: unknown): string {
  if (!body || typeof body !== 'object') return 'OpenAI request failed'
  const record = body as { error?: { message?: string } }
  return record.error?.message?.trim() || 'OpenAI request failed'
}

function resolveModelKind(configKey: string): 'chat' | 'embedding' {
  return configKey.includes('EMBEDDING') ? 'embedding' : 'chat'
}

async function testChatModel(apiKey: string, model: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
  })
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (!res.ok) {
    return { ok: false, message: parseOpenAiError(body) }
  }
  const content = body.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return { ok: false, message: 'Chat completion returned no content' }
  }
  return { ok: true, message: `Chat model "${model}" responded successfully.` }
}

async function testEmbeddingModel(
  apiKey: string,
  model: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: 'doxa model config test',
    }),
  })
  const body = (await res.json()) as { data?: unknown[]; error?: { message?: string } }
  if (!res.ok) {
    return { ok: false, message: parseOpenAiError(body) }
  }
  if (!Array.isArray(body.data) || body.data.length === 0) {
    return { ok: false, message: 'Embedding response was empty' }
  }
  return { ok: true, message: `Embedding model "${model}" responded successfully.` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) {
    return json(
      {
        ok: false,
        error:
          'OPENAI_API_KEY is not configured on Edge Functions. Set it in Supabase Edge secrets.',
      },
      500
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const configKey = typeof record?.config_key === 'string' ? record.config_key.trim() : ''
  const model = typeof record?.model === 'string' ? record.model.trim() : ''

  if (!configKey || !model) {
    return json({ ok: false, error: 'Missing config_key or model' }, 400)
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(model) || model.length > 120) {
    return json({ ok: false, error: 'Invalid model ID format' }, 400)
  }

  const started = Date.now()
  const kind = resolveModelKind(configKey)
  const result =
    kind === 'embedding'
      ? await testEmbeddingModel(apiKey, model)
      : await testChatModel(apiKey, model)

  const latencyMs = Date.now() - started

  if (!result.ok) {
    return json({ ok: false, message: result.message, latencyMs }, 400)
  }

  return json({ ok: true, message: result.message, latencyMs })
})
