import { NextResponse } from 'next/server'
import crypto from 'crypto'

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = Buffer.from(wallet).toString('base64url')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TWITTER_CLIENT_ID!,
    redirect_uri: `${appUrl}/api/auth/twitter/callback`,
    scope: 'users.read tweet.read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const response = NextResponse.redirect(
    `https://twitter.com/i/oauth2/authorize?${params}`
  )
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true, maxAge: 600, path: '/',
  })
  response.cookies.set('twitter_state', state, {
    httpOnly: true, maxAge: 600, path: '/',
  })
  return response
}
