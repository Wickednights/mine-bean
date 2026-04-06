import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const address = searchParams.get('address')
    const suite = searchParams.get('suite')
    const qs = new URLSearchParams()
    if (address) qs.set('address', address)
    if (suite != null) qs.set('suite', suite)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const res = await fetch(`${API_BASE}/api/diagnostics${suffix}`, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[proxy diagnostics]', e)
    return NextResponse.json({ error: 'Failed to fetch diagnostics' }, { status: 500 })
  }
}
