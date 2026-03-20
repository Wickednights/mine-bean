'use client'

import Header from '@/components/Header'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { formatUnits } from 'viem'

interface DebugData {
  gridMining?: {
    currentRoundId?: number
    roundInfo?: { roundId?: number; timeRemaining?: number; isActive?: boolean }
    round?: { startTime?: string; endTime?: string; settled?: boolean; winningBlock?: number; topMiner?: string }
    userRewards?: { pendingETH?: string; pendingETHFormatted?: string; pendingUnroasted?: string; pendingRoasted?: string; uncheckpointedRound?: number }
    minerInfo?: Record<number, { deployedMask?: string; amountPerBlock?: string; checkpointed?: boolean }>
    error?: string
  }
  rewards?: Record<string, unknown> | { error?: string }
  autoMiner?: {
    executorAddress?: string
    activeUserCount?: number
    userInActiveList?: boolean
    lastRoundPlayed?: number
    userState?: { strategyId?: number; numBlocks?: number; numRounds?: number; roundsExecuted?: number; active?: boolean }
    error?: string
  }
  diagnostic?: Record<string, unknown> | { error?: string }
  backendStatus?: {
    autoReset?: { lastResetRound?: number; lastResetError?: string | null; lastResetSuccessAt?: string | null; walletAddress?: string }
    autoMinerExecutor?: { lastExecutedRound?: number; lastError?: string | null; executorWallet?: string }
    note?: string
  }
  fetchedAt?: string
  error?: string
}

