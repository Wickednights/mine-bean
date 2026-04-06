import { NextResponse } from 'next/server'

/** Cache BNB/USD on the Edge/server to avoid browser CORS + CoinGecko rate limits. */
export const revalidate = 60

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
      { next: { revalidate: 60 } }
    )
    if (!res.ok) {
      return NextResponse.json({ usd: null })
    }
    const data = (await res.json()) as { binancecoin?: { usd?: number } }
    const usd = data?.binancecoin?.usd
    if (usd == null || Number.isNaN(Number(usd))) {
      return NextResponse.json({ usd: null })
    }
    return NextResponse.json({ usd: Number(usd) })
  } catch {
    return NextResponse.json({ usd: null })
  }
}
