'use client'

import Header from '@/components/Header'
import Link from 'next/link'
import { useAccount, useChainId } from 'wagmi'
import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { formatUnits } from 'viem'

interface DebugData {
  meta?: {
    networkLabel?: string
    chainId?: number
    rpcConfigured?: boolean
    rpcHost?: string | null
  }
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
    servicesConfig?: {
      resetWalletConfigured?: boolean
      autoResetEnabled?: boolean
      executorConfigured?: boolean
      autoMinerExecutorEnabled?: boolean
    }
    autoReset?: {
      lastResetRound?: number
      lastResetError?: string | null
      lastResetSuccessAt?: string | null
      walletAddress?: string | null
      loadError?: string
    } | null
    autoMinerExecutor?: {
      lastExecutedRound?: number
      lastError?: string | null
      executorWallet?: string | null
      loadError?: string
    } | null
    note?: string
  }
  fetchedAt?: string
  error?: string
}

function gridMiningPhaseLabel(gm: NonNullable<DebugData['gridMining']>): string {
  if (gm.error) return ''
  const settled = gm.round?.settled === true
  const tr = gm.roundInfo?.timeRemaining
  if (settled) return 'Settled'
  if (typeof tr === 'number' && tr > 0) return 'Active'
  if (typeof tr === 'number' && tr <= 0 && !settled) return 'Ended · unsettled'
  return '—'
}

function Section({
  title,
  summary,
  data,
  defaultOpen = false,
  jsonStyle,
}: {
  title: string
  summary: React.ReactNode
  data: unknown
  defaultOpen?: boolean
  jsonStyle?: React.CSSProperties
}) {
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
        <pre style={{ ...styles.json, ...jsonStyle }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

interface DiagnosticsPayload {
  meta?: { networkLabel?: string; chainId?: number; addresses?: Record<string, string> }
  rpc?: { ok?: boolean; latencyMs?: number; blockNumber?: number; chainId?: number; error?: string }
  mongo?: { stateLabel?: string; counts?: Record<string, number>; latestRoundDoc?: unknown }
  backend?: unknown
  contractSuites?: {
    summary?: { contracts?: number; totalCalls?: number; totalOk?: number; totalFail?: number }
    suites?: unknown[]
  }
  fetchedAt?: string
  error?: string
}

export default function DebugPage() {
  const { address, isConnected, connector } = useAccount()
  const chainId = useChainId()
  const [data, setData] = useState<DebugData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deepData, setDeepData] = useState<DiagnosticsPayload | null>(null)
  const [deepLoading, setDeepLoading] = useState(false)
  const [deepError, setDeepError] = useState<string | null>(null)

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

  const fetchDeepDiagnostics = useCallback(
    async (suite: '0' | '1') => {
      if (!address) return
      setDeepLoading(true)
      setDeepError(null)
      try {
        const result = await apiFetch<DiagnosticsPayload>(
          `/api/diagnostics?address=${encodeURIComponent(address)}&suite=${suite}`
        )
        setDeepData(result)
      } catch (e) {
        setDeepError(e instanceof Error ? e.message : 'Failed to fetch diagnostics')
        setDeepData(null)
      } finally {
        setDeepLoading(false)
      }
    },
    [address]
  )

  useEffect(() => {
    if (address) fetchDebug()
  }, [address, fetchDebug])

  return (
    <div style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header currentPage="mine" />
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Debug Console</h1>
            <p style={styles.subtitle}>
              {data?.meta
                ? [
                    data.meta.networkLabel ?? 'BSC testnet (Chapel)',
                    data.meta.chainId != null ? `chainId ${data.meta.chainId}` : null,
                    data.meta.rpcHost ? `RPC ${data.meta.rpcHost}` : !data.meta.rpcConfigured ? 'RPC from default seed' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Set CHAIN_ID / NETWORK_LABEL on the backend for accurate labeling (testnet vs mainnet).'}
            </p>
          </div>
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

            <Section
              title="Client (browser · wagmi)"
              summary={
                <span>
                  Wallet chainId {chainId} · connector {connector?.name ?? '—'} · origin{' '}
                  {typeof window !== 'undefined' ? window.location.origin : '—'}
                </span>
              }
              data={{
                chainId,
                address,
                connectorId: connector?.id,
                connectorName: connector?.name,
                origin: typeof window !== 'undefined' ? window.location.origin : null,
                ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
              }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => fetchDeepDiagnostics('1')}
                disabled={deepLoading}
                style={styles.refreshBtn}
              >
                {deepLoading ? 'Loading full suite…' : 'Load full contract read suite'}
              </button>
              <button
                type="button"
                onClick={() => fetchDeepDiagnostics('0')}
                disabled={deepLoading}
                style={{ ...styles.refreshBtn, background: '#333', color: '#F0B90B' }}
              >
                RPC + Mongo + backend only (fast)
              </button>
            </div>
            <Section
              title="Full diagnostics (RPC · Mongo · indexer · every contract view)"
              summary={
                <span>
                  Runs all view/pure methods on GridMining, AutoMiner, Bean, Treasury, Staking (heuristic args). Takes ~10–40s.
                  {deepError ? <span style={{ color: '#f55' }}> {deepError}</span> : null}
                </span>
              }
              data={deepData}
              jsonStyle={{ maxHeight: '70vh' }}
              defaultOpen={Boolean(deepData)}
            />

            {data && (
              <>
                <Section
                  title="GridMining"
                  summary={
                    data.gridMining?.error ? (
                      <span style={{ color: '#f55' }}>{String(data.gridMining.error)}</span>
                    ) : data.gridMining ? (
                      <span>
                        Round {data.gridMining.currentRoundId} · {data.gridMining.roundInfo?.timeRemaining ?? '—'}s left · {gridMiningPhaseLabel(data.gridMining)}
                        {data.gridMining.userRewards ? (
                          <> · Next checkpoint: Round {data.gridMining.userRewards.uncheckpointedRound ?? '—'}</>
                        ) : null}
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
                    data.backendStatus ? (
                      <span>
                        {(() => {
                          const cfg = data.backendStatus.servicesConfig
                          const ar = data.backendStatus.autoReset
                          const am = data.backendStatus.autoMinerExecutor
                          const arErr = ar && typeof ar === 'object' && 'loadError' in ar ? ar.loadError : null
                          const amErr = am && typeof am === 'object' && 'loadError' in am ? am.loadError : null
                          const parts: string[] = []
                          if (cfg) {
                            parts.push(`Reset wallet env: ${cfg.resetWalletConfigured ? 'set' : 'missing'}`)
                            parts.push(`Executor env: ${cfg.executorConfigured ? 'set' : 'missing'}`)
                          }
                          if (arErr) parts.push(`AutoReset module: ${arErr.slice(0, 120)}`)
                          if (amErr) parts.push(`Executor module: ${amErr.slice(0, 120)}`)
                          if (!arErr && ar && typeof ar === 'object' && !('loadError' in ar)) {
                            parts.push(`AutoReset last round ${ar.lastResetRound ?? '—'}`)
                          }
                          if (!amErr && am && typeof am === 'object' && !('loadError' in am)) {
                            parts.push(`Executor last round ${am.lastExecutedRound ?? '—'}`)
                          }
                          return parts.join(' · ')
                        })()}
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
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    margin: '8px 0 0',
    maxWidth: 560,
    lineHeight: 1.4,
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
