import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createPublicClient, http, fallback, parseAbi } from 'viem'
import { bsc } from 'viem/chains'

const WEBHOOK_URL = process.env.DISCORD_BEANPOT_WEBHOOK_URL!
const CRON_SECRET = process.env.CRON_SECRET
const BEAN_ADDRESS = '0x5c72992b83E74c4D5200A8E8920fB946214a5A5D'
const GRID_MINING = '0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0' as `0x${string}`

const publicClient = createPublicClient({
  chain: bsc,
  transport: fallback([
    http('https://omniscient-icy-crater.bsc.quiknode.pro/f7d76ecdce6f15d4ef95d029c848eee09ae547f7/'),
    http('https://bsc-dataseed.binance.org'),
    http('https://bsc-dataseed1.defibit.io'),
    http('https://bsc-dataseed1.ninicoin.io'),
  ]),
})

const ROUND_SETTLED = parseAbi([
  'event RoundSettled(uint64 indexed roundId, uint8 winningBlock, address topMiner, uint256 totalWinnings, uint256 topMinerReward, uint256 beanpotAmount, bool isSplit, uint256 topMinerSeed, uint256 winnersDeployed)',
])

async function getBeanPrice(): Promise<number> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${BEAN_ADDRESS}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`DexScreener ${res.status}`)
  const data = await res.json()
  const pairs: Array<{ priceUsd: string; liquidity?: { usd: number } }> = data.pairs ?? []
  if (!pairs.length) throw new Error('No BEAN pairs found on DexScreener')
  const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  return parseFloat(best.priceUsd)
}

async function postBeanpotEmbed(
  roundId: number,
  winningBlock: number,
  beanAmount: number,
  beanUsd: number
) {
  const embed = {
    title: `☕ BEANPOT — Round #${roundId}`,
    description: `**Block #${winningBlock}** just hit the beanpot!`,
    color: 0xffd700,
    fields: [
      { name: '🫘 Total BEAN', value: beanAmount.toFixed(3), inline: false },
      { name: '💵 USD Value', value: `~$${(beanUsd * beanAmount).toFixed(2)}`, inline: false },
    ],
    footer: { text: 'minebean.io' },
    timestamp: new Date().toISOString(),
    url: 'https://minebean.io',
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })

  if (!res.ok) throw new Error(`Discord webhook failed: ${await res.text()}`)
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!WEBHOOK_URL) {
    return NextResponse.json({ error: 'DISCORD_BEANPOT_WEBHOOK_URL not set' }, { status: 500 })
  }

  // Test mode — hit /api/cron/beanpot?test=true
  const url = new URL(req.url)
  if (url.searchParams.get('test') === 'true') {
    const beanUsd = await getBeanPrice()
    await postBeanpotEmbed(9999, 16, 30.921, beanUsd)
    return NextResponse.json({ ok: true, test: true, beanUsd })
  }

  try {
    const beanUsd = await getBeanPrice()

    // BSC produces ~1 block per 3 seconds — 100 blocks ≈ 5 minutes of coverage
    const latestBlock = await publicClient.getBlockNumber()
    const fromBlock = latestBlock - BigInt(100)

    const logs = await publicClient.getLogs({
      address: GRID_MINING,
      event: ROUND_SETTLED[0],
      fromBlock,
      toBlock: latestBlock,
    })

    // Only process rounds where a beanpot was triggered
    const beanpotLogs = logs.filter(
      log => log.args.beanpotAmount && log.args.beanpotAmount > BigInt(0)
    )

    let announced = 0

    for (const log of beanpotLogs) {
      const roundId = Number(log.args.roundId)
      const beanAmount = Number(log.args.beanpotAmount!) / 1e18
      const winningBlock = Number(log.args.winningBlock) + 1 // contract is 0-indexed

      // Skip if already announced
      const { data: existing } = await supabase
        .from('beanpot_announcements')
        .select('round_id')
        .eq('round_id', roundId)
        .maybeSingle()

      if (existing) continue

      await postBeanpotEmbed(roundId, winningBlock, beanAmount, beanUsd)

      await supabase.from('beanpot_announcements').insert({ round_id: roundId })
      console.log(`[beanpot cron] Announced beanpot for round #${roundId}`)
      announced++
    }

    return NextResponse.json({ ok: true, announced })
  } catch (e) {
    console.error('[beanpot cron]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
