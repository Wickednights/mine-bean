'use client'

import React, { useState, useEffect, useCallback, useRef } from "react"
import { apiFetch } from "@/lib/api"
import { useSSE } from "@/lib/SSEContext"

interface BlockData {
    id: number
    deployed: string
    deployedFormatted: string
    minerCount: number
}

interface RoundResponse {
    roundId: string
    startTime: number
    endTime: number
    totalDeployed: string
    totalDeployedFormatted: string
    beanpotPool: string
    beanpotPoolFormatted: string
    settled: boolean
    blocks: BlockData[]
    userDeployed?: string
    userDeployedFormatted?: string
}

interface DeployedEvent {
    roundId: string
    user: string
    totalAmount: string
    isAutoMine: boolean
    totalDeployed: string
    totalDeployedFormatted: string
    userDeployed: string
    userDeployedFormatted: string
    blocks: BlockData[]
}

interface RoundSettledEvent {
    roundId: string
    winningBlock: string
    topMiner: string
    totalWinnings: string
    topMinerReward: string
    beanpotAmount: string
    isSplit: boolean
}

interface GameStartedEvent {
    roundId: string
    startTime: number
    endTime: number
    beanpotPool: string
    beanpotPoolFormatted: string
}

interface RoundTransitionEvent {
    settled: RoundSettledEvent | null
    newRound: GameStartedEvent
}

interface CellData {
    minerCount: number
    amount: number
}

interface MiningGridProps {
    selectedBlocks?: number[]
    onBlocksChange?: (blocks: number[]) => void
    userAddress?: string
}

function decodeBlockMask(mask: string): number[] {
    const n = BigInt(mask)
    const blocks: number[] = []
    for (let i = 0; i < 25; i++) {
        if ((n >> BigInt(i)) & BigInt(1)) blocks.push(i)
    }
    return blocks
}

function blocksToGrid(blocks: BlockData[]): CellData[] {
    return Array.from({ length: 25 }, (_, i) => {
        const block = blocks.find((b) => b.id === i)
        return {
            minerCount: block?.minerCount ?? 0,
            amount: block ? parseFloat(block.deployedFormatted) : 0,
        }
    })
}

