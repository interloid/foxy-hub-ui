import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const isAuthenticated = true // replace with your auth check

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/invoices/:path*',
    '/billing/:path*',
  ],
}
