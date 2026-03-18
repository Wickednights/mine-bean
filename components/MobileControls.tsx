'use client'

import React, { useState, useEffect } from "react"
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { BnbLogo } from './BeanLogo'
import { MIN_DEPLOY_PER_BLOCK, EXECUTOR_FEE_BPS, EXECUTOR_FLAT_FEE } from '@/lib/contracts'
import { apiFetch } from '@/lib/api'
import { useSSE } from '@/lib/SSEContext'
import { useRoundTimer } from '@/lib/RoundTimerContext'
import { parseEther } from 'viem'

interface AutoMinerState {
    active: boolean
    strategyId: number
    numBlocks: number
    amountPerBlockFormatted: string
    numRounds: number
    roundsExecuted: number
    depositAmountFormatted: string
    costPerRoundFormatted: string
    roundsRemaining: number
    totalRefundableFormatted: string
    selectedBlockMask: number
    selectedBlocks: number[]
}

interface MobileControlsProps {
    userBalance?: number
    isConnected?: boolean
    userAddress?: string
    onDeploy?: (amount: number, blockIds: number[]) => void
    onAutoActivate?: (strategyId: number, numRounds: number, numBlocks: number, depositAmount: bigint, blockMask: number) => void
    onAutoStop?: () => void
}

export default function MobileControls({
    userBalance = 0,
    isConnected = false,
    userAddress,
    onDeploy,
    onAutoActivate,
    onAutoStop,
}: MobileControlsProps) {
    const { openConnectModal } = useConnectModal()
    const [mode, setMode] = useState<"manual" | "auto">("manual")
    const [perBlock, setPerBlock] = useState("0")
    const [selectedBlockCount, setSelectedBlockCount] = useState(0)
    const [selectedBlockIds, setSelectedBlockIds] = useState<number[]>([])

    // Auto mode state
    const [autoBlocks, setAutoBlocks] = useState(1)
    const [autoRounds, setAutoRounds] = useState(1)
    const [blockSelection, setBlockSelection] = useState<"all" | "random" | "select">("all")

    // AutoMiner state from backend
    const [autoMinerState, setAutoMinerState] = useState<AutoMinerState | null>(null)
    const autoMinerActive = autoMinerState?.active === true

    // Round data driven by MiningGrid events
    const { timeRemaining: timer } = useRoundTimer()
    const [_currentRound, setCurrentRound] = useState("")
    const [phase, setPhase] = useState<"counting" | "eliminating" | "winner">("counting")
    const [userDeployed, setUserDeployed] = useState(0)

    // Fetch AutoMiner state from backend
    useEffect(() => {
        if (!userAddress) {
            setAutoMinerState(null)
            return
        }

        const fetchAutoState = () => {
            apiFetch<{
                config: {
                    strategyId: number
                    numBlocks: number
                    amountPerBlockFormatted: string
                    active: boolean
                    numRounds: number
                    roundsExecuted: number
                    depositAmountFormatted: string
                    selectedBlockMask?: number
                    selectedBlocks?: number[]
                }
                costPerRoundFormatted: string
                roundsRemaining: number
                totalRefundableFormatted: string
            }>(`/api/automine/${userAddress}`)
                .then((data) => {
                    setAutoMinerState({
                        active: data.config.active,
                        strategyId: data.config.strategyId,
                        numBlocks: data.config.numBlocks,
                        amountPerBlockFormatted: data.config.amountPerBlockFormatted,
                        numRounds: data.config.numRounds,
                        roundsExecuted: data.config.roundsExecuted,
                        depositAmountFormatted: data.config.depositAmountFormatted,
                        costPerRoundFormatted: data.costPerRoundFormatted,
                        roundsRemaining: data.roundsRemaining,
                        totalRefundableFormatted: data.totalRefundableFormatted,
                        selectedBlockMask: data.config.selectedBlockMask || 0,
                        selectedBlocks: data.config.selectedBlocks || [],
                    })
                    if (data.config.active) {
                        setMode("auto")
                    }
                })
                .catch(() => {})
        }

        fetchAutoState()

        const handleActivated = () => setTimeout(fetchAutoState, 2000)
        const handleStopped = () => setTimeout(fetchAutoState, 2000)
        window.addEventListener("autoMinerActivated", handleActivated)
        window.addEventListener("autoMinerStopped", handleStopped)
        return () => {
            window.removeEventListener("autoMinerActivated", handleActivated)
            window.removeEventListener("autoMinerStopped", handleStopped)
        }
    }, [userAddress])

    // Subscribe to user SSE for real-time AutoMiner updates via centralized SSE context
    const { subscribeUser } = useSSE()

    useEffect(() => {
        const fetchAutoState = () => {
            if (!userAddress) return
            apiFetch<{
                config: {
                    strategyId: number
                    numBlocks: number
                    amountPerBlockFormatted: string
                    active: boolean
                    numRounds: number
                    roundsExecuted: number
                    depositAmountFormatted: string
                    selectedBlockMask?: number
                    selectedBlocks?: number[]
                }
                costPerRoundFormatted: string
                roundsRemaining: number
                totalRefundableFormatted: string
            }>(`/api/automine/${userAddress}`)
                .then((data) => {
                    setAutoMinerState({
                        active: data.config.active,
                        strategyId: data.config.strategyId,
                        numBlocks: data.config.numBlocks,
                        amountPerBlockFormatted: data.config.amountPerBlockFormatted,
                        numRounds: data.config.numRounds,
                        roundsExecuted: data.config.roundsExecuted,
                        depositAmountFormatted: data.config.depositAmountFormatted,
                        costPerRoundFormatted: data.costPerRoundFormatted,
                        roundsRemaining: data.roundsRemaining,
                        totalRefundableFormatted: data.totalRefundableFormatted,
                        selectedBlockMask: data.config.selectedBlockMask || 0,
                        selectedBlocks: data.config.selectedBlocks || [],
                    })
                    // If deactivated, switch back to allow manual mode
                    if (!data.config.active) {
                        setMode("manual")
                    }
                })
                .catch(() => {})
        }

        const unsub1 = subscribeUser('autoMineExecuted', fetchAutoState)
        const unsub2 = subscribeUser('configDeactivated', fetchAutoState)
        const unsub3 = subscribeUser('stopped', fetchAutoState)

        return () => {
            unsub1()
            unsub2()
            unsub3()
        }
    }, [subscribeUser, userAddress])

    useEffect(() => {
        const handleBlocksChanged = (event: CustomEvent) => {
            setSelectedBlockCount(event.detail.count)
            setSelectedBlockIds(event.detail.blocks || [])
        }
        window.addEventListener("blocksChanged" as any, handleBlocksChanged)
        return () => window.removeEventListener("blocksChanged" as any, handleBlocksChanged)
    }, [])

    // Listen for round data from MiningGrid
    useEffect(() => {
        const handleRoundData = (event: CustomEvent) => {
            const d = event.detail
            if (d.roundId) setCurrentRound(d.roundId)
            if (d.userDeployedFormatted !== undefined) setUserDeployed(parseFloat(d.userDeployedFormatted) || 0)
            setPhase("counting")
        }

        const handleRoundDeployed = (event: CustomEvent) => {
            const d = event.detail
            if (d.user && userAddress && d.user.toLowerCase() === userAddress.toLowerCase() && d.userDeployedFormatted) {
                setUserDeployed(parseFloat(d.userDeployedFormatted) || 0)
            }
        }

        const handleRoundSettled = () => {
            setPhase("eliminating")
            setTimeout(() => setPhase("winner"), 5200)
        }

        window.addEventListener("roundData" as any, handleRoundData)
        window.addEventListener("roundDeployed" as any, handleRoundDeployed)
        window.addEventListener("roundSettled" as any, handleRoundSettled)
        return () => {
            window.removeEventListener("roundData" as any, handleRoundData)
            window.removeEventListener("roundDeployed" as any, handleRoundDeployed)
            window.removeEventListener("roundSettled" as any, handleRoundSettled)
        }
    }, [userAddress])

    const handleQuickAmount = (value: number) => {
        const current = parseFloat(perBlock) || 0
        setPerBlock((current + value).toFixed(5))
    }

    const handleAllClick = () => {
        const newSelectAll = selectedBlockCount !== 25
        window.dispatchEvent(new CustomEvent("selectAllBlocks", { detail: { selectAll: newSelectAll } }))
    }

    const handleStrategyChange = (strategy: "all" | "random" | "select") => {
        setBlockSelection(strategy)
        if (strategy === "all") {
            setAutoBlocks(25)
            window.dispatchEvent(new CustomEvent("autoMinerMode", { detail: { enabled: true, strategy: "all" } }))
        } else if (strategy === "random") {
            window.dispatchEvent(new CustomEvent("autoMinerMode", { detail: { enabled: true, strategy: "random" } }))
        } else {
            window.dispatchEvent(new CustomEvent("autoMinerMode", { detail: { enabled: true, strategy: "select" } }))
        }
    }

    // Manual mode calculations
    const perBlockAmount = parseFloat(perBlock) || 0
    const manualTotal = perBlockAmount * selectedBlockCount
    const hasDeployed = userDeployed > 0
    const exceedsBalance = manualTotal > userBalance
    const canDeploy = perBlockAmount >= MIN_DEPLOY_PER_BLOCK && selectedBlockCount > 0 && !exceedsBalance && timer > 0 && phase === "counting" && !hasDeployed

    // Auto mode calculations
    const autoNumBlocks = blockSelection === "all" ? 25 : blockSelection === "select" ? selectedBlockCount : autoBlocks
    const autoTotalBlocks = autoNumBlocks * autoRounds
    // Hybrid fee: contract charges max(percentageFee, flatFee) per round
    const pctFeePerRound = perBlockAmount * autoNumBlocks * EXECUTOR_FEE_BPS / 10000
    const autoTotalDeposit = pctFeePerRound >= EXECUTOR_FLAT_FEE
      ? (perBlockAmount * autoTotalBlocks * (10000 + EXECUTOR_FEE_BPS)) / 10000
      : perBlockAmount * autoTotalBlocks + EXECUTOR_FLAT_FEE * autoRounds
    const autoPerRound = autoRounds > 0 ? autoTotalDeposit / autoRounds : 0
    const exceedsBalanceAuto = autoTotalDeposit > userBalance
    const canActivate = perBlockAmount >= MIN_DEPLOY_PER_BLOCK && autoRounds >= 1 && !exceedsBalanceAuto && (blockSelection !== "select" || selectedBlockCount > 0)

    const handleAutoActivateClick = () => {
        if (!canActivate) return
        const strategyId = blockSelection === "all" ? 1 : blockSelection === "select" ? 2 : 0
        const blockMask = blockSelection === "select" ? selectedBlockIds.reduce((m, id) => m | (1 << id), 0) : 0
        // Use BigInt arithmetic to mirror the contract's integer math exactly,
        // avoiding floating-point rounding that can cause off-by-one-wei reverts.
        const perBlockWei = parseEther(perBlockAmount.toString())
        const flatFeeWei = BigInt(Math.round(EXECUTOR_FLAT_FEE * 1e18))
        const pctFeeWei = perBlockWei * BigInt(autoNumBlocks) * BigInt(EXECUTOR_FEE_BPS) / BigInt(10000)
        const depositAmount = pctFeeWei >= flatFeeWei
            ? perBlockWei * BigInt(autoTotalBlocks) * BigInt(10000 + EXECUTOR_FEE_BPS) / BigInt(10000)
            : perBlockWei * BigInt(autoTotalBlocks) + flatFeeWei * BigInt(autoRounds)
        onAutoActivate?.(strategyId, autoRounds, autoNumBlocks, depositAmount, blockMask)
    }

    return (
        <>
            <div style={styles.container}>
                {/* Mode Toggle — hidden when AutoMiner active */}
                {!autoMinerActive && (
                    <div style={styles.modeToggle}>
                        <button
                            style={{...styles.modeBtn, ...(mode === "manual" ? styles.modeBtnActive : {})}}
                            onClick={() => {
                                setMode("manual")
                                window.dispatchEvent(new CustomEvent("autoMinerMode", { detail: { enabled: false, strategy: null } }))
                            }}
                        >
                            Manual
                        </button>
                        <button
                            style={{...styles.modeBtn, ...(mode === "auto" ? styles.modeBtnActive : {})}}
                            onClick={() => {
                                setMode("auto")
                                window.dispatchEvent(new CustomEvent("autoMinerMode", { detail: { enabled: true, strategy: blockSelection } }))
                            }}
                        >
                            Auto
                        </button>
                    </div>
                )}

                {/* ===== MANUAL MODE ===== */}
                {mode === "manual" && !autoMinerActive && (
                    <>
                        <div style={styles.balanceRow}>
                            <div style={styles.balanceLeft}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#999">
                                    <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                                </svg>
                                <span style={styles.balanceAmount}><BnbLogo size={14} /> {userBalance.toFixed(5)}</span>
                            </div>
                            <div style={styles.quickAmounts}>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(1)}>+1</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.1)}>+0.1</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.01)}>+0.01</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.001)}>+0.001</button>
                            </div>
                        </div>

                        <div style={styles.inputRow}>
                            <div style={styles.inputLeft}>
                                <BnbLogo size={18} />
                                <span style={styles.inputLabel}>BNB</span>
                            </div>
                            <input
                                type="text"
                                style={styles.amountInput}
                                value={perBlock}
                                onChange={(e) => setPerBlock(e.target.value)}
                                onFocus={() => { if (perBlock === "0") setPerBlock("") }}
                                onBlur={() => { if (perBlock === "") setPerBlock("0") }}
                            />
                        </div>

                        <div style={styles.row}>
                            <span style={styles.rowLabel}>Blocks</span>
                            <div style={styles.rowRight}>
                                <button
                                    style={{...styles.allBtn, ...(selectedBlockCount === 25 ? styles.allBtnActive : {})}}
                                    onClick={handleAllClick}
                                >
                                    All
                                </button>
                                <span style={styles.blockCount}>
                                    {selectedBlockCount === 25 ? "x25" : "Select"}
                                </span>
                            </div>
                        </div>

                        <div style={styles.totalRow}>
                            <span style={styles.rowLabel}>Total</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {manualTotal.toFixed(5)}</span>
                        </div>

                        {isConnected ? (
                            <button
                                style={{...styles.deployBtn, ...(canDeploy ? styles.deployBtnActive : styles.deployBtnDisabled)}}
                                onClick={() => onDeploy?.(manualTotal, selectedBlockIds)}
                                disabled={!canDeploy}
                            >
                                {hasDeployed ? "✓ Deployed" : phase === "counting" ? "Deploy" : phase === "eliminating" ? "Settling..." : "Winner!"}
                            </button>
                        ) : (
                            <button style={styles.connectBtn} onClick={openConnectModal}>
                                Connect Wallet
                            </button>
                        )}
                    </>
                )}

                {/* ===== AUTO MODE — CONFIGURE VIEW ===== */}
                {mode === "auto" && !autoMinerActive && (
                    <>
                        <div style={styles.balanceRow}>
                            <div style={styles.balanceLeft}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#999">
                                    <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                                </svg>
                                <span style={styles.balanceAmount}><BnbLogo size={14} /> {userBalance.toFixed(5)}</span>
                            </div>
                            <div style={styles.quickAmounts}>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(1)}>+1</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.1)}>+0.1</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.01)}>+0.01</button>
                                <button style={styles.quickBtn} onClick={() => handleQuickAmount(0.001)}>+0.001</button>
                            </div>
                        </div>

                        <div style={styles.inputRow}>
                            <div style={styles.inputLeft}>
                                <BnbLogo size={18} />
                                <span style={styles.inputLabel}>BNB</span>
                            </div>
                            <input
                                type="text"
                                style={styles.amountInput}
                                value={perBlock}
                                onChange={(e) => setPerBlock(e.target.value)}
                                onFocus={() => { if (perBlock === "0") setPerBlock("") }}
                                onBlur={() => { if (perBlock === "") setPerBlock("0") }}
                            />
                        </div>

                        <div style={styles.row}>
                            <span style={styles.rowLabel}>Strategy</span>
                            <div style={styles.strategyToggle}>
                                <button
                                    style={{ ...styles.strategyBtn, ...(blockSelection === "all" ? styles.strategyBtnActive : {}) }}
                                    onClick={() => handleStrategyChange("all")}
                                >
                                    All
                                </button>
                                <button
                                    style={{ ...styles.strategyBtn, ...(blockSelection === "random" ? styles.strategyBtnActive : {}) }}
                                    onClick={() => handleStrategyChange("random")}
                                >
                                    Random
                                </button>
                                <button
                                    style={{ ...styles.strategyBtn, ...(blockSelection === "select" ? styles.strategyBtnActive : {}) }}
                                    onClick={() => handleStrategyChange("select")}
                                >
                                    Select
                                </button>
                            </div>
                        </div>

                        {blockSelection === "random" && (
                        <div style={styles.autoRow}>
                            <div style={styles.autoRowLeft}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#bbb">
                                    <circle cx="7" cy="7" r="2.5" />
                                    <circle cx="17" cy="7" r="2.5" />
                                    <circle cx="7" cy="17" r="2.5" />
                                    <circle cx="17" cy="17" r="2.5" />
                                </svg>
                                <span style={styles.autoRowLabel}>Blocks</span>
                            </div>
                            <input
                                type="number"
                                min="1"
                                max="25"
                                style={styles.autoInput}
                                value={autoBlocks === 0 ? "" : autoBlocks}
                                onChange={(e) => setAutoBlocks(Math.max(0, Math.min(25, parseInt(e.target.value) || 0)))}
                                onFocus={() => setAutoBlocks(0)}
                                onBlur={() => { if (autoBlocks === 0) setAutoBlocks(1) }}
                            />
                        </div>
                        )}

                        {blockSelection === "select" && (
                        <div style={styles.autoRow}>
                            <div style={styles.autoRowLeft}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#bbb">
                                    <circle cx="7" cy="7" r="2.5" />
                                    <circle cx="17" cy="7" r="2.5" />
                                    <circle cx="7" cy="17" r="2.5" />
                                    <circle cx="17" cy="17" r="2.5" />
                                </svg>
                                <span style={styles.autoRowLabel}>Blocks</span>
                            </div>
                            <span style={{ ...styles.blockCount, color: selectedBlockCount > 0 ? "#fff" : "#666" }}>
                                {selectedBlockCount > 0 ? `x${selectedBlockCount}` : "Tap grid"}
                            </span>
                        </div>
                        )}

                        <div style={styles.autoRow}>
                            <div style={styles.autoRowLeft}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                                    <line x1="4" y1="6" x2="20" y2="6" />
                                    <line x1="4" y1="12" x2="20" y2="12" />
                                    <line x1="4" y1="18" x2="20" y2="18" />
                                </svg>
                                <span style={styles.autoRowLabel}>Rounds</span>
                            </div>
                            <input
                                type="number"
                                min="1"
                                max="100000"
                                style={styles.autoInput}
                                value={autoRounds === 0 ? "" : autoRounds}
                                onChange={(e) => setAutoRounds(Math.max(0, Math.min(100000, parseInt(e.target.value) || 0)))}
                                onFocus={() => setAutoRounds(0)}
                                onBlur={() => { if (autoRounds === 0) setAutoRounds(1) }}
                            />
                        </div>

                        <div style={styles.row}>
                            <span style={styles.rowLabel}>Per round</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {autoPerRound.toFixed(5)}</span>
                        </div>

                        <div style={styles.totalRow}>
                            <span style={styles.rowLabel}>Total deposit</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {autoTotalDeposit.toFixed(5)}</span>
                        </div>

                        {isConnected ? (
                            <button
                                style={{...styles.deployBtn, ...(canActivate ? styles.deployBtnActive : styles.deployBtnDisabled)}}
                                onClick={handleAutoActivateClick}
                                disabled={!canActivate}
                            >
                                Activate AutoMiner
                            </button>
                        ) : (
                            <button style={styles.connectBtn} onClick={openConnectModal}>
                                Connect Wallet
                            </button>
                        )}
                    </>
                )}

                {/* ===== AUTO MODE — ACTIVE VIEW ===== */}
                {autoMinerActive && autoMinerState && (
                    <>
                        <div style={styles.activeHeader}>
                            <span style={styles.activeDot} />
                            <span style={styles.activeTitle}>AutoMiner Active</span>
                        </div>

                        <div style={styles.activeRow}>
                            <span style={styles.rowLabel}>Balance</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {parseFloat(autoMinerState.totalRefundableFormatted).toFixed(5)}</span>
                        </div>

                        <div style={styles.activeRow}>
                            <span style={styles.rowLabel}>Strategy</span>
                            <span style={styles.totalValue}>
                                {autoMinerState.strategyId === 0 ? "Random" : autoMinerState.strategyId === 1 ? "All" : "Select"} x{autoMinerState.numBlocks}
                            </span>
                        </div>

                        <div style={styles.activeRow}>
                            <span style={styles.rowLabel}>Per round</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {parseFloat(autoMinerState.costPerRoundFormatted).toFixed(5)}</span>
                        </div>

                        <div style={styles.activeRow}>
                            <span style={styles.rowLabel}>Rounds</span>
                            <span style={styles.totalValue}>
                                {autoMinerState.roundsExecuted} / {autoMinerState.numRounds}
                            </span>
                        </div>

                        <div style={{...styles.totalRow, borderTop: "1px solid #222"}}>
                            <span style={styles.rowLabel}>Per block</span>
                            <span style={styles.totalValue}><BnbLogo size={14} /> {parseFloat(autoMinerState.amountPerBlockFormatted).toFixed(5)}</span>
                        </div>

                        <button
                            style={styles.stopBtn}
                            onClick={() => onAutoStop?.()}
                        >
                            Stop AutoMiner
                        </button>
                        <div style={styles.stopHint}>Cancel and refund remaining BNB</div>
                    </>
                )}
            </div>
        </>
    )
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "14px",
    },
    modeToggle: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "6px",
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: "8px",
        padding: "4px",
    },
    modeBtn: {
        background: "transparent",
        border: "none",
        borderRadius: "6px",
        padding: "10px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#999",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    modeBtnActive: {
        background: "rgba(255, 255, 255, 0.12)",
        color: "#fff",
    },
    balanceRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    balanceLeft: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
    },
    balanceAmount: {
        color: "#fff",
        fontWeight: 600,
    },
    quickAmounts: {
        display: "flex",
        gap: "6px",
    },
    quickBtn: {
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid #444",
        borderRadius: "6px",
        padding: "5px 10px",
        fontSize: "11px",
        fontWeight: 600,
        color: "#bbb",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    inputRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "8px",
        padding: "10px 12px",
    },
    inputLeft: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    inputLabel: {
        color: "#fff",
        fontSize: "14px",
        fontWeight: 600,
    },
    amountInput: {
        background: "transparent",
        border: "none",
        fontSize: "22px",
        fontWeight: 700,
        color: "#fff",
        textAlign: "right" as const,
        width: "100px",
        fontFamily: "inherit",
        outline: "none",
    },
    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    rowLabel: {
        fontSize: "13px",
        color: "#999",
        fontWeight: 500,
    },
    rowRight: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    allBtn: {
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid #444",
        borderRadius: "6px",
        padding: "5px 14px",
        fontSize: "12px",
        fontWeight: 600,
        color: "#999",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    allBtnActive: {
        background: "rgba(255, 255, 255, 0.15)",
        color: "#fff",
        borderColor: "#888",
    },
    strategyToggle: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: "6px",
        padding: "2px",
    },
    strategyBtn: {
        background: "transparent",
        border: "none",
        borderRadius: "4px",
        padding: "5px 8px",
        fontSize: "11px",
        fontWeight: 600,
        color: "#999",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
    },
    strategyBtnActive: {
        background: "rgba(255, 255, 255, 0.12)",
        color: "#fff",
    },
    blockCount: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#fff",
    },
    totalRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: "8px",
        borderTop: "1px solid #222",
    },
    totalValue: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#fff",
    },
    autoRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "2px 0",
    },
    autoRowLeft: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    autoRowLabel: {
        fontSize: "14px",
        color: "#fff",
        fontWeight: 600,
    },
    autoInput: {
        background: "transparent",
        border: "none",
        fontSize: "20px",
        fontWeight: 700,
        color: "#999",
        textAlign: "right" as const,
        width: "90px",
        fontFamily: "inherit",
        outline: "none",
    },
    deployBtn: {
        width: "100%",
        background: "rgba(255, 255, 255, 0.06)",
        border: "none",
        borderRadius: "8px",
        padding: "12px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#999",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    deployBtnActive: {
        background: "#F0B90B",
        color: "#fff",
        cursor: "pointer",
    },
    deployBtnDisabled: {
        background: "rgba(255, 255, 255, 0.03)",
        color: "#666",
        cursor: "not-allowed",
    },
    connectBtn: {
        width: "100%",
        background: "#F0B90B",
        border: "none",
        borderRadius: "8px",
        padding: "12px",
        fontSize: "14px",
        fontWeight: 700,
        color: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    // Active AutoMiner styles
    activeHeader: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 0",
    },
    activeDot: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "#4ade80",
    },
    activeTitle: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#fff",
    },
    activeRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 0",
    },
    stopBtn: {
        width: "100%",
        background: "#2a1a1a",
        border: "1px solid #442222",
        borderRadius: "8px",
        padding: "12px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#f87171",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    stopHint: {
        fontSize: "11px",
        color: "#999",
        textAlign: "center",
        marginTop: "-4px",
    },
}
