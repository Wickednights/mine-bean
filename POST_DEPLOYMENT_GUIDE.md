# BNBEAN Protocol — Post-Deployment Guide

This guide covers every step from contract deployment through game launch. Use it as a checklist and reference.

---

## Current Status (as of latest deployment)

| Step | Status | Notes |
|------|--------|------|
| 1. Deploy contracts | DONE | All 5 contracts deployed to BSC Testnet |
| 2. Add GridMining as VRF consumer | DONE | Added at vrf.chain.link |
| 3. Create BEAN/WBNB pool | TODO | See Step 3 below |
| 4. Configure Bean TWAP (setPair, updateReserveSnapshot) | TODO | After pool created |
| 5. Start game (startFirstRound) | TODO | After TWAP ready |
| 6. Update codebase addresses | DONE | lib/contracts.ts, Backend updated |
| 7. Verify contracts on BscScan | TODO | Optional but recommended |
| 8. Start backend and frontend | TODO | After addresses updated |

### Deployed Contract Addresses (BSC Testnet)

| Contract | Address |
|----------|---------|
| Bean (BNBEAN) | `0x89BeA6C663D33b129525F14574b8eFdC1d19A39c` — matches GridMining.bean() on-chain |
| Treasury | `0xD02139f8ce44AA168822a706BDa3dde6a2305728` |
| GridMining | `0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB` |
| AutoMiner | `0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304` |
| Staking | `0x64C90Fdb24F275861067BF332A0C7661cb938F99` |

**PancakeSwap BSC Testnet:**
- WBNB: `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`
- Router: `0xD99D1c33F9fC3444f8101754aBC46c52416550D1`
- Factory: `0x6725F303b657a9451d8BA641348b6761A6CC7a17`

---

## Step 3: Create BEAN/WBNB Liquidity Pool

The Treasury needs a BEAN/WBNB pool to execute buybacks. You must create this pool on PancakeSwap V2 (the Treasury uses the V2 router).

### 3.1 Get BEAN tokens

BEAN is minted by GridMining when rounds settle. Until the game starts and at least one round settles, you have two options:

**Option A — Mint test BEAN via Hardhat (recommended for setup):**

1. Open Hardhat console:
   ```bash
   cd hardhat
   npx hardhat console --network bscTestnet
   ```

2. Attach to Bean and GridMining:
   ```javascript
   const bean = await ethers.getContractAt("Bean", "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c")
   const gridMining = await ethers.getContractAt("GridMining", "0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB")
   ```

3. Check deployer address and ownership:
   ```javascript
   const [deployer] = await ethers.getSigners()
   console.log("Deployer:", deployer.address)
   console.log("Bean owner:", await bean.owner())
   ```

4. **Note:** Bean has no public mint — only the minter (GridMining) can mint. So you cannot mint BEAN directly. You must either:
   - Start the game, play a round, let it settle, and win BEAN; or
   - Temporarily add a test mint function (not recommended for production); or
   - Create the pool with a very small amount of BEAN after the first round settles.

**Option B — Start game first, play one round, then create pool:**

1. Skip pool creation for now.
2. Do Step 5 (startFirstRound) — see below. The game can start without the pool.
3. Play a round: deploy BNB to blocks, wait 60s, call reset(), wait for VRF.
4. After round settles, winners get BEAN. Use that BEAN to create the pool.
5. Then do Step 4 (setPair, updateReserveSnapshot).

**Recommended flow:** Start the game without the pool. Play 1–2 rounds to earn BEAN. Then create the pool and configure setPair. Treasury buybacks will work only after the pool exists and setPair is called.

### 3.2 Create the pool on PancakeSwap V2

1. **Switch to BSC Testnet** in MetaMask (Chain ID 97).

2. **Open PancakeSwap V2 Add Liquidity:**
   - Go to: https://pancakeswap.finance/add/0x89BeA6C663D33b129525F14574b8eFdC1d19A39c/0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
   - Or: PancakeSwap → Trade → Liquidity → Add Liquidity
   - Select **BNB Chain Testnet** in the network dropdown
   - Token 1: Paste `0x89BeA6C663D33b129525F14574b8eFdC1d19A39c` (BEAN)
   - Token 2: WBNB (or paste `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd`)

