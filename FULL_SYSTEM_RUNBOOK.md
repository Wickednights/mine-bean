# BNBEAN / Mine Bean — Full system runbook

**Who this is for:** You want the whole stack working end-to-end (contracts → backend → website) and you are OK following steps in order.

**How to use this doc:** Work **top to bottom**. When a step says “save these addresses,” paste them into a notes file before continuing. For deeper detail or troubleshooting, follow the links to the other guides.

**Related guides (read these when you need more depth):**

| Doc | Purpose |
|-----|---------|
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Prerequisites, troubleshooting, verification tables |
| [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) | Pool, TWAP, VRF, Render/Vercel, long troubleshooting |
| [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md) | Final QA before users touch the product |
| [SYSTEM_VERIFICATION_CHECKLIST.md](SYSTEM_VERIFICATION_CHECKLIST.md) | Env vars, production-shaped checks |
| [DOCKER.md](DOCKER.md) | Docker-only dev notes |
| [SHIPPING_ANALYSIS.md](SHIPPING_ANALYSIS.md) | GridMining checkpoint features vs deployed address |

---

## Part A — What you are actually running

### Five smart contracts (on BNB Chain)

The deploy script deploys them in this **order** (each step needs the previous):

1. **Bean (BNBEAN)** — ERC-20; only the minter (GridMining) mints rewards.
2. **Treasury** — Holds vaulted BNB, runs buybacks using Bean’s TWAP; needs the Pancake router address at deploy time.
3. **GridMining** — The game: rounds, deploy, VRF settlement, checkpoints, claims. Talks to Bean + Treasury + Chainlink VRF.
4. **AutoMiner** — Users lock BNB and a strategy; an **executor** wallet calls the contract each round to deploy for them.
5. **Staking** — Users stake BNBEAN; yield comes from treasury buybacks.

After deploy, the script also **wires** them: Bean minter → GridMining, GridMining ↔ AutoMiner, Treasury ↔ GridMining/Staking, and VRF config if your `.env` has subscription id + key hash.

### Off-chain software

- **Backend** (`Backend/`) — REST API, MongoDB indexer, SSE streams. Optionally calls `reset()` and AutoMiner `executeFor` if you set private keys in `.env`.
- **MongoDB** — Stores rounds/deployments for the UI and APIs.
- **Frontend** (Next.js at repo root) — Wallet, grid, claims, staking pages. Reads contract addresses from `lib/contracts.ts` and API from `NEXT_PUBLIC_API_URL`.
- **Supabase (optional)** — User profiles (username, pfp); not required for mining.

### Why addresses must match everywhere

GridMining **mints** BNBEAN to the **Bean** address it was constructed with. If the frontend or backend points at a **different** Bean or GridMining than the chain, you will see zeros, failed claims, or “nothing to claim.” After every redeploy, update **all** places listed in Part E.

```mermaid
flowchart LR
  subgraph contracts [On_chain]
    Bean --> Treasury
    Bean --> Staking
    GridMining --> Bean
    Treasury --> GridMining
    AutoMiner --> GridMining
  end
  subgraph offchain [Off_chain]
    Backend --> contracts
    Frontend --> Backend
    Frontend --> contracts
  end
```

---

## Part B — Prerequisites (gather before Day 1)

