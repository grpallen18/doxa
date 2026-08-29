import { NextResponse } from 'next/server'
import { authenticateMcpBot, rateLimitOk } from '@/lib/l3/mcp-auth'
import { callMcpTool, MCP_TOOLS } from '@/lib/l3/mcp-tools'

export const runtime = 'nodejs'

type Rpc = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

function rpcResult(id: Rpc['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: Rpc['id'], code: number, message: string, status = 400) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    { status }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  })
}

export async function POST(request: Request) {
  const bot = await authenticateMcpBot(request.headers.get('authorization'))
  if (!bot) {
    return rpcError(null, -32001, 'unauthorized', 401)
  }
  if (!(await rateLimitOk(bot))) {
    return rpcError(null, -32003, 'rate limited', 429)
  }

  let body: Rpc
  try {
    body = (await request.json()) as Rpc
  } catch {
    return rpcError(null, -32700, 'parse error', 400)
  }

  const method = body.method ?? ''
  if (method === 'initialize') {
    return rpcResult(body.id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'doxa-l3', version: '1.0.0' },
      capabilities: { tools: {} },
    })
  }
  if (method === 'tools/list' || method === 'notifications/initialized') {
    if (method === 'notifications/initialized') {
      return new NextResponse(null, { status: 204 })
    }
    return rpcResult(body.id, { tools: MCP_TOOLS })
  }
  if (method === 'tools/call') {
    const name = String(body.params?.name ?? '')
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>
    try {
      const result = await callMcpTool(bot, name, args)
      return rpcResult(body.id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      })
    } catch (err) {
      return rpcError(body.id, -32000, err instanceof Error ? err.message : String(err), 200)
    }
  }
  return rpcError(body.id, -32601, `unknown method ${method}`)
}

export async function GET() {
  return NextResponse.json({
    name: 'doxa-l3',
    transport: 'streamable-http',
    tools: MCP_TOOLS.map((t) => t.name),
  })
}