3. **Enter amounts:**
   - You need both BEAN and tBNB (WBNB). Approve BEAN first if prompted.
   - Example: 1000 BEAN + 0.1 tBNB (adjust based on desired price)

4. **Add Liquidity** — confirm the transaction.

5. **Get the pair address:**
   - After adding, the pool is created. Find the pair address by:
     - **Option 1:** Check the transaction on BscScan — the `PairCreated` event from the Factory contains the pair address.
     - **Option 2:** Call the factory from Hardhat console:
       ```javascript
       const factory = await ethers.getContractAt(
         ["function getPair(address, address) view returns (address)"],
         "0x6725F303b657a9451d8BA641348b6761A6CC7a17"
       )
       const pair = await factory.getPair(
         "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c", // BEAN
         "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"  // WBNB
       )
       console.log("Pair address:", pair)
       ```
   - Save this pair address — you need it for Step 4.

---

## Step 4: Configure Bean TWAP (setPair + updateReserveSnapshot)

The Treasury uses Bean's TWAP oracle for buybacks. You must set the pair and populate reserve snapshots.

### 4.1 Call bean.setPair(pairAddress)

**Using Hardhat console:**

```bash
cd hardhat
npx hardhat console --network bscTestnet
```

```javascript
const bean = await ethers.getContractAt("Bean", "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c")
const pairAddress = "0x_YOUR_PAIR_ADDRESS_FROM_STEP_3"  // Replace!
const tx = await bean.setPair(pairAddress)
await tx.wait()
console.log("Pair set!")

// Verify
console.log("Bean pair:", await bean.pair())
```

**Using BscScan (if contract is verified):**

1. Go to https://testnet.bscscan.com/address/0x89BeA6C663D33b129525F14574b8eFdC1d19A39c#writeContract
2. Connect your wallet (deployer/owner)
3. Find `setPair` → enter the pair address → Write → Confirm

### 4.2 Call bean.updateReserveSnapshot() at least 3 times

TWAP needs at least 3 snapshots from different blocks. Wait for a new block between each call (~3 seconds on BSC testnet).

**Using Hardhat console:**

```javascript
// Call 3 times, waiting for new blocks
for (let i = 0; i < 3; i++) {
  const tx = await bean.updateReserveSnapshot()
  await tx.wait()
  console.log("Snapshot", i + 1, "done")
  if (i < 2) await new Promise(r => setTimeout(r, 4000))  // Wait 4s for new block
}

// Verify TWAP is ready
console.log("TWAP ready:", await bean.isTWAPReady())
```

**Using BscScan:** Call `updateReserveSnapshot` 3 times from the Write Contract tab, waiting a few seconds between each.

---

## Step 5: Start the Game (startFirstRound)

Once VRF consumer is added (done), you can start the game. The pool and TWAP can be configured later — the game will run, but Treasury buybacks will revert until setPair and updateReserveSnapshot are done.

### 5.1 Call gridMining.startFirstRound()

**Using Hardhat console:**

```bash
cd hardhat
npx hardhat console --network bscTestnet
```

```javascript
const gridMining = await ethers.getContractAt("GridMining", "0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB")
const tx = await gridMining.startFirstRound()
await tx.wait()
console.log("Game started!")

// Verify
const info = await gridMining.getCurrentRoundInfo()
console.log("Round:", info[0].toString())
console.log("Start:", new Date(Number(info[1]) * 1000).toISOString())
console.log("End:", new Date(Number(info[2]) * 1000).toISOString())
```

**Using BscScan:** Go to GridMining contract → Write Contract → `startFirstRound` → Write.

---

## Step 6: Update Backend .env

Ensure your Backend `.env` has the correct values. Copy from `.env.example` if needed:

```env
PORT=3001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/minebean
RPC_URL=https://bsc-testnet-dataseed.bnbchain.org

GRIDMINING_ADDRESS=0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB
BEAN_ADDRESS=0x89BeA6C663D33b129525F14574b8eFdC1d19A39c
AUTOMINER_ADDRESS=0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304
TREASURY_ADDRESS=0xD02139f8ce44AA168822a706BDa3dde6a2305728
STAKING_ADDRESS=0x64C90Fdb24F275861067BF332A0C7661cb938F99
```

