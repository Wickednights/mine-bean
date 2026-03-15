'use client'
import BeanLogo, { BnbLogo } from './BeanLogo'

import React from "react"
import { useUserData } from '@/lib/UserDataContext'

interface ClaimRewardsProps {
  userAddress?: string
  onClaimETH: () => void
  onClaimBEAN: () => void
  onCheckpoint?: (roundId: number) => void
  isCheckpointing?: boolean
}

export default function ClaimRewards({ userAddress, onClaimETH, onClaimBEAN, onCheckpoint, isCheckpointing }: ClaimRewardsProps) {
  // Shared rewards data from context (no local fetching)
  const { rewards } = useUserData()

  if (!userAddress) return null

  // Always show the Rewards card when connected so users know where to claim
  const hasETH = rewards?.pendingETH !== "0" && rewards?.pendingETH !== undefined
  const hasBEAN = rewards?.pendingBEAN?.gross !== "0" && rewards?.pendingBEAN?.gross !== undefined
  const hasUnroasted = (rewards?.pendingBEAN?.unroasted ?? "0") !== "0"
  const hasRoasted = (rewards?.pendingBEAN?.roasted ?? "0") !== "0"
  const uncheckpointedRound = rewards?.uncheckpointedRound ? parseInt(rewards.uncheckpointedRound, 10) : 0
  const needsCheckpoint = uncheckpointedRound > 0 && onCheckpoint

  return (
    <div style={styles.card}>
      <div style={styles.header}>Rewards</div>

      <div style={styles.rows}>
        <div style={styles.row}>
          <div style={styles.rowLabel}>
            <BnbLogo size={16} />
            <span>BNB Rewards</span>
          </div>
          <div style={{ ...styles.rowValue, color: hasETH ? "#fff" : "#555" }}>
            {rewards ? parseFloat(rewards.pendingETHFormatted || "0").toFixed(6) : "0.000000"} BNB
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.rowLabel}>
            <BeanLogo size={16} />
            <span>Unroasted BNBEAN</span>
          </div>
          <div style={{ ...styles.rowValue, color: hasUnroasted ? "#fff" : "#555" }}>
            {rewards ? parseFloat(rewards.pendingBEAN?.unroastedFormatted || "0").toFixed(4) : "0.0000"} BNBEAN
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.rowLabel}>
            <BeanLogo size={16} />
            <span>Roasted BNBEAN</span>
          </div>
          <div style={{ ...styles.rowValue, color: hasRoasted ? "#fff" : "#555" }}>
            {rewards ? parseFloat(rewards.pendingBEAN?.roastedFormatted || "0").toFixed(4) : "0.0000"} BNBEAN
          </div>
        </div>
      </div>

      {needsCheckpoint && (
        <div style={{ marginBottom: 12 }}>
          <button
            style={styles.btnActive}
            disabled={isCheckpointing}
            onClick={() => onCheckpoint(uncheckpointedRound)}
          >
            {isCheckpointing ? 'Checkpointing...' : `Checkpoint Round ${uncheckpointedRound} (required before claim)`}
          </button>
        </div>
      )}
      <div style={styles.buttons}>
        <button
          style={hasBEAN ? styles.btnActive : styles.btnDisabled}
          disabled={!hasBEAN}
          onClick={onClaimBEAN}
        >
          Claim BNBEAN
        </button>
        <button
          style={hasETH ? styles.btnActive : styles.btnDisabled}
          disabled={!hasETH}
          onClick={onClaimETH}
        >
          Claim BNB
        </button>
      </div>
      {needsCheckpoint && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          You won a round. Checkpoint first to add rewards to your balance, then claim.
        </div>
      )}
      {hasBEAN && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          Claim BNBEAN sends BNBEAN to your wallet. Add the token in MetaMask if it doesn&apos;t appear.
        </div>
      )}
      {(!rewards || (!hasETH && !hasBEAN && !needsCheckpoint)) && (
        <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
          Win a round to earn rewards. Click &quot;Claim BNBEAN&quot; or &quot;Claim BNB&quot; when you have pending rewards.
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    background: "rgba(255, 255, 255, 0.04)", backdropFilter: "blur(20px)",
    border: "1px solid #222",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  header: {
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 12,
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#888",
  },
  rowValue: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  buttons: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },
  btnActive: {
    flex: 1,
    padding: "10px 0",
    background: "#F0B90B",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnDisabled: {
    flex: 1,
    padding: "10px 0",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#555",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "default",
  },
}
