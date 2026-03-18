# BNBEAN Pre-Launch Checklist

Use this checklist to verify every part of the game before launch. Check off each item as you complete it.

---

## 1. Restart for Changes

**Indexer / Backend changes require a restart.**

```bash
docker compose down
docker compose up --build
```

Or if already running: `docker compose restart backend` (or full `up --build` to ensure latest code).

---

## 2. Infrastructure

| # | Check | Pass |
|---|-------|------|
| 2.1 | Backend starts without errors (check Docker logs) | ☐ |
| 2.2 | Frontend loads at `http://localhost:3000` (or your URL) | ☐ |
| 2.3 | Wallet connects (MetaMask / RainbowKit) on BSC Testnet | ☐ |
| 2.4 | BNB and BNBEAN prices show in header | ☐ |
| 2.5 | `GET /api/stats/diagnostic` returns valid data (no errors) | ☐ |

---

## 3. Mining Game — Core Flow

| # | Check | Pass |
|---|-------|------|
| 3.1 | 5×5 grid loads with current round info (beanpot, countdown) | ☐ |
| 3.2 | Select blocks and deploy BNB — tx succeeds | ☐ |
| 3.3 | Your deployment appears on grid (amount, block highlight) | ☐ |
| 3.4 | Countdown runs; when it hits 0, round settles (auto-reset or manual **Reset**) | ☐ |
| 3.5 | Round settles (VRF); Winners panel slides in with results | ☐ |
| 3.7 | If you won: crown/award icon shows next to your address | ☐ |
| 3.8 | New round starts; grid clears for next round | ☐ |
| 3.9 | *(If auto-reset disabled)* Manual **Reset** button appears and works | ☐ |

---

## 4. Rewards — Checkpoint & Claim

| # | Check | Pass |
|---|-------|------|
| 4.1 | After winning: **Checkpoint Round N** button appears | ☐ |
| 4.2 | Click **Checkpoint** — tx succeeds | ☐ |
| 4.3 | Pending BNB and BNBEAN update (no longer 0.0000) | ☐ |
| 4.4 | **Claim BNB** — tx succeeds, balance updates | ☐ |
| 4.5 | **Claim BNBEAN** — tx succeeds, BNBEAN in wallet | ☐ |

---

## 5. Miners Panel (Winners)

| # | Check | Pass |
|---|-------|------|
| 5.1 | Winners panel opens from left arrow / block click | ☐ |
| 5.2 | Shows miners for current/last round with BNB + BNBEAN rewards | ☐ |
| 5.3 | Crown persists after page refresh (if you won) | ☐ |
| 5.4 | Beanpot hit celebration shows when beanpot triggers | ☐ |

---

## 6. AutoMiner

| # | Check | Pass |
|---|-------|------|
| 6.1 | AutoMiner section shows (All / Random / Select strategies) | ☐ |
| 6.2 | Activate a strategy — tx succeeds, config shows as active | ☐ |
| 6.3 | AutoMiner deploys for you in subsequent rounds | ☐ |
| 6.4 | **Stop** deactivates; no more auto-deploys | ☐ |

---

## 7. Staking

| # | Check | Pass |
|---|-------|------|
| 7.1 | Navigate to **Stake** (desktop nav or mobile bottom nav) | ☐ |
| 7.2 | Staking stats load (TVL, APR, etc.) | ☐ |
| 7.3 | **Approve** BNBEAN — tx succeeds | ☐ |
| 7.4 | **Deposit** — tx succeeds, staked balance updates | ☐ |
| 7.5 | **Withdraw** — tx succeeds | ☐ |
| 7.6 | **Claim yield** / **Compound** — tx succeeds | ☐ |

---

## 8. Global Page

| # | Check | Pass |
|---|-------|------|
| 8.1 | Navigate to **Global** | ☐ |
| 8.2 | Global stats: Circulating Supply, Protocol Revenue, BNB in Treasury, Burned | ☐ |
| 8.3 | Mining table: past rounds with beanpot filter | ☐ |
| 8.4 | Revenue table: buybacks list | ☐ |
| 8.5 | Leaderboard: miners, stakers, earners | ☐ |

---

## 9. Profile

| # | Check | Pass |
|---|-------|------|
| 9.1 | Navigate to **Profile** (when connected) | ☐ |
| 9.2 | Profile loads: rounds, staking, rewards summary | ☐ |
| 9.3 | Edit username / bio — saves | ☐ |
| 9.4 | Round history shows your past rounds | ☐ |

---

## 10. Real-Time Updates (SSE)

| # | Check | Pass |
|---|-------|------|
| 10.1 | Deploy BNB — grid updates without refresh | ☐ |
| 10.2 | Round settles — Winners panel appears without refresh | ☐ |
| 10.3 | New round starts — grid refreshes (or polls within ~15s) | ☐ |
| 10.4 | Stats refresh when round settles | ☐ |

---

## 11. Mobile

| # | Check | Pass |
|---|-------|------|
| 11.1 | Mobile layout renders (bottom nav, mobile controls) | ☐ |
| 11.2 | Deploy, Reset, Claim work on mobile | ☐ |
| 11.3 | Miners panel accessible on mobile | ☐ |

---

## 12. Edge Cases

| # | Check | Pass |
|---|-------|------|
| 12.1 | Empty round (no deploys) — settles instantly, no errors | ☐ |
| 12.2 | No-winner round — no BEAN minted, BNB to treasury | ☐ |
| 12.3 | Disconnect wallet — UI handles gracefully | ☐ |
| 12.4 | Wrong network — prompt to switch to BSC Testnet | ☐ |

---

## Quick Smoke Test (5 min)

If time is tight, run this minimal flow:

1. Connect wallet → Deploy to 1 block → Wait for countdown → Reset → Wait for settle
2. If you won: Checkpoint → Claim BNB → Claim BNBEAN
3. Open Global → verify stats
4. Open Stake → verify page loads

---

## Notes

- **Docker:** Backend indexer changes require `docker compose up --build` or restart.
- **RPC:** If you hit rate limits, set `INDEXER_POLL_INTERVAL_MS=20000` in Backend `.env`.
- **Diagnostics:** `GET /api/stats/diagnostic` helps debug stats/rewards issues.