The Backend `lib/contracts.js` uses these env vars with the new addresses as fallbacks, so it will work even if `.env` is missing them — but setting them explicitly is recommended.

### 6.1 Verify Bean minter (required for BNBEAN minting)

BEAN (BNBEAN) is minted by GridMining when rounds settle. If `bean.minter()` is not set to GridMining, minting will revert and you will see 0 Circulating Supply and no BNBEAN in wallets after claims.

**Verify in Hardhat console:**

```bash
cd hardhat
npx hardhat console --network bscTestnet
```

```javascript
const bean = await ethers.getContractAt("Bean", "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c")
const gridMiningAddr = "0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB"
console.log("Bean minter:", await bean.minter())
console.log("Expected (GridMining):", gridMiningAddr)
console.log("Match:", (await bean.minter()).toLowerCase() === gridMiningAddr.toLowerCase())
console.log("Bean totalSupply:", (await bean.totalSupply()).toString())
```

If minter is `0x0000...` or wrong, call `bean.setMinter(gridMiningAddr)` as the Bean owner (deployer).

---

## Step 7: Verify Contracts on BscScan (Optional)

Verification lets users read the source code and interact via the BscScan UI.

```bash
cd hardhat
```

**Bean (no constructor args):**
```bash
npx hardhat verify --network bscTestnet 0x89BeA6C663D33b129525F14574b8eFdC1d19A39c
```

**Treasury (3 args: bean, router, buybackThreshold):**
```bash
npx hardhat verify --network bscTestnet 0xD02139f8ce44AA168822a706BDa3dde6a2305728 "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c" "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" "10000000000000000"
```

**GridMining (4 args: vrfCoordinator, bean, treasury, feeCollector):**
```bash
npx hardhat verify --network bscTestnet 0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB "<VRF_COORDINATOR_FROM_ENV>" "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c" "0xD02139f8ce44AA168822a706BDa3dde6a2305728" "0xd7DEB87E5175f917709454D10a88878b2dE59631"
```
Replace `<VRF_COORDINATOR_FROM_ENV>` with your `VRF_COORDINATOR` value from hardhat/.env.

**AutoMiner (4 args: gridMining, executor, executorFeeBps, executorFlatFee):**
```bash
npx hardhat verify --network bscTestnet 0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304 "0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB" "0xd7DEB87E5175f917709454D10a88878b2dE59631" "100" "6000000000000"
```

**Staking (2 args: bean, treasury):**
```bash
npx hardhat verify --network bscTestnet 0x64C90Fdb24F275861067BF332A0C7661cb938F99 "0x89BeA6C663D33b129525F14574b8eFdC1d19A39c" "0xD02139f8ce44AA168822a706BDa3dde6a2305728"
```

---

## Step 8: Start Backend and Frontend

### Option A: Docker (recommended for local testing)

