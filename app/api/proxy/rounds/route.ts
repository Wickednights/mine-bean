import { NextResponse } from 'next/server'

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.toString()
    const url = `${API_BASE}/api/rounds${query ? `?${query}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[proxy rounds]', e)
    return NextResponse.json({ rounds: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } })
  }
}
