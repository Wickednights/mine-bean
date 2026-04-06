import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface Row {
  wallet_address: string
  username: string | null
  pfp_url: string | null
}

/**
 * Batch profile lookup for leaderboard / miners panel.
 * Must stay on Next.js (Supabase), not the Render Express API.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('addresses') || ''
  const addresses = raw
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^0x[a-f0-9]{40}$/i.test(a))
    .slice(0, 50)

  if (addresses.length === 0) {
    return NextResponse.json({ profiles: {} as Record<string, { username: string | null; pfpUrl: string | null }> })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ profiles: {} })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('wallet_address, username, pfp_url')
    .in('wallet_address', addresses)

  if (error) {
    console.error('[profiles/batch]', error.message)
    return NextResponse.json({ profiles: {} })
  }

  const profiles: Record<string, { username: string | null; pfpUrl: string | null }> = {}
  for (const row of (data ?? []) as Row[]) {
    const addr = row.wallet_address.toLowerCase()
    profiles[addr] = {
      username: row.username ?? null,
      pfpUrl: row.pfp_url ?? null,
    }
  }
  return NextResponse.json({ profiles })
}
