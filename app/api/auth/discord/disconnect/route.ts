import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  const { wallet } = await request.json()
  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })

  const { error } = await supabase
    .from('social_connections')
    .update({ discord_id: null, discord_username: null, updated_at: new Date().toISOString() })
    .eq('wallet_address', wallet.toLowerCase())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
