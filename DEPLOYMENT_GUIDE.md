# BNBEAN Protocol — Deployment Guide

This guide covers deploying the BNBEAN Protocol to BSC testnet and mainnet, with prerequisites, step-by-step instructions, verification checklists, and troubleshooting.

**For post-deployment steps (pool creation, setPair, startFirstRound, etc.), see [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md).**

**For a single beginner-friendly ordered checklist (commands, directories, address sync), see [FULL_SYSTEM_RUNBOOK.md](FULL_SYSTEM_RUNBOOK.md).**

**For Docker-based local development, see [DOCKER.md](DOCKER.md).**

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Testnet Deployment](#2-testnet-deployment)
3. [Mainnet Deployment](#3-mainnet-deployment)
4. [Verification Checklist](#4-verification-checklist)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Prerequisites

### Before Day 1

| Item | Description |
|------|-------------|
| **Wallet** | MetaMask with BSC Testnet (Chain ID 97, RPC `https://data-seed-prebsc-1-s1.binance.org:8545`) |
| **tBNB** | Get from [BNB Chain Faucet](https://www.bnbchain.org/en/testnet-faucet) (~0.5 tBNB) |
| **LINK** | For VRF subscription — get testnet LINK from [Chainlink Faucet](https://faucets.chain.link/) |
| **Chainlink VRF** | Create subscription at [vrf.chain.link](https://vrf.chain.link) (BSC Testnet), fund with 5 LINK |
| **MongoDB** | Create free cluster at [mongodb.com](https://www.mongodb.com/cloud/atlas) |
| **Supabase** | Create project for profiles table |
| **BscScan API Key** | [bscscan.com/myapikey](https://bscscan.com/myapikey) for contract verification |

### VRF Configuration

Verify VRF coordinator and key hash at [Chainlink VRF Supported Networks](https://docs.chain.link/vrf/v2-5/supported-networks). Use VRF v2.5 for BSC testnet.

---

## 2. Testnet Deployment

### Phase A: Contract Deployment (Day 1)

#### Step A1 — Configure hardhat/.env

```env
DEPLOYER_PRIVATE_KEY=<your_key_no_0x>
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BSCSCAN_API_KEY=<your_key>

# VRF v2.5 — verify at docs.chain.link/vrf/v2-5/supported-networks
VRF_COORDINATOR=0x<verify_from_chainlink_docs>
VRF_SUBSCRIPTION_ID=<your_subscription_id>
VRF_KEY_HASH=0x<key_hash_for_bsc_testnet>

# PancakeSwap BSC Testnet
PANCAKESWAP_ROUTER=0xD99D1c33F9fC3444f8101754aBC46c52416550D1
PANCAKESWAP_FACTORY=0x6725F303b657a9451d8BA641348b6761A6CC7a17
WBNB=0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
```

#### Step A2 — Deploy contracts

```bash
cd hardhat
npm install
npm run compile
npm run deploy:testnet
```

#### Step A3 — Post-deploy (manual)

1. Add GridMining address as VRF consumer at [vrf.chain.link](https://vrf.chain.link)
2. Create BEAN/WBNB pool on PancakeSwap testnet (add liquidity)
3. Call `bean.setPair(<pairAddress>)` with the pool pair address
4. (Optional) Call `bean.setRouter(<routerAddress>)` if different from deploy config
5. Call `bean.updateReserveSnapshot()` 3+ times (wait for new blocks between calls)
6. Call `gridMining.startFirstRound()`

### Phase B: Backend Setup (Day 2)

#### Option 1: Docker (recommended)

```bash
docker compose up --build
```

Starts MongoDB, backend, and frontend. Backend uses local MongoDB (`mongodb://mongodb:27017/minebean`). Contract addresses are preconfigured in `docker-compose.yml`.

#### Option 2: Manual

**Step B1 — Configure Backend/.env**

```env
PORT=3001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/minebean
RPC_URL=https://bsc-testnet-dataseed.bnbchain.org

# Contract addresses from deploy output
GRIDMINING_ADDRESS=0x...
BEAN_ADDRESS=0x...
AUTOMINER_ADDRESS=0x...
TREASURY_ADDRESS=0x...
STAKING_ADDRESS=0x...
```

**Step B2 — Start backend**

```bash
cd Backend
npm install
npm run dev
```

Verify: `curl http://localhost:3001/health` returns `{"status":"ok","mongo":"connected",...}`

### Phase C: Frontend Setup (Day 2)

#### If using Docker (Phase B Option 1)

Frontend is already running. Open [http://localhost:3000](http://localhost:3000), connect wallet (BSC Testnet), play a round. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to a `.env` file in the project root for profile features.

#### If using manual setup

**Step C1 — Update lib/contracts.ts**

Replace all addresses with your deployed testnet contract addresses.

**Step C2 — Configure .env.local**

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=<your_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_key>
```

**Step C3 — Run frontend**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect wallet (BSC Testnet), play a round.

### Phase D: Full-Stack Verification (Day 2–3)

1. Deploy BNB to blocks → see grid update via SSE
2. Wait for round end → call `reset()` (or have cron/script do it)
3. After VRF settles → checkpoint → claim ETH and BEAN
4. Test AutoMiner (All strategy, 2 rounds)
5. Test Staking (deposit, claim yield)
6. Verify MinersPanel shows correct rewards
7. Verify Treasury buyback (after vault accumulates 0.01 BNB)

---

## 3. Mainnet Deployment

### Pre-Mainnet Checklist

- [ ] All testnet flows validated
- [ ] Security review or audit completed
- [ ] Mainnet BNB for deployment and initial liquidity
- [ ] Mainnet LINK for VRF subscription
- [ ] Mainnet VRF subscription created and funded

### Mainnet Steps

1. **Update hardhat/.env:** `RPC_URL` for BSC mainnet, `VRF_COORDINATOR` for mainnet, `PANCAKESWAP_ROUTER=0x10ED43C718714eb63d5aA57B78B54704E256024E`
2. **Deploy:** `npm run deploy:mainnet` (or `npx hardhat run scripts/deploy.js --network bsc`)
3. **Post-deploy:** Same as testnet (VRF consumer, pool creation, setPair, updateReserveSnapshot, startFirstRound)
4. **Backend/Frontend:** Update addresses, set production API URL
5. **Freeze minter:** `bean.freezeMinter()` after confirming game works
6. **Render/Vercel:** Deploy backend and frontend to production

---

## 4. Verification Checklist

### Contract Deployment

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Deploy Bean | `bean.totalSupply()` returns 0 |
| 2 | Deploy Treasury | `treasury.bean()` returns Bean address |
| 3 | Deploy GridMining | `gridMining.gameStarted()` returns false |
| 4 | Deploy AutoMiner | `autoMiner.gridMining()` returns GridMining address |
| 5 | Deploy Staking | `staking.bean()` returns Bean address |
| 6 | Set Bean minter | `bean.minter()` returns GridMining address |
| 7 | Set GridMining autoMiner | `gridMining.autoMiner()` returns AutoMiner address |
| 8 | Set Treasury gridMining | `treasury.gridMining()` returns GridMining address |
| 9 | Set Treasury staking | `treasury.staking()` returns Staking address |
| 10 | Set VRF config | `gridMining.vrfSubscriptionId()` non-zero |

### VRF and Game Start

| Step | Action | Verification |
|------|--------|--------------|
| 11 | Add GridMining as VRF consumer | Visible at vrf.chain.link subscription |
| 12 | Create BEAN/WBNB pool | Pool exists on PancakeSwap |
| 13 | Call bean.setPair(pair) | `bean.pair()` returns pair address |
| 14 | Call updateReserveSnapshot 3x | `bean.isTWAPReady()` returns true |
| 15 | Call startFirstRound | `gridMining.gameStarted()` true, `getCurrentRoundInfo()` returns valid round |

### Game Flow

| Step | Action | Verification |
|------|--------|--------------|
| 16 | Deploy to 3 blocks (0.001 BNB each) | `getRoundDeployed(roundId)` shows amounts, `Deployed` event emitted |
| 17 | Wait 60s, call reset() | `ResetRequested` event, VRF request visible on BscScan |
| 18 | Wait for VRF (~30s) | `RoundSettled` event, `getRound(roundId).settled` true |
| 19 | Checkpoint round | `Checkpointed` event, `getTotalPendingRewards(user)` shows ETH/BEAN |
| 20 | Claim ETH | Balance increases, `ClaimedETH` event |
| 21 | Claim BEAN | BEAN balance increases, `ClaimedBEAN` event |

### Backend

| Step | Action | Verification |
|------|--------|--------------|
| 22 | Start backend | `GET /health` returns mongo connected |
| 23 | Indexer running | `GET /api/round/current` returns round data |
| 24 | SSE global | `GET /api/events/rounds` streams events |
| 25 | SSE user | `GET /api/user/<addr>/events` streams when connected |

### Frontend

| Step | Action | Verification |
|------|--------|--------------|
| 26 | Connect wallet | Wallet button shows address |
| 27 | Grid loads | 5x5 blocks visible, round timer counts down |
| 28 | Deploy flow | Select blocks, deploy, blocks turn green |
| 29 | MinersPanel | Shows winners after round settles |
| 30 | Claim rewards | ETH/BEAN claim buttons work |
| 31 | Staking | Deposit, withdraw, claim yield work |

### Treasury (After Vault Accumulates)

| Step | Action | Verification |
|------|--------|--------------|
| 32 | Vault has 0.01+ BNB | `treasury.vaultedETH()` >= 0.01 ether |
| 33 | Execute buyback | `BuybackExecuted` event, BEAN burned, stakers receive yield |

---

## 5. Troubleshooting

### VRF Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `VRFNotConfigured` | VRF params not set on GridMining | Set `VRF_SUBSCRIPTION_ID` and `VRF_KEY_HASH` in `.env` before deploying, or call `setVRFConfig()` manually |
| `OnlyCoordinatorCanFulfill` | Wrong VRF coordinator address | Verify `VRF_COORDINATOR` matches BSC Testnet/Mainnet from [Chainlink docs](https://docs.chain.link/vrf/v2-5/supported-networks) |
| VRF never responds | GridMining not added as consumer | Add GridMining address as consumer on your VRF subscription at vrf.chain.link |
| VRF never responds | Subscription out of LINK | Fund your subscription with more LINK |

### TWAP Not Ready

| Error | Cause | Fix |
|-------|-------|-----|
| `TWAPNotReady` | Bean pair not set or insufficient snapshots | Call `bean.setPair(<pairAddress>)` with the BEAN/WBNB pool address, then call `bean.updateReserveSnapshot()` at least 3 times (wait for new blocks between calls) |
| Treasury buyback reverts | Bean.getTWAPAmountOut reverts when pair is zero | Complete setPair and updateReserveSnapshot before enabling buybacks |

### Port Mismatch

| Symptom | Cause | Fix |
|---------|-------|-----|
| Frontend cannot reach API | Backend port differs from frontend expectation | Set `PORT=3001` in Backend `.env` to match `NEXT_PUBLIC_API_URL=http://localhost:3001` |
| CORS or connection refused | Wrong API URL in frontend | Ensure `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001` |

### RPC Rate Limit (Indexer)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[Indexer] GridMining query error: method eth_getLogs in batch triggered rate limit` | Public BSC RPC rate limits `eth_getLogs` | Use a paid RPC (Alchemy, QuickNode, Infura) with BSC testnet. Set `RPC_URL` in Backend `.env` or docker-compose. The indexer now queries sequentially with delays to reduce burst load. |

### Other Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: insufficient funds` | Not enough tBNB/BNB | Get more from faucet (testnet) or fund wallet (mainnet) |
| `ERROR: PANCAKESWAP_ROUTER env var not set` | Missing env var | Set `PANCAKESWAP_ROUTER` in hardhat `.env` (testnet: `0xD99D1c33F9fC3444f8101754aBC46c52416550D1`, mainnet: `0x10ED43C718714eb63d5aA57B78B54704E256024E`) |
| `ERROR: VRF_COORDINATOR env var not set` | Missing env var | Set `VRF_COORDINATOR` in hardhat `.env` |
| `GameNotStarted` | startFirstRound not called | Call `gridMining.startFirstRound()` as owner |
| `RoundNotEnded` | Round still active | Wait for the 60-second timer to expire before calling `reset()` |
| `ProviderError: nonce too low` | Previous tx not yet mined | Wait 15 seconds and retry |

### Useful Commands

```bash
# Start full stack with Docker (MongoDB + backend + frontend)
docker compose up --build

# Compile contracts
cd hardhat && npm run compile

# Deploy to testnet
cd hardhat && npm run deploy:testnet

# Open interactive console on testnet
cd hardhat && npx hardhat console --network bscTestnet

# Verify backend health
curl http://localhost:3001/health
```
