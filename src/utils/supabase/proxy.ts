import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
          // @supabase/ssr supplies these headers to prevent cached responses
          // from sharing refreshed session cookies between visitors.
          Object.entries(headersToSet).forEach(([name, value]) => {
            response.headers.set(name, value)
          })
        },
      },
    },
  )

  await supabase.auth.getClaims()

  // Access checks and redirects remain in the existing layouts and actions.
  return response
}