- [ ] **Wallet** (e.g. MetaMask) with **BSC Testnet** (chain id **97**) for testnet work — [BNB Chain faucet](https://www.bnbchain.org/en/testnet-faucet) for tBNB.
- [ ] **Chainlink VRF** — Subscription on [vrf.chain.link](https://vrf.chain.link) for BSC Testnet; fund with **testnet LINK** ([faucet](https://faucets.chain.link/)). You need `VRF_COORDINATOR`, `VRF_SUBSCRIPTION_ID`, and `VRF_KEY_HASH` from [Chainlink docs](https://docs.chain.link/vrf/v2-5/supported-networks) for your network.
- [ ] **BscScan API key** (optional but useful) — [bscscan.com/myapikey](https://bscscan.com/myapikey) for `hardhat verify`.
- [ ] **MongoDB** — Either local via Docker (see Part F) or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) connection string.
- [ ] **Supabase** (optional) — Project URL + anon key for profile features.
- [ ] **Node.js** + **npm** installed.
- [ ] **Docker Desktop** (optional) — If you use `docker compose` for local full stack.

**Security:** Never commit `hardhat/.env`, `Backend/.env`, or `.env.local` with real keys. Add them to `.gitignore` if you ever create local files that are not ignored.

---

## Part C — Phase 1: Deploy contracts (Hardhat)

### C.1 Create `hardhat/.env`

**Directory for this section:** create/edit the file inside **`hardhat/`** (same folder as `hardhat.config.js`).

Example (testnet). Replace placeholders with your values:

```env
DEPLOYER_PRIVATE_KEY=your_private_key_without_0x_prefix
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BSCSCAN_API_KEY=your_bscscan_api_key

VRF_COORDINATOR=0x...   # from Chainlink BSC testnet docs
VRF_SUBSCRIPTION_ID=your_numeric_subscription_id
VRF_KEY_HASH=0x...      # from Chainlink docs for BSC testnet

PANCAKESWAP_ROUTER=0xD99D1c33F9fC3444f8101754aBC46c52416550D1
```

Optional:

```env
BUYBACK_THRESHOLD=0.01
EXECUTOR_FEE_BPS=100
EXECUTOR_FLAT_FEE=0.000006
```

Mainnet: use mainnet RPC, mainnet VRF values, and router `0x10ED43C718714eb63d5aA57B78B54704E256024E` (see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).

### C.2 Install, compile, deploy

Open a terminal.

**Windows (PowerShell):** use `;` between commands when chaining.

```powershell
cd hardhat
npm install
npm run compile
npm run deploy:testnet
```

Equivalent:

```powershell
cd hardhat
npx hardhat run scripts/deploy.js --network bscTestnet
```

Mainnet (only after audit and real funds):

```powershell
cd hardhat
npm run deploy:mainnet
```

### C.3 Save the output

The script prints **five addresses**. Copy them to a secure note:

- Bean (BNBEAN)
- Treasury
- GridMining
- AutoMiner
- Staking

You will paste these into `lib/contracts.ts`, `docker-compose.yml`, Backend/Render env, etc.

### C.4 Important: “I only changed GridMining in Solidity”

The default **`scripts/deploy.js`** always deploys a **new Bean and full stack**. It does **not** upgrade a single contract in place.

If you deploy a **new** GridMining **without** redeploying everything, you must manually: point `bean.setMinter` at the new GridMining, call `gridMining.setAutoMiner`, `treasury.setGridMining`, set VRF config again, add the new consumer on vrf.chain.link, and accept that **old game state lives on the old GridMining**. For testnet iteration, **full redeploy** is the simple, documented path.

---

## Part D — Phase 2: On-chain steps after deploy

Do these in **roughly** this order (pool can wait until you have BNBEAN from gameplay).

| Step | What | Why |
|------|------|-----|
| 1 | Add **GridMining** contract address as a **consumer** on your VRF subscription at [vrf.chain.link](https://vrf.chain.link) | Without this, VRF never fulfills and rounds never settle with randomness |
| 2 | Call **`gridMining.startFirstRound()`** | Starts the first 60s round (game can run **before** liquidity pool exists) |
| 3 | Play rounds, **`reset()`** when timer ends (or enable auto-reset in Part G), wait for VRF | Confirms end-to-end settlement and BNBEAN minting |
| 4 | Create **BNBEAN/WBNB** pool on **PancakeSwap V2** (testnet) | Treasury buybacks need a pool |
| 5 | **`bean.setPair(<pairAddress>)`** | Bean TWAP needs the pair |
| 6 | **`bean.updateReserveSnapshot()`** at least **3** times, **one new block between each** (~3–4s on BSC testnet) | Until this, `TWAPNotReady`-style failures can block buybacks |
| 7 | Update **`LP.address`** in `lib/contracts.ts` with the pair address | Header / price widgets use it |

### Using Hardhat console (pattern)

**Directory:** `hardhat/`

```powershell
cd hardhat
npx hardhat console --network bscTestnet
```

Then (replace addresses with **yours**):

```javascript
const gridMining = await ethers.getContractAt("GridMining", "0xYOUR_GRIDMINING")
await (await gridMining.startFirstRound()).wait()
```

Same idea for `Bean`, `bean.setPair`, `bean.updateReserveSnapshot`.

### Optional: verify on BscScan

See [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) Step 7. **Always substitute your deployed addresses and constructor args** — do not copy historical example addresses from old docs.

### Optional: freeze minter (mainnet, late stage)

When you are sure the game is correct, Bean owner can call **`freezeMinter()`** so the minter address can never change again. **Irreversible** — only after you trust deployment.

---

## Part E — Phase 3: Sync the repo with the chain

After **any** contract deploy or ABI change:

### E.1 Frontend addresses — `lib/contracts.ts`

Edit [lib/contracts.ts](lib/contracts.ts):

- `GridMining.address`
- `Bean.address`
- `AutoMiner.address`
- `Treasury.address`
- `Staking.address`
- `LP.address` (pair from Pancake; can be placeholder until pool exists)

Confirm **`MIN_DEPLOY_PER_BLOCK`**, **`EXECUTOR_FEE_BPS`**, **`EXECUTOR_FLAT_FEE`** still match the deployed contracts (comments in file).

### E.2 Docker — `docker-compose.yml`

If you use Docker, update the `backend.environment` block in [docker-compose.yml](docker-compose.yml):

- `GRIDMINING_ADDRESS`
- `BEAN_ADDRESS`
- `AUTOMINER_ADDRESS`
- `TREASURY_ADDRESS`
- `STAKING_ADDRESS`

Optional: set `RPC_URL` for the backend via shell env when running compose (see file for `${RPC_URL:-...}`).

### E.3 Backend — `Backend/.env` or Render dashboard

Set the same five addresses (and `MONGODB_URI`, `RPC_URL`, `PORT=3001`). [Backend/lib/contracts.js](Backend/lib/contracts.js) has **fallback** addresses in code — in production, **always set env vars** so you never accidentally read the wrong deployment.

### E.4 ABIs (after `npm run compile` in `hardhat/`)

If Solidity interfaces changed (e.g. new GridMining functions), copy ABIs into the repo:

**Option A — npm script (recommended):**

```powershell
cd hardhat
npm run sync-abis
```

**Option B — one-liner** (GridMining only example):

```powershell
cd hardhat
node -e "const fs=require('fs');const p='artifacts/contracts/GridMining.sol/GridMining.json';const a=JSON.parse(fs.readFileSync(p,'utf8'));const s=JSON.stringify(a.abi,null,2);fs.writeFileSync('../lib/abis/GridMining.json',s);fs.writeFileSync('../Backend/abis/GridMining.json',s);console.log('GridMining ABI synced');"
```

The `sync-abis` script syncs **Bean, Treasury, GridMining, AutoMiner, Staking** to both `lib/abis/` and `Backend/abis/`.

---

## Part F — Phase 4: Run backend + frontend

### Option A — Docker (good for “just run everything”)

**Directory:** repo **root** (folder that contains `docker-compose.yml`).

```powershell
docker compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:3001](http://localhost:3001)

Check health:

```powershell
curl http://localhost:3001/health
```

Optional root `.env` for Supabase (see [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) Step 8).

After **backend code** changes, rebuild:

```powershell
docker compose down
docker compose up --build
```

### Option B — Manual npm

**Terminal 1 — Backend**

```powershell
cd Backend
npm install
npm run dev
```

**Terminal 2 — Frontend** (repo root)

Create **`.env.local`** in the repo root:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Then:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In MetaMask, select **BSC Testnet** (chain id 97).

### Option C — Production-shaped (Render + Vercel)

Summary — full tables in [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) “Deploy to Render + Vercel”:

- **Render:** root directory `Backend`, `npm install` / `npm start`, env vars for MongoDB URI, RPC URL, five contract addresses, optional `RESET_WALLET_PRIVATE_KEY`, `EXECUTOR_PRIVATE_KEY`.
- **Vercel:** `NEXT_PUBLIC_API_URL` = your Render URL, `INTERNAL_API_URL` = same URL (for Next.js API routes that proxy to the backend).

---

## Part G — Phase 5: Operator automation (optional but important)

Without these, you must **manually** call **`reset()`** on GridMining after each round ends, and **manually** run something that calls AutoMiner **`executeFor`** for each user.

Add to **Backend** `.env` (or Render):

| Variable | Purpose |
|----------|---------|
| `RESET_WALLET_PRIVATE_KEY` | Wallet with tBNB/BNB that sends `GridMining.reset()` |
| `AUTO_RESET_ENABLED` | Default true if key set; set `false` to disable |
| `EXECUTOR_PRIVATE_KEY` | Must match on-chain `AutoMiner.executor()` (usually deployer) |
| `AUTO_MINER_EXECUTOR_ENABLED` | Omit key or set false to disable executor loop |
| `AUTO_MINER_EXECUTOR_POLL_MS` | Default 15000 (15s) |

Fund both wallets with a small amount of native token for gas.

Details: [POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) sections “Auto-reset” and “AutoMiner executor”.

---

## Part H — Verification commands

Run from any directory unless noted.

```powershell
# Backend up and Mongo connected
curl http://localhost:3001/health

# Deep contract sanity (Bean minter, address match, hints)
curl http://localhost:3001/api/stats/diagnostic
```

Frontend tests (repo root):

```powershell
npm run test:run
```

Contract tests:

```powershell
cd hardhat
npx hardhat test
```

---

## Part I — When something breaks (quick pointers)

| Symptom | Check |
|---------|--------|
| VRF never settles | GridMining added as consumer? Subscription has **LINK**? Correct `VRF_COORDINATOR` / key hash? |
| TWAP / buyback errors | `setPair` done? `updateReserveSnapshot` 3+ times across blocks? |
| Zeros on rewards | `/api/stats/diagnostic` — `beanAddressMatch`, `minterMatchesGridMining` ([POST_DEPLOYMENT_GUIDE.md](POST_DEPLOYMENT_GUIDE.md) BNBEAN section) |
| Frontend wrong network | MetaMask chain vs [lib/wagmi.ts](lib/wagmi.ts) (`bsc` / `bscTestnet`) |
| Indexer rate limits | Paid RPC; `INDEXER_POLL_INTERVAL_MS` in Backend `.env` |
| AutoMiner 0 rounds | `EXECUTOR_PRIVATE_KEY` set and funded? Matches `executor()` on contract? |
| Docker frontend oddities | `INTERNAL_API_URL=http://backend:3001` is set in compose for API routes |

Full tables: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) §5.

---

## Part J — Final QA before users

Walk through **[PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)** (mining, checkpoint, claim, AutoMiner, staking, Global, mobile, SSE).

For production env completeness, also use **[SYSTEM_VERIFICATION_CHECKLIST.md](SYSTEM_VERIFICATION_CHECKLIST.md)**.

---

## Appendix — Improvements backlog (optional follow-ups)

These are **not** required to run the system; they are sensible next iterations:

| Area | Idea |
|------|------|
| Docs | Keep verify examples strictly “your addresses from deploy output” |
| Tooling | `npm run sync-abis` in `hardhat/` (see above) |
| UI | Wire **MobileMiners** to `/api/round/:id/miners` like desktop MinersPanel |
| UI | Optional **`checkpointBatch`** button for power users |
| Ops | Scripted “GridMining-only” migration if you outgrow full redeploys |
| Security | `hardhat test`, Slither, or audit before mainnet; then `bean.freezeMinter()` when stable |

---

*This runbook is the single ordered path; detailed prose and edge cases live in the linked guides.*
