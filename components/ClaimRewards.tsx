'use client'
import BeanLogo, { BnbLogo } from './BeanLogo'
import { CONTRACTS } from '@/lib/contracts'

import React, { useState } from "react"
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
  const { rewards, refetchRewards } = useUserData()
  const [manualRound, setManualRound] = useState('')

  if (!userAddress) return null

  // Always show the Rewards card when connected so users know where to claim
  const hasETH = rewards?.pendingETH !== "0" && rewards?.pendingETH !== undefined
  const hasBEAN = rewards?.pendingBEAN?.gross !== "0" && rewards?.pendingBEAN?.gross !== undefined
  const hasUnroasted = (rewards?.pendingBEAN?.unroasted ?? "0") !== "0"
  const hasRoasted = (rewards?.pendingBEAN?.roasted ?? "0") !== "0"
  const uncheckpointedRound = rewards?.uncheckpointedRound ? parseInt(rewards.uncheckpointedRound, 10) : 0
  const needsCheckpoint = uncheckpointedRound > 0 && onCheckpoint

  const totalBEANFormatted = rewards?.pendingBEAN?.grossFormatted
    ? parseFloat(rewards.pendingBEAN.grossFormatted).toFixed(4)
    : "0.0000"
  const hasTotalBEAN = hasBEAN

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

        <div style={{ ...styles.row, ...styles.totalRow }}>
          <div style={styles.rowLabel}>
            <BeanLogo size={16} />
            <span>Total BNBEAN</span>
          </div>
          <div style={{ ...styles.rowValue, color: hasTotalBEAN ? "#fff" : "#555", fontWeight: 700 }}>
            {totalBEANFormatted} BNBEAN
          </div>
        </div>
      </div>

      <div style={styles.actionGroup}>
        {needsCheckpoint && (
          <>
            <button
              style={styles.btnCheckpoint}
              disabled={isCheckpointing}
              onClick={() => onCheckpoint(uncheckpointedRound)}
            >
              {isCheckpointing ? 'Checkpointing...' : `Checkpoint Round ${uncheckpointedRound} (required before claim)`}
            </button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#888' }}>Or checkpoint round:</span>
              <input
                type="number"
                min={1}
                placeholder="e.g. 25"
                value={manualRound}
                onChange={(e) => setManualRound(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: 60,
                  padding: '4px 8px',
                  fontSize: 12,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#fff',
                }}
              />
              <button
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  background: manualRound ? '#444' : 'transparent',
                  border: '1px solid #444',
                  borderRadius: 6,
                  color: '#aaa',
                  cursor: manualRound ? 'pointer' : 'not-allowed',
                }}
                disabled={!manualRound || isCheckpointing}
                onClick={() => {
                  const r = parseInt(manualRound, 10)
                  if (r > 0 && onCheckpoint) {
                    onCheckpoint(r)
                    setManualRound('')
                  }
                }}
              >
                Go
              </button>
            </div>
          </>
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
      </div>
      {needsCheckpoint && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          You won a round. Checkpoint first to add rewards to your balance, then claim.
        </div>
      )}
      {(hasETH || hasBEAN) && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
          If claim fails with &quot;nothing to claim&quot;, balance may be stale —{' '}
          <button type="button" onClick={() => refetchRewards()} style={{ background: 'none', border: 'none', color: '#F0B90B', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 11 }}>Refresh</button>
        </div>
      )}
      {needsCheckpoint && !hasBEAN && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          <div>Try checkpointing the round you won (see Winners panel). If BNBEAN is still 0:</div>
          <a
            href="/api/stats/diagnostic"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#888", textDecoration: "underline", marginTop: 4, display: "inline-block" }}
          >
            Debug BNBEAN mint
          </a>
          <span style={{ marginLeft: 4 }}>— check minter, Bean address match, and VRF LINK.</span>
        </div>
      )}
      {hasBEAN && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          Claim BNBEAN sends BNBEAN to your wallet. Add the token in MetaMask if it doesn&apos;t appear.
        </div>
      )}
      <div style={{ fontSize: 11, color: "#666", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <span>BNBEAN contract (add to MetaMask):</span>
        <code
          style={{
            fontSize: 10,
            background: "rgba(0,0,0,0.3)",
            padding: "4px 8px",
            borderRadius: 4,
            wordBreak: "break-all",
            cursor: "pointer",
            userSelect: "all",
          }}
          onClick={() => navigator.clipboard?.writeText(CONTRACTS.Bean.address)}
          title="Click to copy"
        >
          {CONTRACTS.Bean.address}
        </code>
      </div>
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
  totalRow: {
    paddingTop: 4,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    marginTop: 2,
  },
  actionGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12,
  },
  btnCheckpoint: {
    width: "100%",
    padding: "10px 0",
    background: "#F0B90B",
    color: "#1a1a1a",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
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