Requires [Docker](https://docs.docker.com/get-docker/) installed.

1. **Optional:** Create `.env` in the project root with Supabase keys (for profile features):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=<your_url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_key>
   ```

2. Start all services (MongoDB, backend, frontend):
   ```bash
   docker compose up --build
   ```

3. Open http://localhost:3000, connect MetaMask (BSC Testnet), and play.

4. Verify backend: `curl http://localhost:3001/health` returns `{"status":"ok","mongo":"connected",...}`

**Notes:**
- MongoDB runs locally in a container (no Atlas needed).
- Code changes are reflected via volume mounts (hot reload).
- Stop with `Ctrl+C` or `docker compose down`.

**Picking up new UI changes:** If you pull code changes (e.g. Claim Rewards card, Settle & Start Next button, crown persistence, Profile round history) and don't see them, restart Docker to rebuild the frontend:
  ```bash
  docker compose down && docker compose up --build
  ```

**INTERNAL_API_URL:** Docker Compose sets `INTERNAL_API_URL=http://backend:3001` for the frontend so Next.js API routes (Profile rounds, crown proxy) can reach the backend from inside the frontend container. For local dev without Docker, omit this — the app falls back to `localhost:3001`.

### Option B: Manual (npm)

#### 8.1 Backend

```bash
cd Backend
npm install
npm run dev
```

Verify: `curl http://localhost:3001/health` should return `{"status":"ok","mongo":"connected",...}`

#### 8.2 Frontend

1. Ensure `.env.local` has:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_SUPABASE_URL=<your_url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_key>
   ```

2. Start:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000, connect MetaMask (BSC Testnet), and play.

---

## Step 9: Update LP Address (After Pool Created)

When you create the BEAN/WBNB pool, update the LP placeholder in `lib/contracts.ts`:

```typescript
LP: {
  address: '0x_YOUR_PAIR_ADDRESS' as `0x${string}`,
},
```

Replace `0xd7e5522c9cc3682c960afada6adde0f8116580f2ad2cef08c197faf625e53842` with the actual pair address from Step 3.

---

## Full Checklist

| # | Task | Done |
|---|------|------|
| 1 | Deploy contracts | [x] |
| 2 | Add GridMining as VRF consumer | [x] |
| 3 | Create BEAN/WBNB pool on PancakeSwap | [ ] |
| 4a | Call bean.setPair(pairAddress) | [ ] |
| 4b | Call bean.updateReserveSnapshot() 3x | [ ] |
| 5 | Call gridMining.startFirstRound() | [ ] |
| 6 | Update Backend .env with addresses | [ ] |
| 7 | Verify contracts on BscScan | [ ] |
| 8a | Start backend (Docker or npm) | [ ] |
| 8b | Start frontend (Docker or npm) | [ ] |
| 9 | Update LP address in lib/contracts.ts | [ ] |

---

## Recommended Order

1. **Start the game** (Step 5) — no pool needed yet.
2. **Play 1–2 rounds** — deploy BNB, wait for round end, call reset(), wait for VRF, checkpoint, claim BEAN.
3. **Create pool** (Step 3) — use the BEAN you earned.
4. **Configure TWAP** (Step 4) — setPair and updateReserveSnapshot.
5. **Update Backend .env** (Step 6).
6. **Start backend and frontend** (Step 8) — use `docker compose up --build` or run manually.
7. **Update LP address** (Step 9) when you have the pair address.

---

## Pre-Launch Checklist

Before going live, run through [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md) to verify every game feature. It covers mining, rewards, AutoMiner, staking, Global, Profile, SSE, and mobile.

**Restart Docker after Backend changes** (e.g. indexer optimizations): `docker compose down && docker compose up --build`.

### Auto-reset (automatic round settlement)

Rounds can settle automatically without anyone clicking **Reset**. Add to Backend `.env`:

```
RESET_WALLET_PRIVATE_KEY=0x...   # Wallet with BNB for gas
```

The backend will call `GridMining.reset()` when a round ends. Fund the wallet with a small amount of BNB (e.g. 0.01) — each reset costs a few cents in gas. Disable with `AUTO_RESET_ENABLED=false`.

### AutoMiner executor (automated deployments each round)

AutoMiner users deposit BNB and configure a strategy; an **executor** must call `AutoMiner.executeFor(user, blocks)` each round to deploy on their behalf. Without this, AutoMiner configs are stored but nothing happens.

Add to Backend `.env`:

```
EXECUTOR_PRIVATE_KEY=0x...   # Wallet that is the configured AutoMiner executor (holds BNB for gas)
```

The executor wallet must match `await AutoMiner.executor()` (typically the deployer). Fund it with BNB for gas — each `executeFor` call costs a few cents. The contract deducts deployment amounts from users' deposits; the executor only pays gas.

- **Disable:** Omit `EXECUTOR_PRIVATE_KEY` or set `AUTO_MINER_EXECUTOR_ENABLED=false`
- **Poll interval:** `AUTO_MINER_EXECUTOR_POLL_MS=15000` (default 15s)

**Alternative (manual):** If you prefer not to run the executor service, document that the deployer must run a script or cron to call `executeFor` for active users each round until automated execution is enabled.

---

## Troubleshooting

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) Section 5 for VRF errors, TWAP not ready, port mismatch, and other common issues. For Docker-specific issues, see [DOCKER.md](DOCKER.md).

### BNBEAN not minting / 0 Circulating Supply / Checkpoint works but Claim disabled

**Step 1 — Run the diagnostic:** `curl http://localhost:3001/api/stats/diagnostic` (or open `/api/stats/diagnostic` in a browser). The response includes:

| Field | Meaning |
|-------|---------|
| `beanAddressMatch` | `true` = GridMining uses the same Bean as the app. `false` = GridMining mints to a different Bean (e.g. legacy) — app will show 0. |
| `minterMatchesGridMining` | `true` = Bean.minter() is set to GridMining. `false` = minting will revert. |
| `bnbeanMintStatus` | `ok` = all good. `bean_address_mismatch` = GridMining uses different Bean. `minter_mismatch` = run setMinter. `no_mints_yet` = VRF may need LINK. |
| `fixHint` | Suggested next step. |

**If `beanAddressMatch` is false (Bean address mismatch):**

GridMining was deployed with a different Bean (e.g. an older deployment). It mints to that Bean; the app reads from the new Bean. To fix:

1. **Redeploy the full stack** so GridMining, Treasury, Staking, and AutoMiner all use the new Bean:
   ```bash
   cd hardhat
   npx hardhat run scripts/deploy.js --network bscTestnet
   ```
2. Update `lib/contracts.ts` and `Backend/.env` with the new addresses from the deploy output.
3. Re-add GridMining as VRF consumer at vrf.chain.link.
4. Call `gridMining.startFirstRound()` again.

**If `minterMatchesGridMining` is false (minter not set):**

1. **Run setMinter script:**
   ```bash
   cd hardhat
   # Ensure hardhat/.env has DEPLOYER_PRIVATE_KEY (Bean owner) and optionally:
   # BEAN_ADDRESS=0x89BeA6C663D33b129525F14574b8eFdC1d19A39c
   # GRIDMINING_ADDRESS=0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB
   npx hardhat run scripts/setMinter.js --network bscTestnet
   ```
2. **Verify:** Call the diagnostic again. `minterMatchesGridMining` should be true. Play a new round — after it settles, BNBEAN will mint and you can checkpoint + claim.

**Other causes:**

- **Verify backend network:** Ensure Backend `RPC_URL` matches the chain (e.g. BSC Testnet).
- **Check claim tx:** On BscScan, find your `claimBEAN` transaction. If it reverted, you may have had 0 BEAN to claim.
- **Add BNBEAN to wallet:** In MetaMask, add custom token: address `0x89BeA6C663D33b129525F14574b8eFdC1d19A39c`, symbol BNBEAN, decimals 18.

### Crown (Winners panel) disappears on refresh

The award icon on the left shows when you win a round but may vanish after a page refresh.

**Causes:**
- Indexer timing: the backend polls every 12s (configurable via `INDEXER_POLL_INTERVAL_MS`). If you refresh immediately after winning, the round may not be in MongoDB yet.
- In Docker, `INTERNAL_API_URL=http://backend:3001` must be set so the Next.js proxy can reach the backend.

**Fixes applied:** The crown now retries 2–3 times (2s apart) on load and uses `sessionStorage` to remember the last round you won. If the crown still disappears, wait a few seconds after winning before refreshing, or win another round.

### RPC / API credit usage too high

If you're approaching your RPC provider's credit limit (e.g. 80M/month):

1. **Indexer optimizations (already applied):** The indexer now uses a single `eth_getLogs` for all 4 contracts (instead of 4 separate calls) and polls every 12s (instead of 3s). This reduces RPC calls by ~15–20x.
2. **Tune poll interval:** Set `INDEXER_POLL_INTERVAL_MS=20000` (20s) or higher in Backend `.env` to further reduce calls. Trade-off: events are indexed slightly slower.
3. **Check provider dashboard:** `eth_getlogs`, `eth_chainid`, and `eth_blocknumber` are the main consumers. The indexer drives most of these.

### Rewards not showing after checkpoint

After winning, settling, and resetting, BNB and BNBEAN may stay at 0.0000.

**Required step:** You must click **"Checkpoint Round N (required before claim)"** before rewards appear. Checkpoint credits the round's winnings into your pending balance. Then click **Claim BNBEAN** to receive tokens in your wallet.

**If you checkpointed and still see 0:**
- Rounds settled *before* the minter fix never credited on-chain — only new rounds (post-fix) have rewards.
- In Docker, ensure the frontend can reach the backend. Rewards are fetched via `/api/user/[address]/rewards` (Next.js proxy). Set `INTERNAL_API_URL` so the proxy works.
- **Checkpoint stuck on wrong round:** If the UI shows "Checkpoint Round 2" but you didn't deploy to round 2, the old contract required checkpointing rounds in sequence and could get stuck. The contract has been updated to skip rounds you didn't participate in — **redeploy GridMining** and update the address to fix this.

### Stats showing zeros (Circulating Supply, Protocol Revenue, BNB in Treasury)

**Diagnostic:** Call `GET /api/stats/diagnostic` (or `http://localhost:3001/api/stats/diagnostic` if backend runs separately). This returns raw contract reads (Bean.totalSupply, Treasury.getStats, minter address, etc.) to verify RPC, addresses, and minter.

**Common causes:** Wrong RPC (e.g. mainnet vs testnet), minter not set, or all-blocks strategy (vaultAmount = 0). Stats cache TTL was reduced (15s for stats, 30s for treasury) so values refresh sooner.

### VRF subscription must be funded with LINK

BNBEAN is minted only when Chainlink VRF fulfills a randomness request after a round ends. The contract uses `nativePayment: false`, so the VRF subscription must be funded with **LINK** (not BNB).

**If BNBEAN total supply is 0 and Bean.minter is correct:**
1. Go to [vrf.chain.link](https://vrf.chain.link)
2. Select **BSC Testnet** (or your network)
3. Find your subscription (ID from `VRF_SUBSCRIPTION_ID` in `hardhat/.env`)
4. Add **LINK** to the subscription — BSC Testnet LINK from the [faucet](https://faucets.chain.link/bnb-testnet)
5. Wait for the next round to end — auto-reset will request VRF, and once fulfilled, BNBEAN will mint

Without LINK, VRF never fulfills, so no `RoundSettled` events and no BNBEAN minting.

### BNBEAN Debugging Guide

Use these steps to trace why BNBEAN rewards are not minting or not appearing in your wallet.

1. **Verify contract mints BNBEAN**
   - On BscScan, open the GridMining contract and check **Events** for `RoundSettled`. Each event includes `topMinerReward` and `beanpotAmount`.
   - Check the Bean contract for `Transfer` events from `0x0` (mint) to GridMining — these confirm BNBEAN was minted for the round.

2. **Verify checkpoint flow**
   - `checkpoint(roundId)` only works if you deployed to that round. If `getTotalPendingRewards` returns round 2 but you never deployed to round 2, the contract returns early (no revert, no state change).
   - Use Hardhat console: `await gridMining.getMinerInfo(roundId, yourAddress)` — confirm `amountPerBlock > 0` and `checkpointed == false` for the round you're trying to checkpoint.

3. **Backend workaround for stuck checkpoint**
   - The rewards API iterates rounds and returns the first round you deployed to (skipping rounds you didn't participate in). Ensure the Backend has been **restarted** after this workaround was added.
   - Frontend calls `/api/user/[address]/rewards` (Next.js proxy). Confirm `NEXT_PUBLIC_API_URL` or default points to the correct Backend.

4. **Transaction inspection**
   - For a `checkpoint(2)` tx: decode input `0x2d588b18...000002` → `checkpoint(2)`. If you had no deployment in round 2, the contract returns early and `userLastRound` does not advance.
   - Check `Checkpointed` events on BscScan — if none were emitted for your address, the checkpoint did nothing.

5. **Long-term fix**
   - Redeploy GridMining with the fixed `getTotalPendingRewards` (already in source) and update addresses in `lib/contracts.ts` and `Backend/lib/contracts.js`.
