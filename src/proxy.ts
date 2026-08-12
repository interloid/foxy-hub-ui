import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const isAuthenticated = true
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  return NextResponse.next()
}