function Section({ title, summary, data, defaultOpen = false }: { title: string; summary: React.ReactNode; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={styles.section}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={styles.sectionHeader}
      >
        <span style={styles.sectionTitle}>{title}</span>
        <span style={styles.sectionToggle}>{open ? '−' : '+'}</span>
      </button>
      {summary && <div style={styles.summary}>{summary}</div>}
      {open && (
        <pre style={styles.json}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function DebugPage() {
  const { address, isConnected } = useAccount()
  const [data, setData] = useState<DebugData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDebug = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<DebugData>(`/api/debug?address=${encodeURIComponent(address)}`)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (address) fetchDebug()
  }, [address, fetchDebug])

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header currentPage="mine" />
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Debug Console</h1>
          <Link href="/" style={styles.backLink}>← Back to Mine</Link>
        </div>

        {!isConnected ? (
          <div style={styles.message}>
            Connect your wallet to view debug data for your address.
          </div>
        ) : error ? (
          <div style={styles.error}>
            {error}
            <button type="button" onClick={fetchDebug} style={styles.refreshBtn}>Retry</button>
          </div>
        ) : (
          <>
            <div style={styles.toolbar}>
              <span style={styles.address}>{address}</span>
              <button
                type="button"
                onClick={fetchDebug}
                disabled={loading}
                style={styles.refreshBtn}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {data && (
              <>
                <Section
                  title="GridMining"
                  summary={
                    data.gridMining?.error ? (
                      <span style={{ color: '#f55' }}>{String(data.gridMining.error)}</span>
                    ) : data.gridMining ? (
                      <span>
                        Round {data.gridMining.currentRoundId} · {data.gridMining.roundInfo?.timeRemaining ?? '—'}s left · {data.gridMining.round?.settled ? 'Settled' : 'Active'}
                        {data.gridMining.userRewards && (
                          <> · Next checkpoint: Round {data.gridMining.userRewards.uncheckpointedRound ?? '—'}</>
                        )}
                      </span>
                    ) : null
                  }
                  data={data.gridMining}
                  defaultOpen
                />

                <Section
                  title="Rewards"
                  summary={(() => {
                    const r = data.rewards
                    if (r && typeof r === 'object' && 'error' in r && r.error) {
                      return <span style={{ color: '#f55' }}>{String(r.error)}</span>
                    }
                    if (r && typeof r === 'object') {
                      const rr = r as {
                        pendingETHFormatted?: string
                        pendingBEAN?: {
                          grossFormatted?: string
                          unroasted?: string
                          roasted?: string
                        }
                      }
                      let beanGross = rr.pendingBEAN?.grossFormatted
                      if (beanGross == null || beanGross === '') {
                        try {
                          const u = BigInt(rr.pendingBEAN?.unroasted ?? '0')
                          const ro = BigInt(rr.pendingBEAN?.roasted ?? '0')
                          beanGross = formatUnits(u + ro, 18)
                        } catch {
                          beanGross = '0'
                        }
                      }
                      return (
                        <span>
                          Pending: {rr.pendingETHFormatted ?? '0'} BNB · {beanGross} BNBEAN (gross)
                        </span>
                      )
                    }
                    return null
                  })()}
                  data={data.rewards}
                />

                <Section
                  title="AutoMiner"
                  summary={
                    data.autoMiner?.error ? (
                      <span style={{ color: '#f55' }}>{String(data.autoMiner.error)}</span>
                    ) : data.autoMiner ? (
                      <span>
                        Executor: {data.autoMiner.executorAddress?.slice(0, 10)}... · In active list: {data.autoMiner.userInActiveList ? 'Yes' : 'No'} · lastRoundPlayed: {data.autoMiner.lastRoundPlayed ?? '—'} · Active: {data.autoMiner.userState?.active ? 'Yes' : 'No'}
                      </span>
                    ) : null
                  }
                  data={data.autoMiner}
                />

                <Section
                  title="Diagnostic"
                  summary={(() => {
                    const d = data.diagnostic
                    if (d && typeof d === 'object' && 'error' in d && d.error) {
                      return <span style={{ color: '#f55' }}>{String(d.error)}</span>
                    }
                    if (d && typeof d === 'object') {
                      const dd = d as { minterMatchesGridMining?: boolean; beanAddressMatch?: boolean }
                      return (
                        <span>
                          BNBEAN mint: {dd.minterMatchesGridMining ? 'OK' : 'Mismatch'} · Bean match: {dd.beanAddressMatch ? 'OK' : 'Mismatch'}
                        </span>
                      )
                    }
                    return null
                  })()}
                  data={data.diagnostic}
                />

                <Section
                  title="Backend Status"
                  summary={
                    data.backendStatus?.note ? (
                      <span style={{ color: '#888' }}>{data.backendStatus.note}</span>
                    ) : data.backendStatus ? (
                      <span>
                        AutoReset: last round {data.backendStatus.autoReset?.lastResetRound ?? '—'} {data.backendStatus.autoReset?.lastResetError ? `· Error: ${data.backendStatus.autoReset.lastResetError.slice(0, 50)}...` : ''}
                        {' · '}
                        AutoMiner: last round {data.backendStatus.autoMinerExecutor?.lastExecutedRound ?? '—'} {data.backendStatus.autoMinerExecutor?.lastError ? `· Error: ${data.backendStatus.autoMinerExecutor.lastError.slice(0, 50)}...` : ''}
                      </span>
                    ) : null
                  }
                  data={data.backendStatus}
                />

                <div style={{ fontSize: 11, color: '#666', marginTop: 16 }}>
                  Fetched at {data.fetchedAt}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px 40px 60px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  backLink: {
    color: '#F0B90B',
    textDecoration: 'none',
    fontSize: 14,
  },
  message: {
    padding: 24,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    border: '1px solid #333',
    color: '#888',
  },
  error: {
    padding: 24,
    background: 'rgba(255,80,80,0.1)',
    borderRadius: 12,
    border: '1px solid #f55',
    color: '#f55',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  address: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
  },
  refreshBtn: {
    padding: '8px 16px',
    background: '#F0B90B',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  section: {
    marginBottom: 16,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    border: '1px solid #222',
    overflow: 'hidden',
  },
  sectionHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 14,
  },
  sectionTitle: {
    fontWeight: 600,
  },
  sectionToggle: {
    fontSize: 18,
    color: '#888',
  },
  summary: {
    padding: '0 16px 12px',
    fontSize: 12,
    color: '#aaa',
  },
  json: {
    margin: 0,
    padding: 16,
    background: 'rgba(0,0,0,0.3)',
    fontSize: 11,
    color: '#ccc',
    overflow: 'auto',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
}
