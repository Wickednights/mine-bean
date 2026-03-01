import { NextResponse } from 'next/server'
import { verifyMessage } from 'viem'
import { supabase } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: { address: string } }) {
  const address = (await params).address.toLowerCase()

  const { data } = await supabase
    .from('profiles')
    .select('username, bio, pfp_url, banner_url')
    .eq('wallet_address', address)
    .single()

  return NextResponse.json({
    username: data?.username ?? null,
    bio: data?.bio ?? null,
    pfpUrl: data?.pfp_url ?? null,
    bannerUrl: data?.banner_url ?? null,
  })
}

export async function PUT(req: Request, { params }: { params: { address: string } }) {
  const address = (await params).address.toLowerCase()

  const body = await req.json()
  const { username, bio, pfpUrl, bannerUrl, signature, message, timestamp } = body

  // Reject stale requests (>5 min old)
  const now = Math.floor(Date.now() / 1000)
  if (!timestamp || Math.abs(now - timestamp) > 300) {
    return NextResponse.json({ error: 'Expired timestamp' }, { status: 401 })
  }

  // Verify the wallet signature
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    })
    if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Only upsert fields that were provided
  const row: Record<string, unknown> = {
    wallet_address: address,
    updated_at: new Date().toISOString(),
  }
  if (username !== undefined) row.username = username
  if (bio !== undefined) row.bio = bio
  if (pfpUrl !== undefined) row.pfp_url = pfpUrl
  if (bannerUrl !== undefined) row.banner_url = bannerUrl

  const { error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'wallet_address' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
