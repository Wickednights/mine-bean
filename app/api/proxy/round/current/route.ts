import { NextResponse } from 'next/server'

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.toString()
    const url = `${API_BASE}/api/round/current${query ? `?${query}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[proxy round current]', e)
    return NextResponse.json({ roundId: '0', error: 'Failed to fetch' })
  }
}
