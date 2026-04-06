# Mine Bean / BNBEAN — Shipping analysis (site + contracts)

**Goal:** Ship ASAP with a clear picture of what works, what depends on redeploy, and what to verify.

---

## Executive summary

| Area | Status | Notes |
|------|--------|--------|
| **Frontend (Next.js)** | **Working** | Deploy, claim, single-round checkpoint, AutoMiner, staking nav, Global, Profile, Debug Console, SSE hooks |
| **Backend / indexer** | **Working** | User rewards, `uncheckpointedRound` workaround, diagnostics, SSE events (`checkpointed` unchanged) |
| **GridMining (compiled)** | **Updated locally** | `checkpointPending`, `checkpointBatch`, deploy catch-up (`DEPLOY_CHECKPOINT_CATCHUP`), refactored `_executeCheckpoint` |
| **On-chain vs repo** | **Gap** | `lib/contracts.ts` still points at **existing** GridMining address — **new Solidity features are NOT live** until you redeploy and update the address + synced ABI |

---

## 1. Contracts — what’s implemented (source of truth: `hardhat/contracts/GridMining.sol`)

### Working patterns (unchanged behavior)

- **Deploy / deployFor** — grid mining per round, builder suffix support.
- **Single `checkpoint(roundId)`** — credits pending BNB/BNBEAN after a win when the user had a deployment that round.
- **`claimETH` / `claimBEAN`** — pull accrued pending balances.
- **VRF settlement, treasury, beanpot, reset** — core game loop (verify on your target network).
- **AutoMiner** — separate contract; frontend calls `setConfig` / `stop` with builder suffix.

### New (requires **new deployment**)

1. **`checkpointPending(uint256 maxRounds)`** — scans from `userLastRound + 1` through `currentRoundId`, only **settled** rounds, skips rounds with no deploy / already checkpointed, executes up to `maxRounds` (1–50). `nonReentrant`.
2. **`checkpointBatch(uint64[] roundIds)`** — sorts IDs ascending, dedupes, checkpoints each eligible round; **reverts** if any listed round is not settled (`RoundNotSettled`).
3. **Deploy catch-up** — at the start of `_deploy`, runs `_checkpointPendingForUser(user, 15)` so up to **15** pending rounds are cleared **before** the new deployment (reduces “forgot to checkpoint” friction).

### Safety / correctness

- **`_executeCheckpoint`** centralizes credit logic; winner path gated so **`winnersDeployed > 0`** before dividing (avoids divide-by-zero edge case).
- **ABI** — `lib/abis/GridMining.json` and `Backend/abis/GridMining.json` should be regenerated from artifacts after each contract change (done in repo after last compile).

### What’s NOT wired on-chain until you ship

- **`checkpointBatch`** — no UI button yet; power users / scripts can call it via wallet or cast.
- **Old deployment** — no `checkpointPending` / `checkpointBatch` / catch-up; frontend **“Sync pending”** will **revert** until GridMining is upgraded/redeployed and `CONTRACTS.GridMining.address` is updated.

---

## 2. Frontend — what works

| Feature | File / area | Notes |
|---------|-------------|--------|
| Connect + BSC | Wagmi / RainbowKit | Ensure chain matches deployment |
| Deploy | `app/page.tsx` → `deploy` | `dataSuffix: BUILDER_CODE_SUFFIX` |
| Claim BNB / BNBEAN | `handleClaimETH` / `handleClaimBEAN` | Refetch rewards on success/error |
| Checkpoint one round | `handleCheckpoint` + `ClaimRewards` | Backend surfaces `uncheckpointedRound` |
| **Sync pending** | `handleCheckpointPending` → `checkpointPending` | **New**; needs new GridMining |
| AutoMiner | `setConfig`, `stop` | Separate contract addresses in `contracts.ts` |
| Reset | `reset` | Operator / testing flow |
| Rewards UI | `ClaimRewards.tsx` | BNBEAN breakdown, manual round input, Debug link |
| Debug Console | `/debug`, `Backend/routes/debug.js` | Raw reads + status |
| User data | `UserDataContext` + API | Pending + uncheckpointed round |

### Gaps / risks

- **Contract address drift:** If Bean / Treasury / LP / Staking addresses change on redeploy, update **`lib/contracts.ts`** and any backend env vars that mirror them.
- **Tests:** `ClaimRewards.test.tsx` may still reference older copy (“Claim BEAN” vs “Claim BNBEAN”) — run `npm test` and align if failing.
- **Gas:** `checkpointPending(20)` + heavy history can be large; mobile wallets may need explicit gas or multiple txs on very old backlogs.

---

## 3. Backend / indexer — what works

- **`/api/user/...` rewards** — computes `uncheckpointedRound` with a **workaround** for older contract behavior (scan rounds for first deploy-without-checkpoint).
- **SSE** — `checkpointed` and other user events; no change needed for new checkpoint functions (same **`Checkpointed`** event).
- **`/api/debug`** — helps inspect miner state per round.
- **Diagnostics** — `GET /api/stats/diagnostic` (see `PRE_LAUNCH_CHECKLIST.md`).

### Gaps

- If you add **server-driven** batch checkpointing, you’d call the RPC with an unlocked wallet (usually **not** recommended); keep checkpointing **client-side** as now.
- After redeploy, confirm **Bean address** from `GridMining.bean()` matches `CONTRACTS.Bean` in frontend and token lists.

---

## 4. Pre-ship checklist (minimal)

1. `cd hardhat && npx hardhat compile` — green.
2. **Deploy** GridMining (and dependents if constructor args change).
3. Update **`lib/contracts.ts`** — `GridMining.address` (+ Bean/Treasury/etc. if changed).
4. **Copy ABI** from `artifacts/.../GridMining.json` → `lib/abis` + `Backend/abis` (or run the same `node` one-liner used in dev).
5. Restart **backend** / Docker so indexer picks up config if addresses are env-based.
6. Run **`PRE_LAUNCH_CHECKLIST.md`** smoke test (connect → deploy → settle → checkpoint → claim).
7. Test **Sync pending** on an account with **multiple** uncleared wins (only on new contract).

---

## 5. Quick “working vs not” matrix

| Item | Without new GridMining deploy | With new GridMining deploy |
|------|-------------------------------|----------------------------|
| Deploy / play rounds | Yes | Yes |
| `checkpoint(single)` | Yes | Yes |
| `claimETH` / `claimBEAN` | Yes | Yes |
| **Sync pending** button | **No** (revert) | **Yes** |
| **Auto catch-up on deploy** | **No** | **Yes** (up to 15 rounds) |
| `checkpointBatch` (manual) | **No** | **Yes** |

---

## 6. References

- `PRE_LAUNCH_CHECKLIST.md` — QA matrix for launch.
- `lib/contracts.ts` — all deployed addresses + `BUILDER_CODE_SUFFIX`, `CHECKPOINT_PENDING_DEFAULT_MAX`.
- `hardhat/contracts/GridMining.sol` — authoritative contract behavior.

---

*Last updated: aligns with repo after GridMining checkpoint batch + deploy catch-up + ABI sync + frontend `checkpointPending` wiring.*
