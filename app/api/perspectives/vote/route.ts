import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { node_id, perspective_id, vote_value, reason } = body

    if (!node_id || !perspective_id || (vote_value !== 1 && vote_value !== -1)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: 'Missing or invalid fields: node_id, perspective_id, vote_value',
          },
        },
        { status: 400 },
      )
    }

    // Optional auth: derive user_id from Bearer token if present
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      const {
        data: { user },
      } = await supabaseClient.auth.getUser(token)
      userId = user?.id || null
    }

    // Get current node version
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .select('version')
      .eq('id', node_id)
      .single()

    if (nodeError || !node) {
      return NextResponse.json(
        { data: null, error: { message: 'Node not found' } },
        { status: 404 },
      )
    }

    const nodeVersion = node.version

    // Upsert vote for this (node, version, perspective, user)
    const { data: vote, error: voteError } = await supabase
      .from('perspective_votes')
      .upsert(
        {
          node_id,
          node_version: nodeVersion,
          perspective_id,
          user_id: userId,
          vote_value,
          reason: reason || null,
        },
        {
          onConflict: 'node_id,node_version,perspective_id,user_id',
        },
      )
      .select()
      .single()

    if (voteError) {
      return NextResponse.json(
        {
          data: null,
          error: { message: voteError.message, code: voteError.code },
        },
        { status: 500 },
      )
    }

    // Return updated aggregate stats for this perspective
    const { data: votesForPerspective, error: aggError } = await supabase
      .from('perspective_votes')
      .select('vote_value')
      .eq('node_id', node_id)
      .eq('node_version', nodeVersion)
      .eq('perspective_id', perspective_id)

    if (aggError || !votesForPerspective) {
      return NextResponse.json(
        {
          data: vote,
          error: {
            message: aggError?.message || 'Failed to compute vote aggregates',
          },
        },
        { status: 201 },
      )
    }

    let up = 0
    let down = 0
    votesForPerspective.forEach((v) => {
      if (v.vote_value > 0) up++
      else if (v.vote_value < 0) down++
    })

    const stats = {
      perspective_id,
      upvotes: up,
      downvotes: down,
      net_score: up - down,
    }

    return NextResponse.json(
      { data: { vote, stats }, error: null },
      { status: 201 },
    )
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 },
    )
  }
}

