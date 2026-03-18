# BEAN Protocol — Testnet Deployment Guide (Beginner)

This guide walks you through deploying and testing the full BEAN Protocol on **BSC Testnet** from scratch. It assumes you have zero Hardhat experience.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Hardhat & Dependencies](#2-install-hardhat--dependencies)
3. [Configure Environment Variables](#3-configure-environment-variables)
4. [Compile Contracts](#4-compile-contracts)
5. [Get Testnet BNB](#5-get-testnet-bnb)
6. [VRF Setup (Chainlink)](#6-vrf-setup-chainlink)
7. [Deploy to BSC Testnet](#7-deploy-to-bsc-testnet)
8. [Post-Deployment Configuration](#8-post-deployment-configuration)
9. [Start the Game](#9-start-the-game)
10. [Testing the Game Functions](#10-testing-the-game-functions)
11. [Connect Frontend to Testnet](#11-connect-frontend-to-testnet)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### Install Node.js (v18 or v20)

Check if you have it:
```bash
node --version
npm --version
```

If not installed, install via nvm (Node Version Manager):
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart your terminal, then:
nvm install 20
nvm use 20

# Verify
node --version   # Should show v20.x.x
npm --version    # Should show 10.x.x
```

### Install a Code Editor

If you don't have one, VS Code is recommended: https://code.visualstudio.com/

### MetaMask Wallet

You'll need MetaMask (or another wallet) with BSC Testnet added:

1. Open MetaMask → Settings → Networks → Add Network
2. Fill in:
   - **Network Name:** BSC Testnet
   - **RPC URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
   - **Chain ID:** `97`
   - **Currency Symbol:** `tBNB`
   - **Block Explorer:** `https://testnet.bscscan.com`

---

## 2. Install Hardhat & Dependencies

Navigate to the hardhat directory and install:

```bash
# From the project root
cd hardhat

# Install all dependencies (Hardhat, OpenZeppelin, etc.)
npm install
```

This installs everything defined in `package.json`:
- **hardhat** — The development framework for compiling, deploying, and testing Solidity contracts
- **@nomicfoundation/hardhat-toolbox** — Bundle of useful Hardhat plugins (ethers.js, testing tools, gas reporting, contract verification)
- **@openzeppelin/contracts** — Battle-tested smart contract library (we use `ReentrancyGuard`, `Ownable`, `ERC20`)
- **dotenv** — Loads environment variables from a `.env` file so you don't hardcode private keys

After install, you should see a `node_modules` folder appear. That's normal — it contains all the downloaded packages.

### Verify Hardhat Works

```bash
npx hardhat --version
```

You should see something like `2.19.x`. The `npx` command runs Hardhat from your local `node_modules` without needing a global install.

---

## 3. Configure Environment Variables

Environment variables store sensitive data (private keys, API keys) outside your code. They're loaded from a `.env` file that should **never** be committed to git.

### Create Your `.env` File

```bash
# From the hardhat/ directory
cp .env.example .env
```

Now edit the `.env` file with your values:

```env
# Your wallet's private key (the one that will deploy contracts)
# NEVER share this. NEVER commit it to git.
# Export from MetaMask: Account Details → Export Private Key
DEPLOYER_PRIVATE_KEY=your_private_key_here_without_0x_prefix

# BSC Testnet RPC (the hardhat config already has a default, but you can override)
RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# For verifying contracts on BscScan (optional but recommended)
# Get one free at: https://bscscan.com/myapikey
BSCSCAN_API_KEY=your_bscscan_api_key

# Chainlink VRF on BSC Testnet
VRF_COORDINATOR=0x6A2AAd07396B36Fe02a22b33cf443582f682c82f
VRF_SUBSCRIPTION_ID=your_subscription_id_number
VRF_KEY_HASH=0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13b8009f8a7

# PancakeSwap addresses (BSC Testnet)
# Note: PancakeSwap V2 Router on testnet
PANCAKESWAP_ROUTER=0xD99D1c33F9fC3444f8101754aBC46c52416550D1
PANCAKESWAP_FACTORY=0x6725F303b657a9451d8BA641348b6761A6CC7a17
WBNB=0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
```

### Where to Get Each Value

| Variable | Where to Get It |
|----------|----------------|
| `DEPLOYER_PRIVATE_KEY` | MetaMask → click account icon → Account Details → Show Private Key. Remove the `0x` prefix. |
| `VRF_COORDINATOR` | Chainlink docs: `0x6A2AAd07396B36Fe02a22b33cf443582f682c82f` for BSC Testnet |
| `VRF_SUBSCRIPTION_ID` | From the VRF subscription you already created at [vrf.chain.link](https://vrf.chain.link). It's the number shown on your subscription page. |
| `VRF_KEY_HASH` | Chainlink docs — `0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13b8009f8a7` is the 200 gwei key hash for BSC Testnet |
| `BSCSCAN_API_KEY` | [bscscan.com/myapikey](https://bscscan.com/myapikey) — free account |

> **Security Note:** The `.gitignore` in this project already excludes `.env` files. Double-check that `.env` is listed in `.gitignore` so it never gets committed.

---

## 4. Compile Contracts

Compiling turns your Solidity (`.sol`) files into bytecode that the blockchain can execute, plus ABIs (Application Binary Interfaces) that the frontend uses to talk to the contracts.

```bash
# From the hardhat/ directory
npm run compile
```

This is equivalent to `npx hardhat compile`.

**What happens:**
1. Hardhat reads all `.sol` files in `contracts/`
2. Compiles them with Solidity 0.8.24 (with optimizer enabled, 200 runs)
3. Outputs compiled artifacts to `artifacts/` and `cache/`

**Expected output:**
```
Compiled 10 Solidity files successfully (with 1 warning).
```

Warnings about unused variables or SPDX licenses are normal and safe to ignore.

**If you get errors:**
- `Error: Cannot find module '@openzeppelin/contracts/...'` → Run `npm install` again
- `ParserError: Source file requires different compiler version` → Check `hardhat.config.js` uses `0.8.24`

---

## 5. Get Testnet BNB

You need testnet BNB (tBNB) to pay for gas fees when deploying contracts and playing the game. Testnet BNB is free.

### BSC Testnet Faucet

1. Go to: https://www.bnbchain.org/en/testnet-faucet
2. Paste your wallet address
3. Request tBNB

You'll need roughly **0.5 tBNB** for all deployments and testing. If the faucet gives you less, just request multiple times.

### Verify Your Balance

```bash
# From the hardhat/ directory
npx hardhat console --network bscTestnet
```

Then in the console:
```javascript
const [deployer] = await ethers.getSigners()
console.log("Address:", deployer.address)
const balance = await ethers.provider.getBalance(deployer.address)
console.log("Balance:", ethers.formatEther(balance), "tBNB")
.exit
```

---

## 6. VRF Setup (Chainlink)

You mentioned you've already created a VRF subscription and funded it with 5 LINK. Here's what you need to do with it:

### What is VRF?

VRF (Verifiable Random Function) is Chainlink's on-chain random number generator. Your game needs it to pick the winning block each round. Without VRF, rounds can't settle.

### Your VRF Subscription

Go to [vrf.chain.link](https://vrf.chain.link):
1. Make sure you're on **BSC Testnet** in the top-right network selector
2. Click on your subscription
3. Note your **Subscription ID** (a number like `1234`) — put this in your `.env` as `VRF_SUBSCRIPTION_ID`

### Add Consumer (After Deployment)

After you deploy the GridMining contract, you'll need to add its address as a **consumer** on your VRF subscription. This tells Chainlink "this contract is allowed to request random numbers using my subscription's LINK."

We'll do this step after deployment — just keep the VRF dashboard open.

---

## 7. Deploy to BSC Testnet

Now the main event. The deploy script (`scripts/deploy.js`) deploys all 5 contracts in order and configures them:

1. **Bean** — The BNBEAN ERC20 token
2. **GridMining** — The core mining game
3. **AutoMiner** — Automated mining executor
4. **Staking** — BEAN staking for yield
5. **Treasury** — Protocol revenue & buybacks

### Run the Deployment

```bash
# From the hardhat/ directory
npm run deploy:testnet
```

This runs `npx hardhat run scripts/deploy.js --network bscTestnet`.

**Expected output:**
```
Deploying contracts with: 0xYourAddress...
Balance: 0.5 BNB

1. Deploying Bean (BNBEAN) token...
   Bean deployed to: 0x...

2. Deploying GridMining...
   GridMining deployed to: 0x...

3. Deploying AutoMiner...
   AutoMiner deployed to: 0x...

4. Deploying Staking...
   Staking deployed to: 0x...

5. Deploying Treasury...
   Treasury deployed to: 0x...

--- Configuring contracts ---

Setting Bean minter to GridMining...
Setting GridMining autoMiner...
Setting GridMining treasury...
Setting GridMining fee collector...
Setting Treasury gridMining...
Setting Treasury staking...
Setting Staking treasury...
Setting AutoMiner executor...
Setting VRF config...

════════════════════════════════════════════
  BEAN Protocol — Deployment Complete
════════════════════════════════════════════
  Bean (BNBEAN):  0x...
  GridMining:     0x...
  AutoMiner:      0x...
  Staking:        0x...
  Treasury:       0x...
════════════════════════════════════════════
```

**IMPORTANT: Save these addresses!** You'll need them for the frontend and VRF setup. Copy them somewhere safe.

### If Deployment Fails

| Error | Solution |
|-------|----------|
| `Error: insufficient funds` | Get more tBNB from the faucet |
| `ERROR: VRF_COORDINATOR env var not set` | Set `VRF_COORDINATOR` in your `.env` file |
| `Error: network bscTestnet not found` | Make sure you're in the `hardhat/` directory |
| `ProviderError: transaction underpriced` | Wait 30 seconds and try again (network congestion) |
| Timeout errors | The BSC testnet RPC can be slow. Try a different RPC URL in `.env`: `https://data-seed-prebsc-2-s1.binance.org:8545` |

---

## 8. Post-Deployment Configuration

### 8.1 Add GridMining as VRF Consumer

This is the most critical step. Without this, the game can't settle rounds.

1. Go to [vrf.chain.link](https://vrf.chain.link)
2. Make sure you're on **BSC Testnet**
3. Click your subscription
4. Click **"Add consumer"**
5. Paste the **GridMining** contract address from your deployment output
6. Confirm the transaction in MetaMask

### 8.2 Verify Contracts on BscScan (Optional but Recommended)

Verifying lets anyone read your contract source code on BscScan. It also lets you interact with contracts directly through BscScan's UI (useful for testing).

```bash
# Verify Bean (no constructor args)
npx hardhat verify --network bscTestnet BEAN_ADDRESS

# Verify GridMining (2 constructor args: bean address, vrf coordinator)
npx hardhat verify --network bscTestnet GRIDMINING_ADDRESS "BEAN_ADDRESS" "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f"

# Verify AutoMiner (1 constructor arg: gridMining address)
npx hardhat verify --network bscTestnet AUTOMINER_ADDRESS "GRIDMINING_ADDRESS"

# Verify Staking (1 constructor arg: bean address)
npx hardhat verify --network bscTestnet STAKING_ADDRESS "BEAN_ADDRESS"

# Verify Treasury (3 constructor args: bean, router, buybackThreshold)
npx hardhat verify --network bscTestnet TREASURY_ADDRESS "BEAN_ADDRESS" "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" "10000000000000000"
```

Replace the `_ADDRESS` placeholders with your actual deployed addresses.

---

## 9. Start the Game

Once deployed and VRF is configured, you start the game by calling `startFirstRound()`.

### Option A: Using Hardhat Console

```bash
npx hardhat console --network bscTestnet
```

```javascript
// Attach to your deployed GridMining contract
const gridMining = await ethers.getContractAt("GridMining", "YOUR_GRIDMINING_ADDRESS")

// Start the game!
const tx = await gridMining.startFirstRound()
await tx.wait()
console.log("Game started! First round is live.")

// Verify it worked
const info = await gridMining.getCurrentRoundInfo()
console.log("Round:", info[0].toString())
console.log("Start:", new Date(Number(info[1]) * 1000).toISOString())
console.log("End:", new Date(Number(info[2]) * 1000).toISOString())

.exit
```

### Option B: Using BscScan (If Verified)

1. Go to `https://testnet.bscscan.com/address/YOUR_GRIDMINING_ADDRESS#writeContract`
2. Connect your wallet (the deployer wallet)
3. Find `startFirstRound` → Click "Write"
4. Confirm in MetaMask

---

## 10. Testing the Game Functions

### 10.1 Deploy to Blocks (Play a Round)

This is what users do — deploy BNB to blocks on the 5x5 grid.

```bash
npx hardhat console --network bscTestnet
```

```javascript
const gridMining = await ethers.getContractAt("GridMining", "YOUR_GRIDMINING_ADDRESS")

// Deploy to blocks 0, 5, 12 (0-indexed, max 24)
// Send 0.0003 tBNB total (0.0001 per block, must be >= 0.0000025 per block)
const tx = await gridMining.deploy(
  [0, 5, 12],
  { value: ethers.parseEther("0.0003") }
)
await tx.wait()
console.log("Deployed to blocks 0, 5, 12!")

// Check round status
const info = await gridMining.getCurrentRoundInfo()
console.log("Total deployed:", ethers.formatEther(info[3]), "BNB")

.exit
```

### 10.2 Settle a Round (Call Reset)

After 60 seconds, the round ends and needs to be settled. The `reset()` function triggers a VRF request.

```javascript
const gridMining = await ethers.getContractAt("GridMining", "YOUR_GRIDMINING_ADDRESS")

// Wait for round to end (60 seconds after start)
const info = await gridMining.getCurrentRoundInfo()
const endTime = Number(info[2])
const now = Math.floor(Date.now() / 1000)

if (now < endTime) {
  console.log(`Round ends in ${endTime - now} seconds. Wait and try again.`)
} else {
  console.log("Round ended, requesting VRF settlement...")
  const tx = await gridMining.reset()
  await tx.wait()
  console.log("VRF requested! Settlement will happen when Chainlink responds (10-60 seconds).")
}
```

After VRF responds, the round is settled and a new round starts automatically.

### 10.3 Check if Round Settled

```javascript
const gridMining = await ethers.getContractAt("GridMining", "YOUR_GRIDMINING_ADDRESS")

const roundId = 1  // Check round 1
const roundData = await gridMining.getRound(roundId)
console.log("Settled:", roundData[8])  // true/false
console.log("Winning block:", roundData[4])
console.log("Total winnings:", ethers.formatEther(roundData[3]))
```

### 10.4 Checkpoint and Claim Rewards

After a round settles, winners need to **checkpoint** (allocate their rewards) and then **claim**.

```javascript
const gridMining = await ethers.getContractAt("GridMining", "YOUR_GRIDMINING_ADDRESS")

// Checkpoint round 1 (allocate your rewards if you won)
const tx1 = await gridMining.checkpoint(1)
await tx1.wait()
console.log("Checkpointed!")

// Check pending rewards
const rewards = await gridMining.getTotalPendingRewards(deployer.address)
console.log("Pending ETH:", ethers.formatEther(rewards[0]))
console.log("Pending BEAN (unroasted):", ethers.formatEther(rewards[1]))
console.log("Pending BEAN (roasted):", ethers.formatEther(rewards[2]))

// Claim ETH
if (rewards[0] > 0n) {
  const tx2 = await gridMining.claimETH()
  await tx2.wait()
  console.log("ETH claimed!")
}

// Claim BEAN
if (rewards[1] > 0n || rewards[2] > 0n) {
  const tx3 = await gridMining.claimBEAN()
  await tx3.wait()
  console.log("BEAN claimed!")
}
```

### 10.5 Test AutoMiner

```javascript
const autoMiner = await ethers.getContractAt("AutoMiner", "YOUR_AUTOMINER_ADDRESS")

// Configure AutoMiner: Strategy=All (1), 5 rounds, 25 blocks, no mask
// Deposit enough ETH for 5 rounds × 25 blocks × 0.0000025 min per block = 0.0003125
// Plus executor fees
const tx = await autoMiner.setConfig(
  1,    // strategyId: 1 = All blocks
  5,    // numRounds
  25,   // numBlocks
  0,    // blockMask (0 for All strategy)
  { value: ethers.parseEther("0.001") }
)
await tx.wait()
console.log("AutoMiner configured!")

// Check config
const config = await autoMiner.getConfig(deployer.address)
console.log("Active:", config.active)
console.log("Strategy:", config.strategyId)
console.log("Rounds:", config.numRounds)
```

### 10.6 Test Staking

```javascript
const bean = await ethers.getContractAt("Bean", "YOUR_BEAN_ADDRESS")
const staking = await ethers.getContractAt("Staking", "YOUR_STAKING_ADDRESS")

// First, check your BEAN balance (you'll have some after winning rounds)
const balance = await bean.balanceOf(deployer.address)
console.log("BEAN balance:", ethers.formatEther(balance))

// Approve staking contract to spend your BEAN
const approveAmount = ethers.parseEther("1.0")  // Approve 1 BEAN
const tx1 = await bean.approve("YOUR_STAKING_ADDRESS", approveAmount)
await tx1.wait()

// Deposit BEAN to stake
const tx2 = await staking.deposit(approveAmount)
await tx2.wait()
console.log("Staked 1 BEAN!")

// Check stake info
const info = await staking.getStakeInfo(deployer.address)
console.log("Staked balance:", ethers.formatEther(info[0]))
console.log("Pending rewards:", ethers.formatEther(info[1]))
```

---

## 11. Connect Frontend to Testnet

Once contracts are deployed and working, update the frontend to point at your testnet contracts.

### 11.1 Update Chain Configuration

Edit `lib/wagmi.ts` — change the chain imports from mainnet to testnet:

```typescript
// Change this:
import { bsc } from 'wagmi/chains'

// To this:
import { bscTestnet } from 'wagmi/chains'

// And update the chains array to use bscTestnet
```

### 11.2 Update Contract Addresses

Edit `lib/contracts.ts` — replace all mainnet addresses with your testnet deployment addresses:

```typescript
export const CONTRACTS = {
  Bean: {
    address: '0xYOUR_TESTNET_BEAN_ADDRESS' as `0x${string}`,
    abi: BeanABI,
  },
  GridMining: {
    address: '0xYOUR_TESTNET_GRIDMINING_ADDRESS' as `0x${string}`,
    abi: GridMiningABI,
  },
  AutoMiner: {
    address: '0xYOUR_TESTNET_AUTOMINER_ADDRESS' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0xYOUR_TESTNET_TREASURY_ADDRESS' as `0x${string}`,
    abi: TreasuryABI,
  },
  Staking: {
    address: '0xYOUR_TESTNET_STAKING_ADDRESS' as `0x${string}`,
    abi: StakingABI,
  },
}
```

### 11.3 Update Backend API URL

Your `.env.local` (frontend) should point to your testnet backend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 11.4 Run the Frontend

```bash
# From the project root (not hardhat/)
cd ..
npm run dev
```

Open `http://localhost:3000` in your browser with MetaMask on BSC Testnet.

---

## 12. Troubleshooting

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error: insufficient funds for gas` | Not enough tBNB | Get more from faucet |
| `VRFNotConfigured` | VRF params not set on GridMining | Check that `VRF_SUBSCRIPTION_ID` and `VRF_KEY_HASH` were set in `.env` before deploying. If not, call `setVRFConfig()` manually. |
| `OnlyCoordinatorCanFulfill` | Wrong VRF coordinator address | Verify `VRF_COORDINATOR` matches BSC Testnet: `0x6A2AAd07396B36Fe02a22b33cf443582f682c82f` |
| VRF never responds | GridMining not added as consumer | Add GridMining address as consumer on your VRF subscription at vrf.chain.link |
| VRF never responds | Subscription out of LINK | Fund your subscription with more LINK |
| `AlreadyDeployedThisRound` | You already deployed this round | Wait for the round to end and settle |
| `RoundNotActive` | Round has ended | Call `reset()` to settle and start the next round |
| `RoundNotEnded` | Round is still active | Wait for the 60-second timer to expire |
| `InsufficientDeployAmount` | Sent less than minimum | Each block needs at least 0.0000025 BNB |
| `GameNotStarted` | `startFirstRound()` hasn't been called | Call `startFirstRound()` as the owner |
| Contract verification fails | Constructor args wrong | Double-check the constructor arguments match exactly |
| `ProviderError: nonce too low` | Previous tx not yet mined | Wait 15 seconds and retry |

### Useful Commands

```bash
# Compile contracts
npm run compile

# Open interactive console on testnet
npx hardhat console --network bscTestnet

# Run local tests (no network needed)
npm run test

# Clean compiled artifacts and re-compile
npx hardhat clean && npm run compile

# Check gas prices
npx hardhat console --network bscTestnet
# then: (await ethers.provider.getFeeData()).gasPrice.toString()
```

### Checking Transactions on BscScan

All testnet transactions can be viewed at:
```
https://testnet.bscscan.com/tx/YOUR_TX_HASH
```

Or check your contract:
```
https://testnet.bscscan.com/address/YOUR_CONTRACT_ADDRESS
```

### VRF Debugging

If VRF requests aren't being fulfilled:

1. **Check subscription:** Go to [vrf.chain.link](https://vrf.chain.link), ensure:
   - You're on BSC Testnet
   - Subscription has LINK balance (you have 5 LINK — should be plenty)
   - GridMining address is listed as a consumer

2. **Check the VRF request:** After calling `reset()`, look at the transaction on BscScan. It should show a `ResetRequested` event with a `vrfRequestId`.

3. **Wait:** On testnet, VRF can take 10-60 seconds to respond. On mainnet it's usually faster.

4. **Emergency reset:** If VRF doesn't respond after 15 minutes:
   ```javascript
   const gridMining = await ethers.getContractAt("GridMining", "YOUR_ADDRESS")
   await (await gridMining.emergencyResetVRF()).wait()
   ```
   Note: `emergencyResetVRF()` has a 15-minute cooldown after round end.

---

## Quick Reference: Contract Architecture

```
┌─────────────┐     VRF      ┌───────────────┐
│  Chainlink   │─────────────▶│  GridMining    │
│  VRF v2      │◀─────────────│  (core game)  │
└─────────────┘  random words └──────┬────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
              ┌──────────┐   ┌──────────┐     ┌──────────┐
              │ AutoMiner│   │ Treasury │     │   Bean   │
              │(executor)│   │(buybacks)│     │  (ERC20) │
              └──────────┘   └────┬─────┘     └──────────┘
                                  │
                                  ▼
                            ┌──────────┐
                            │ Staking  │
                            │ (yield)  │
                            └──────────┘
```

**Flow:**
1. Users deploy BNB → GridMining
2. Round ends → GridMining calls Chainlink VRF for random number
3. VRF responds → GridMining settles round (winning block, rewards)
4. 10% of losing BNB → Treasury → buys BEAN on PancakeSwap → 50% burned, 50% to Staking
5. 1 BEAN minted per round to winners
6. Winners checkpoint + claim ETH and BEAN rewards

---

## What's Next After Testnet?

Once everything works on testnet:

1. **Write automated tests** — Create test files in `hardhat/test/` to verify all game logic
2. **Create liquidity pool** — Deploy a BEAN/WBNB pool on PancakeSwap testnet for Treasury buybacks
3. **Set up the backend** — The Express.js backend at `../Backend` needs to be configured for testnet contract addresses
4. **Run the full stack** — Frontend + Backend + Smart contracts all on testnet
5. **Audit** — Review contracts thoroughly before mainnet deployment
6. **Mainnet deployment** — Same process but with `npm run deploy:mainnet` and real BNB

---

## File Structure Reference

```
hardhat/
├── contracts/
│   ├── GridMining.sol    ← Core game: 5×5 grid, 60s rounds, VRF settlement
│   ├── Bean.sol          ← BNBEAN ERC20 token (3M max supply) + TWAP oracle
│   ├── AutoMiner.sol     ← Auto-deploy strategies (All/Random/Select)
│   ├── Treasury.sol      ← Vault fees → PancakeSwap buyback → burn/stake
│   └── Staking.sol       ← Deposit BEAN, earn yield from buybacks
├── scripts/
│   └── deploy.js         ← Deploys all 5 contracts + configures them
├── test/                 ← (empty — tests to be written)
├── hardhat.config.js     ← Compiler settings, network configs
├── package.json          ← Dependencies
├── .env.example          ← Template for environment variables
└── .env                  ← YOUR env vars (never commit this!)
```
