# MineBean — System Verification Checklist

Use this checklist to verify the entire system works on testnet and that all environment variables are correctly set across Vercel, Render, and MongoDB Atlas.

---

## Quick Reference: Where Things Live

| Component | Platform | Purpose |
|-----------|----------|---------|
| Frontend | Vercel | Next.js app (mine-bean.vercel.app) |
| Backend | Render | Node API + indexer + auto-reset + AutoMiner executor |
| Database | MongoDB Atlas | Round data, miners, stats, events |

---

## Part 1: Environment Variables

### 1.1 MongoDB Atlas

**Setup:** [cloud.mongodb.com](https://cloud.mongodb.com) → Create cluster → Database Access → Network Access

| # | Check | Done |
|---|-------|------|
| 1.1.1 | Cluster created (free tier OK) | ☐ |
| 1.1.2 | Database user created (username + password) | ☐ |
| 1.1.3 | Network Access: `0.0.0.0/0` (allow from anywhere — Render IPs vary) | ☐ |
| 1.1.4 | Connection string copied: `mongodb+srv://user:pass@cluster.mongodb.net/minebean` | ☐ |

**Connection string format:** Use the string from Atlas → Connect → Drivers. Replace `<password>` with your actual password. The database name is typically `minebean` or `test` — adjust as needed.

---

### 1.2 Render (Backend)

**Location:** Render Dashboard → Your Web Service → Environment

| Key | Required | Value | Notes |
|-----|----------|-------|-------|
| `PORT` | No | `10000` | Render sets this; omit or leave default |
| `MONGODB_URI` | **Yes** | `mongodb+srv://...` | From Atlas |
| `RPC_URL` | **Yes** | `https://bsc-testnet-dataseed.bnbchain.org` | Or Alchemy/QuickNode for fewer rate limits |
| `GRIDMINING_ADDRESS` | **Yes** | `0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB` | BSC Testnet |
| `BEAN_ADDRESS` | **Yes** | `0x89BeA6C663D33b129525F14574b8eFdC1d19A39c` | BSC Testnet |
| `AUTOMINER_ADDRESS` | **Yes** | `0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304` | BSC Testnet |
| `TREASURY_ADDRESS` | **Yes** | `0x90bAbE945cffaA081a3853acFeAe1c97cEf726F4` | BSC Testnet |
| `STAKING_ADDRESS` | **Yes** | `0xeDcA64d1620D544Ac0184467CAc24867e682Bdc7` | BSC Testnet |
| `RESET_WALLET_PRIVATE_KEY` | Optional | `0x...` | Wallet with BNB for auto-reset |
| `AUTO_RESET_ENABLED` | Optional | `true` | Enable auto-reset |
| `EXECUTOR_PRIVATE_KEY` | Optional | `0x...` | AutoMiner executor wallet |
| `INDEXER_POLL_INTERVAL_MS` | Optional | `12000` | Default 12s |

**Checklist:**

| # | Check | Done |
|---|-------|------|
| 1.2.1 | All 5 contract addresses set | ☐ |
| 1.2.2 | `MONGODB_URI` matches Atlas connection string | ☐ |
| 1.2.3 | `RPC_URL` is BSC Testnet (not mainnet) | ☐ |
| 1.2.4 | If using auto-reset: `RESET_WALLET_PRIVATE_KEY` set and wallet funded | ☐ |
| 1.2.5 | If using AutoMiner: `EXECUTOR_PRIVATE_KEY` set and wallet funded | ☐ |

---

### 1.3 Vercel (Frontend)

**Location:** Vercel Dashboard → Project → Settings → Environment Variables

**For Preview:** Set these for the **Preview** environment (or Production if you deploy to main).

| Key | Required | Value | Notes |
|-----|----------|-------|-------|
| `NEXT_PUBLIC_API_URL` | **Yes** | `https://YOUR-RENDER-URL.onrender.com` | Your Render backend URL |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `https://mine-bean.vercel.app` | Or your Vercel URL |
| `INTERNAL_API_URL` | **Yes** | `https://YOUR-RENDER-URL.onrender.com` | Same as API URL — Next.js proxy uses this |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Your Supabase URL | For profile features |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Your Supabase anon key | For profile features |

**Optional (Discord/Twitter auth, cron):**

| Key | Value |
|-----|-------|
| `DISCORD_CLIENT_ID` | Discord OAuth app |
| `DISCORD_CLIENT_SECRET` | Discord OAuth |
| `DISCORD_BOT_TOKEN` | For guild role assignment |
| `DISCORD_GUILD_ID` | Your guild ID |
| `DISCORD_HOLDER_ROLE_ID` | Role for BNBEAN holders |
| `TWITTER_CLIENT_ID` | Twitter OAuth |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth |
| `DISCORD_BEANPOT_WEBHOOK_URL` | Webhook for beanpot notifications |
| `CRON_SECRET` | For cron auth |

**Checklist:**

| # | Check | Done |
|---|-------|------|
| 1.3.1 | `NEXT_PUBLIC_API_URL` = Render backend URL | ☐ |
| 1.3.2 | `INTERNAL_API_URL` = Render backend URL (same as above) | ☐ |
| 1.3.3 | `NEXT_PUBLIC_APP_URL` = Vercel URL (e.g. mine-bean.vercel.app) | ☐ |
| 1.3.4 | Variables set for **Preview** (and Production if needed) | ☐ |

---

## Part 2: Contract & Deployment Checks

| # | Task | Done | Reference |
|---|------|------|-----------|
| 2.1 | Contracts deployed to BSC Testnet | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.2 | GridMining added as VRF consumer at vrf.chain.link | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.3 | VRF subscription funded with LINK | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.4 | `lib/contracts.ts` has correct addresses | ☐ | Matches Backend |
| 2.5 | `Backend/lib/contracts.js` uses these addresses (or env vars) | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.6 | `gridMining.startFirstRound()` called | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.7 | Bean minter set to GridMining: `bean.minter()` matches | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.8 | (Optional) BEAN/WBNB pool created + `bean.setPair()` + `updateReserveSnapshot` 3x | ☐ | POST_DEPLOYMENT_GUIDE |
| 2.9 | (Optional) LP address updated in `lib/contracts.ts` | ☐ | After pool created |

---

## Part 3: Backend & Frontend Health

| # | Check | Done |
|---|-------|------|
| 3.1 | `curl https://YOUR-RENDER-URL/health` returns `{"status":"ok","mongo":"connected",...}` | ☐ |
| 3.2 | `curl https://YOUR-RENDER-URL/api/stats/diagnostic` returns valid data (no errors) | ☐ |
| 3.3 | Frontend loads at Vercel URL | ☐ |
| 3.4 | Wallet connects on BSC Testnet (Chain ID 97) | ☐ |
| 3.5 | BNB and BNBEAN prices show in header | ☐ |

---

## Part 4: Game Flow (Pre-Launch Checklist)

See [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md) for the full feature checklist. Summary:

| # | Area | Key Checks |
|---|------|------------|
| 4.1 | Mining | Deploy BNB → grid updates → countdown → Reset → settle → Winners |
| 4.2 | Rewards | Checkpoint → Claim BNB → Claim BNBEAN |
| 4.3 | Miners Panel | Winners, crown, beanpot |
| 4.4 | AutoMiner | Activate strategy → deploys in next rounds |
| 4.5 | Staking | Approve → Deposit → Withdraw → Claim |
| 4.6 | Global | Stats, mining table, revenue, leaderboard |
| 4.7 | Profile | Rounds, history, edit username |
| 4.8 | SSE | Real-time updates without refresh |
| 4.9 | Mobile | Layout, deploy, claim work |

---

## Part 5: Diagnostic Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Backend + MongoDB status |
| `GET /api/stats/diagnostic` | Bean minter, addresses, BNBEAN mint status |

**Diagnostic fields to verify:**

- `beanAddressMatch`: true = GridMining uses same Bean as app
- `minterMatchesGridMining`: true = Bean.minter() is GridMining
- `bnbeanMintStatus`: `ok` = all good. `minter_mismatch` = run setMinter. `no_mints_yet` = VRF may need LINK.

---

## Part 6: Common Issues

| Issue | Fix |
|-------|-----|
| Backend health shows 500 or mongo not connected | Check `MONGODB_URI` in Render; verify Atlas Network Access allows `0.0.0.0/0` |
| Frontend can't reach backend | Check `NEXT_PUBLIC_API_URL` and `INTERNAL_API_URL` in Vercel |
| Profile / rounds / rewards not loading | `INTERNAL_API_URL` must be set for Next.js proxy |
| BNBEAN not minting | Run diagnostic; check minter, VRF subscription LINK |
| Staking deposit fails | Check tBNB for gas; approve BNBEAN first; min 1 BNBEAN |
| Render free tier sleeps | First request ~30s to wake; SSE drops when sleeping |

---

## Recommended Order

1. **MongoDB Atlas** — Create cluster, user, network access, copy connection string.
2. **Render** — Set all env vars; deploy; verify `/health` and `/api/stats/diagnostic`.
3. **Vercel** — Set all env vars; deploy; verify frontend loads.
4. **Contract checks** — Verify addresses, minter, VRF, startFirstRound.
5. **Full flow** — Run through PRE_LAUNCH_CHECKLIST on testnet.

---

## Env Var Summary Table

| Var | Vercel | Render | MongoDB Atlas |
|-----|--------|--------|---------------|
| `MONGODB_URI` | — | ✓ | Create & copy |
| `RPC_URL` | — | ✓ | — |
| `GRIDMINING_ADDRESS` | — | ✓ | — |
| `BEAN_ADDRESS` | — | ✓ | — |
| `AUTOMINER_ADDRESS` | — | ✓ | — |
| `TREASURY_ADDRESS` | — | ✓ | — |
| `STAKING_ADDRESS` | — | ✓ | — |
| `NEXT_PUBLIC_API_URL` | ✓ | — | — |
| `INTERNAL_API_URL` | ✓ | — | — |
| `NEXT_PUBLIC_APP_URL` | ✓ | — | — |
| `NEXT_PUBLIC_SUPABASE_*` | ✓ | — | — |
