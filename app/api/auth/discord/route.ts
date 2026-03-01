import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const state = Buffer.from(wallet).toString('base64url')

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${appUrl}/api/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
  })

  const response = NextResponse.redirect(
    `https://discord.com/oauth2/authorize?${params}`
  )
  response.cookies.set('discord_state', state, {
    httpOnly: true, maxAge: 600, path: '/',
  })
  return response
}
