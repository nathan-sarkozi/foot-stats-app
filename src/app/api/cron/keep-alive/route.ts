import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: Request) {
  // 1. Security Check
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const supabase = await createClient()

    // 2. Perform a lightweight query
    // Strict extraction: only extract the 'error' object, ignore 'count' as it's unused
    const { error } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      message: 'Database awakened successfully',
      timestamp: new Date().toISOString() 
    })

  } catch (error: unknown) {
    // 3. Strict error handling (no 'any')
    // Verify if the caught exception is an actual Error object before accessing .message
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error'
    
    console.error('Cron Error:', errorMessage)
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}