'use client'

import React, { useState, useEffect } from "react"
import BeanLogo, { BnbLogo } from './BeanLogo'
import { useRoundTimer } from '@/lib/RoundTimerContext'

interface MobileStatsBarProps {
    userAddress?: string
    isConnected?: boolean
    onReset?: () => void
}

export default function MobileStatsBar({ userAddress, isConnected, onReset }: MobileStatsBarProps) {
    const { timeRemaining: timer } = useRoundTimer()
    const [beanpotPool, setBeanpotPool] = useState(0)
    const [totalDeployed, setTotalDeployed] = useState(0)
    const [userDeployed, setUserDeployed] = useState(0)

    // Listen for round data from MiningGrid
    useEffect(() => {
        const handleRoundData = (event: CustomEvent) => {
            const d = event.detail
            if (d.beanpotPoolFormatted) setBeanpotPool(parseFloat(d.beanpotPoolFormatted) || 0)
            if (d.totalDeployedFormatted !== undefined) setTotalDeployed(parseFloat(d.totalDeployedFormatted) || 0)
            if (d.userDeployedFormatted !== undefined) setUserDeployed(parseFloat(d.userDeployedFormatted) || 0)
        }

        const handleRoundDeployed = (event: CustomEvent) => {
            const d = event.detail
            if (d.totalDeployedFormatted) setTotalDeployed(parseFloat(d.totalDeployedFormatted) || 0)
            // Update user deployed if this deployment is from the connected user
            if (d.user && userAddress && d.user.toLowerCase() === userAddress.toLowerCase() && d.userDeployedFormatted) {
                setUserDeployed(parseFloat(d.userDeployedFormatted) || 0)
            }
        }

        window.addEventListener("roundData" as any, handleRoundData)
        window.addEventListener("roundDeployed" as any, handleRoundDeployed)
        return () => {
            window.removeEventListener("roundData" as any, handleRoundData)
            window.removeEventListener("roundDeployed" as any, handleRoundDeployed)
        }
    }, [userAddress])

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }

    return (
        <div style={styles.container}>
            <div style={styles.row}>
                <div style={styles.stat}>
                    <div style={styles.valueRow}>
                        <BeanLogo size={20} />
                        <span style={styles.value}>
                            {beanpotPool > 0 ? beanpotPool.toFixed(1) : '—'}
                        </span>
                    </div>
                    <span style={styles.label}>Beanpot</span>
                </div>
                <div style={styles.stat}>
                    <div style={styles.valueRow}>
                        <span style={styles.value}>{timer === 0 ? "Waiting..." : formatTime(timer)}</span>
                    </div>
                    <span style={styles.label}>Time remaining</span>
                    {timer === 0 && isConnected && onReset && (
                        <button style={styles.resetBtn} onClick={onReset}>
                            Settle & Start Next
                        </button>
                    )}
                </div>
            </div>
            <div style={styles.row}>
                <div style={styles.stat}>
                    <div style={styles.valueRow}>
                        <BnbLogo size={20} />
                        <span style={styles.value}>
                            {totalDeployed > 0 ? totalDeployed.toFixed(4) : '—'}
                        </span>
                    </div>
                    <span style={styles.label}>Total deployed</span>
                </div>
                <div style={styles.stat}>
                    <div style={styles.valueRow}>
                        <BnbLogo size={20} />
                        <span style={styles.value}>{userDeployed > 0 ? userDeployed.toFixed(4) : '—'}</span>
                    </div>
                    <span style={styles.label}>You deployed</span>
                </div>
            </div>
        </div>
    )
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
    },
    stat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '16px 10px',
    },
    valueRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    value: {
        fontSize: '22px',
        fontWeight: 700,
        color: '#fff',
    },
    label: {
        fontSize: '13px',
        color: '#999',
        fontWeight: 500,
    },
    resetBtn: {
        marginTop: 8,
        width: '100%',
        padding: '8px 12px',
        background: 'rgba(240, 185, 11, 0.2)',
        border: '1px solid #F0B90B',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        color: '#F0B90B',
        cursor: 'pointer',
        fontFamily: 'inherit',
    },
    bnbLogo: {
        width: 20,
        height: 20,
        objectFit: 'contain' as const,
    },
}