export default function MiningGrid({
    selectedBlocks: externalSelectedBlocks,
    onBlocksChange,
    userAddress,
}: MiningGridProps) {
    const [internalSelectedBlocks, setInternalSelectedBlocks] = useState<number[]>([])
    const [phase, setPhase] = useState<"counting" | "eliminating" | "winner" | "miners">("counting")
    const [eliminatedBlocks, setEliminatedBlocks] = useState<number[]>([])
    const [winningBlock, setWinningBlock] = useState<number | null>(null)

    const selectedBlocks = externalSelectedBlocks ?? internalSelectedBlocks
    const setSelectedBlocks = (blocks: number[] | ((prev: number[]) => number[])) => {
        const newBlocks = typeof blocks === "function" ? blocks(selectedBlocks) : blocks
        if (onBlocksChange) {
            onBlocksChange(newBlocks)
        } else {
            setInternalSelectedBlocks(newBlocks)
        }
    }

    const [cells, setCells] = useState<CellData[]>(() =>
        Array.from({ length: 25 }, () => ({ minerCount: 0, amount: 0 }))
    )
    const [currentRoundId, setCurrentRoundId] = useState<string>("")
    const [userDeployedBlocks, setUserDeployedBlocks] = useState<Set<number>>(new Set())
    const [hasDeployedThisRound, setHasDeployedThisRound] = useState(false)
    const [autoMode, setAutoMode] = useState<{ enabled: boolean, strategy: "all" | "random" | "select" | null }>({ enabled: false, strategy: null })
const [isAutoMinerActive, setIsAutoMinerActive] = useState(false)
    // Animation state: snapshot freezes grid data so resets can't wipe it mid-animation
    const animatingRef = useRef(false)
    const snapshotCellsRef = useRef<CellData[] | null>(null)
    const snapshotUserDeployedRef = useRef<Set<number> | null>(null)
    const pendingResetRef = useRef<GameStartedEvent | null>(null)
    const pendingAutoMineBlocksRef = useRef<{ roundId: string; blocks: number[] } | null>(null)
    const animationTimers = useRef<ReturnType<typeof setTimeout>[]>([])
    // Keep a mutable ref to cells so the SSE closure always reads the latest value
    const cellsRef = useRef(cells)
    cellsRef.current = cells
    const userDeployedBlocksRef = useRef(userDeployedBlocks)
    userDeployedBlocksRef.current = userDeployedBlocks
    // Keep a mutable ref to userAddress so callbacks always read the latest value
    const userAddressRef = useRef(userAddress)
    userAddressRef.current = userAddress
    const currentRoundIdRef = useRef(currentRoundId)
    currentRoundIdRef.current = currentRoundId

    const clearAnimationTimers = useCallback(() => {
        animationTimers.current.forEach(clearTimeout)
        animationTimers.current = []
    }, [])

    const resetForNewRound = useCallback((eventData?: GameStartedEvent | null) => {
        clearAnimationTimers()
        snapshotCellsRef.current = null
        snapshotUserDeployedRef.current = null
        setPhase("counting")
        setEliminatedBlocks([])
        setWinningBlock(null)
        setSelectedBlocks([])
        setCells(Array.from({ length: 25 }, () => ({ minerCount: 0, amount: 0 })))
        setUserDeployedBlocks(new Set())
        setHasDeployedThisRound(false)
        animatingRef.current = false
        pendingResetRef.current = null
        window.dispatchEvent(new CustomEvent("settlementComplete"))

        if (eventData) {
            setCurrentRoundId(eventData.roundId)
            window.dispatchEvent(
                new CustomEvent("roundData", { detail: eventData })
            )
            // Apply any AutoMiner blocks that arrived during the animation (fixes Random strategy not showing selections)
            const pending = pendingAutoMineBlocksRef.current
            if (pending && String(pending.roundId) === String(eventData.roundId) && pending.blocks.length > 0) {
                setUserDeployedBlocks(new Set(pending.blocks))
                setHasDeployedThisRound(true)
                pendingAutoMineBlocksRef.current = null
            }
        }

        // Re-fetch current round to pick up any deployments that arrived during the animation
        const fetchUrl = userAddressRef.current
            ? `/api/round/current?user=${userAddressRef.current}`
            : '/api/round/current'
        apiFetch<RoundResponse>(fetchUrl)
            .then((round) => {
                if (animatingRef.current) return
                setCells(blocksToGrid(round.blocks))
                window.dispatchEvent(
                    new CustomEvent("roundData", { detail: round })
                )
            })
            .catch((err) => console.error('Failed to refresh round after animation:', err))
        // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelectedBlocks and other setters are stable
    }, [clearAnimationTimers])

    // Fetch initial round state
    useEffect(() => {
        const url = userAddress
            ? `/api/round/current?user=${userAddress}`
            : '/api/round/current'
        apiFetch<RoundResponse>(url)
            .then((round) => {
                if (animatingRef.current) return
                setCells(blocksToGrid(round.blocks))
                setCurrentRoundId(round.roundId)
                window.dispatchEvent(
                    new CustomEvent("roundData", { detail: round })
                )
            })
            .catch((err) => console.error('Failed to load round:', err))
    }, [userAddress])

    // Polling fallback: when SSE misses roundTransition (e.g. REST reset, connection drop), poll every 15s
    useEffect(() => {
        const POLL_INTERVAL_MS = 15000
        const interval = setInterval(() => {
            if (animatingRef.current) return
            const url = userAddressRef.current
                ? `/api/round/current?user=${userAddressRef.current}`
                : '/api/round/current'
            apiFetch<RoundResponse>(url)
                .then((round) => {
                    if (animatingRef.current) return
                    if (currentRoundIdRef.current !== round.roundId) {
                        setCells(blocksToGrid(round.blocks))
                        setCurrentRoundId(round.roundId)
                        window.dispatchEvent(
                            new CustomEvent("roundData", { detail: round })
                        )
                    }
                })
                .catch(() => { /* ignore */ })
        }, POLL_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [])

    // Fetch user's deployed blocks for the current round
    useEffect(() => {
        if (!userAddress || !currentRoundId) return
        apiFetch<{ history: Array<{ roundId: number, blockMask: string }> }>(
            `/api/user/${userAddress}/history?type=deploy&roundId=${currentRoundId}`
        ).then(data => {
            const blocks = new Set<number>()
            for (const entry of data.history) {
                for (const id of decodeBlockMask(entry.blockMask)) {
                    blocks.add(id)
                }
            }
            setUserDeployedBlocks(blocks)
            if (blocks.size > 0) setHasDeployedThisRound(true)
        }).catch(() => {})
    }, [userAddress, currentRoundId])

    // Listen for optimistic deploy updates from page.tsx
    useEffect(() => {
        const handleUserDeployed = (event: CustomEvent) => {
            const { blockIds } = event.detail as { blockIds: number[] }
            setUserDeployedBlocks(prev => {
                const next = new Set(prev)
                blockIds.forEach(id => next.add(id))
                return next
            })
            // One deploy per round — lock the grid after deploy
            setHasDeployedThisRound(true)
            setSelectedBlocks([])
            window.dispatchEvent(new CustomEvent("blocksChanged", {
                detail: { blocks: [], count: 0 }
            }))
        }
        window.addEventListener("userDeployed" as any, handleUserDeployed)
        return () => window.removeEventListener("userDeployed" as any, handleUserDeployed)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelectedBlocks is stable, defined once per component
    }, [])

    // Subscribe to user SSE for AutoMiner deployments via centralized SSE context
    const { subscribeUser, subscribeGlobal } = useSSE()

    useEffect(() => {
        return subscribeUser('autoMineExecuted', (data) => {
            const d = data as { roundId: number | string; blocks?: number[]; roundsExecuted: number }
            if (!d.blocks || d.blocks.length === 0) return
            const roundStr = String(d.roundId)
            // Store for resetForNewRound in case we're mid-animation (fixes Random strategy not showing selections)
            pendingAutoMineBlocksRef.current = { roundId: roundStr, blocks: d.blocks }
            // If we're already in this round, apply immediately
            if (currentRoundIdRef.current === roundStr) {
                setUserDeployedBlocks(prev => {
                    const next = new Set(prev)
                    d.blocks!.forEach(id => next.add(id))
                    return next
                })
                setHasDeployedThisRound(true)
                setSelectedBlocks([])
                window.dispatchEvent(new CustomEvent("blocksChanged", {
                    detail: { blocks: [], count: 0 }
                }))
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelectedBlocks is stable, defined once per component
    }, [subscribeUser])

    // Subscribe to global SSE events for live updates via centralized SSE context
    useEffect(() => {
        const unsubDeployed = subscribeGlobal('deployed', (data) => {
            if (animatingRef.current) return
            const d = data as DeployedEvent
setCells(blocksToGrid(d.blocks))
            // If this is the connected user's AutoMiner deployment, fetch their blocks
            // This handles the race condition where user SSE may not be connected yet
            if (d.isAutoMine && userAddressRef.current &&
                d.user.toLowerCase() === userAddressRef.current.toLowerCase()) {
                apiFetch<{ history: Array<{ blockMask: string }> }>(
                    `/api/user/${userAddressRef.current}/history?type=deploy&roundId=${d.roundId}&limit=1`
                ).then((res) => {
                    if (res.history[0]?.blockMask) {
                        const blockIds = decodeBlockMask(res.history[0].blockMask)
                        if (blockIds.length > 0) {
                            setUserDeployedBlocks(prev => {
                                const next = new Set(prev)
                                blockIds.forEach(id => next.add(id))
                                return next
                            })
                            setHasDeployedThisRound(true)
                            setSelectedBlocks([])
                            window.dispatchEvent(new CustomEvent("blocksChanged", {
                                detail: { blocks: [], count: 0 }
                            }))
                        }
                    }
                }).catch(() => {})
            }

            window.dispatchEvent(new CustomEvent("roundDeployed", {
                detail: {
                    totalDeployed: d.totalDeployed,
                    totalDeployedFormatted: d.totalDeployedFormatted,
                    user: d.user,
                    userDeployedFormatted: d.userDeployedFormatted,
                }
            }))
        })

        // Combined handler for round transitions (replaces separate roundSettled + gameStarted)
        const unsubTransition = subscribeGlobal('roundTransition', (data) => {
            const { settled, newRound } = data as RoundTransitionEvent

            // Buffer the new round data — do NOT dispatch roundData here; wait until grid resets
            // so the countdown doesn't start until the grid is playable
            pendingResetRef.current = newRound

            if (settled) {
                // Round had deployments — run settlement animation
                const winner = parseInt(settled.winningBlock, 10)
                clearAnimationTimers()

                // Freeze current grid data and user's deployed blocks so they persist during animation
                snapshotCellsRef.current = [...cellsRef.current]
                snapshotUserDeployedRef.current = new Set(userDeployedBlocksRef.current)
                animatingRef.current = true
                setPhase("eliminating")
                setWinningBlock(winner)

                // Eliminate blocks one by one over 1.5s, then show winner 1.5s
                const ELIMINATION_MS = 1500
                const WINNER_DISPLAY_MS = 1500
                const toEliminate = Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== winner)
                toEliminate.sort(() => Math.random() - 0.5)

                const intervalTime = ELIMINATION_MS / toEliminate.length
                let eliminated: number[] = []

                toEliminate.forEach((blockIndex, i) => {
                    const tid = setTimeout(() => {
                        eliminated = [...eliminated, blockIndex]
                        setEliminatedBlocks([...eliminated])
                    }, intervalTime * (i + 1))
                    animationTimers.current.push(tid)
                })

                // Show winner phase after elimination finishes
                animationTimers.current.push(
                    setTimeout(() => setPhase("winner"), ELIMINATION_MS + 200)
                )

                // After winner display, reset for the new round and dispatch roundData (timer starts then)
                animationTimers.current.push(
                    setTimeout(() => {
                        resetForNewRound(pendingResetRef.current)
                    }, ELIMINATION_MS + WINNER_DISPLAY_MS + 200)
                )

                window.dispatchEvent(
                    new CustomEvent("roundSettled", { detail: settled })
                )
            } else {
                // Empty round — reset immediately (no settlement animation)
                resetForNewRound(newRound)
            }
        })

        return () => {
            unsubDeployed()
            unsubTransition()
            clearAnimationTimers()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelectedBlocks is stable, defined once per component
    }, [subscribeGlobal, resetForNewRound, clearAnimationTimers])

    // Listen for select-all from sidebar controls
    useEffect(() => {
        const handleSelectAll = (event: CustomEvent) => {
            if (hasDeployedThisRound) return
            const { selectAll } = event.detail
            if (selectAll) {
                const allBlocks = Array.from({ length: 25 }, (_, i) => i)
                    .filter(i => !userDeployedBlocks.has(i))
                setSelectedBlocks(allBlocks)
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: allBlocks, count: allBlocks.length } }))
            } else {
                setSelectedBlocks([])
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: [], count: 0 } }))
            }
        }

        window.addEventListener("selectAllBlocks" as any, handleSelectAll)
        return () => window.removeEventListener("selectAllBlocks" as any, handleSelectAll)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hasDeployedThisRound, userDeployedBlocks, and setSelectedBlocks are stable
    }, [])

    // Listen for autoMinerMode from sidebar controls
    useEffect(() => {
        const handleAutoMode = (event: CustomEvent) => {
            const { enabled, strategy } = event.detail
            setAutoMode({ enabled, strategy })
            if (enabled && strategy === "all") {
                // Select all 25 blocks
                const allBlocks = Array.from({ length: 25 }, (_, i) => i).filter(i => !userDeployedBlocks.has(i))
                setSelectedBlocks(allBlocks)
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: allBlocks, count: allBlocks.length } }))
            } else if (enabled && strategy === "select") {
                // Allow user to pick blocks on grid — clear previous selection
                setSelectedBlocks([])
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: [], count: 0 } }))
            } else {
                // Clear selection for random or manual mode
                setSelectedBlocks([])
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: [], count: 0 } }))
            }
        }

        window.addEventListener("autoMinerMode" as any, handleAutoMode)
        return () => window.removeEventListener("autoMinerMode" as any, handleAutoMode)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelectedBlocks is stable, defined once per component
    }, [userDeployedBlocks])
    useEffect(() => {
        const handleActivated = () => setIsAutoMinerActive(true)
        const handleStopped = () => setIsAutoMinerActive(false)
        window.addEventListener("autoMinerActivated", handleActivated)
        window.addEventListener("autoMinerStopped", handleStopped)
        return () => {
            window.removeEventListener("autoMinerActivated", handleActivated)
            window.removeEventListener("autoMinerStopped", handleStopped)
        }
    }, [])

    // Restore grid selection when page loads with active AutoMiner "select" strategy
    useEffect(() => {
        const handleBlocksRestored = (event: CustomEvent<{ blocks: number[] }>) => {
            const blocks = event.detail?.blocks ?? []
            if (blocks.length > 0) {
                setSelectedBlocks(blocks)
                window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks, count: blocks.length } }))
            }
        }
        window.addEventListener("autoMinerBlocksRestored" as any, handleBlocksRestored)
        return () => window.removeEventListener("autoMinerBlocksRestored" as any, handleBlocksRestored)
    }, [])

    const handleBlockClick = (index: number) => {
        if (autoMode.enabled && autoMode.strategy !== "select") return  // Allow clicks in select mode
        if (phase !== "counting") return
        if (hasDeployedThisRound) return
        if (userDeployedBlocks.has(index)) return
        const newSelection = selectedBlocks.includes(index)
            ? selectedBlocks.filter((i) => i !== index)
            : [...selectedBlocks, index]
        setSelectedBlocks(newSelection)
        window.dispatchEvent(new CustomEvent("blocksChanged", { detail: { blocks: newSelection, count: newSelection.length } }))
    }

    // During animation, render from the frozen snapshot so resets don't wipe visible data
    const displayCells = snapshotCellsRef.current ?? cells

    return (
        <div className="mining-grid-container" style={styles.container}>
            <div className="mining-grid" style={styles.grid}>
                {displayCells.map((cell, index) => {
                    const isSelected = selectedBlocks.includes(index)
                    const isWinner = winningBlock === index
                    const isEliminated = eliminatedBlocks.includes(index)
                    // Use snapshot during elimination so deployed blocks stay highlighted
                    const isDeployed = animatingRef.current && snapshotUserDeployedRef.current
                        ? snapshotUserDeployedRef.current.has(index)
                        : userDeployedBlocks.has(index)

                    return (
                        <button
                            key={index}
                            className="mining-cell"
                            style={{
                                ...styles.cell,
                                ...(isDeployed && !isEliminated ? styles.cellDeployed : {}),
                                ...(isSelected && !isEliminated && !isDeployed ? styles.cellSelected : {}),
                                ...(isEliminated ? styles.cellEliminated : {}),
                                ...(isWinner && phase === "winner" ? styles.cellWinner : {}),
...(isAutoMinerActive && !isDeployed ? styles.cellDisabled : {}),                            }}
                            onClick={() => handleBlockClick(index)}
disabled={phase !== "counting" || isDeployed || hasDeployedThisRound || isAutoMinerActive}                        >
                            {!isEliminated && (
                                <>
                                    <div className="cell-header" style={styles.cellHeader}>
                                        <span className="cell-id" style={styles.cellId}>#{index + 1}</span>
                                        {false && isDeployed ? (
                                            <span style={styles.deployedCheck}>✓</span>
                                        ) : cell.minerCount > 0 ? (
                                            <span style={styles.minerCount}>{cell.minerCount}</span>
                                        ) : null}
                                    </div>
                                    <div className="cell-amount" style={styles.cellAmount}>
                                        {cell.amount > 0 ? cell.amount.toFixed(4) : '—'}
                                    </div>
                                </>
                            )}
                        </button>
                    )
                })}
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .mining-grid-container {
                        width: 100% !important;
                        overflow: hidden !important;
                        max-width: none !important;
                    }

                    .mining-grid {
                        grid-template-columns: repeat(5, 1fr) !important;
                        gap: 6px !important;
                        width: 100% !important;
                        max-width: none !important;
                    }

                    .mining-cell {
                        min-height: unset !important;
                        aspect-ratio: 1 !important;
                        padding: 6px !important;
                        border-radius: 8px !important;
                    }

                    .cell-id {
                        font-size: 10px !important;
                    }

                    .cell-amount {
                        font-size: 12px !important;
                    }
                }
            `}</style>
        </div>
    )
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        fontFamily: "'Inter', -apple-system, sans-serif",
        width: "100%",
        maxWidth: "710px",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "10px",
        width: "100%",
        maxWidth: "710px",
    },
    cell: {
        aspectRatio: "1",
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "10px",
        padding: "14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "inherit",
        position: "relative",
        transition: "border-color 0.15s",
        outline: "none",
    },
    cellSelected: {
        border: "2px solid rgba(240, 185, 11, 0.7)", background: "rgba(240, 185, 11, 0.12)", boxShadow: "0 0 24px rgba(240, 185, 11, 0.25), inset 0 0 24px rgba(240, 185, 11, 0.08)",
    },
    cellDeployed: {
        background: "rgba(34, 197, 94, 0.10)",
        boxShadow: "0 0 24px rgba(34, 197, 94, 0.2), inset 0 0 24px rgba(34, 197, 94, 0.06)",
        border: "2px solid rgba(34, 197, 94, 0.6)",
        cursor: "default",
        transition: "all 0.3s ease",
        
    },
    deployedCheck: {
        fontSize: "12px",
        fontWeight: 700,
        color: "#4a9a4a",
    },
    cellEliminated: {
        opacity: 0.2,
        transform: "scale(0.95)",
        border: "1px solid rgba(255, 255, 255, 0.04)",
    },
    cellWinner: {
        border: "1.5px solid rgba(255, 215, 0, 0.7)", background: "rgba(255, 215, 0, 0.08)",
        boxShadow: "0 0 30px rgba(255, 215, 0, 0.25), inset 0 0 30px rgba(255, 215, 0, 0.08)",
    },
    cellDisabled: {
        opacity: 0.5,
        cursor: "not-allowed",
    },
    cellHeader: {
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    cellId: {
        fontSize: "12px",
        fontWeight: 600,
        color: "#999",
    },
    minerCount: {
        marginLeft: "auto",
        fontSize: "10px",
        fontWeight: 600,
        color: "#aaa",
    },
    cellAmount: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#fff",
        textAlign: "right",
    },
}
