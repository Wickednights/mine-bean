import { NextResponse } from 'next/server'

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = (await params).id
    const res = await fetch(`${API_BASE}/api/round/${id}/miners`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[proxy miners]', e)
    return NextResponse.json({ roundId: 0, winningBlock: 0, miners: [] })
  }
}
