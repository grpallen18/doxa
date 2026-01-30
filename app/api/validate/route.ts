import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { node_id, perspective_id, is_represented, feedback } = body

    // Validate required fields
    if (!node_id || !perspective_id || typeof is_represented !== 'boolean') {
      return NextResponse.json(
        { data: null, error: { message: 'Missing required fields: node_id, perspective_id, is_represented' } },
        { status: 400 }
      )
    }

    // Get the auth token from the request
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      // Verify token and get user
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      
      const { data: { user } } = await supabaseClient.auth.getUser(token)
      userId = user?.id || null
    }

    // Get node version
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .select('version')
      .eq('id', node_id)
      .single()

    if (nodeError || !node) {
      return NextResponse.json(
        { data: null, error: { message: 'Node not found' } },
        { status: 404 }
      )
    }

    // Insert validation (using ON CONFLICT to update if exists)
    const { data: validation, error: validationError } = await supabase
      .from('validations')
      .upsert({
        node_id,
        node_version: node.version,
        perspective_id,
        user_id: userId,
        is_represented,
        feedback: feedback || null,
      }, {
        onConflict: 'node_id,node_version,perspective_id,user_id',
      })
      .select()
      .single()

    if (validationError) {
      return NextResponse.json(
        { data: null, error: { message: validationError.message, code: validationError.code } },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { data: validation, error: null },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}
