import type { NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Refresh sessions on UI requests, including Server Actions. Cron jobs and
  // static assets do not use browser sessions and must bypass this proxy.
  matcher: ['/dashboard/:path*', '/profile/:path*', '/login', '/register'],
}
