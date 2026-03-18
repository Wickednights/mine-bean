import { NextResponse } from 'next/server'

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/stats/diagnostic`)
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error('[proxy stats/diagnostic]', e)
    return NextResponse.json(
      { error: 'Failed to fetch diagnostic' },
      { status: 500 }
    )
  }
}
