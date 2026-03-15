# Rewards & Crown — Troubleshooting

## BNBEAN not showing / 0 Circulating Supply

**Cause:** The Bean minter was set to the wrong address. GridMining could not mint BEAN during settlement, so `bean.mint()` reverted and rounds failed to settle fully.

**Fix applied:** `bean.setMinter(0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB)` — GridMining is now the minter.

**Important:** Only rounds that settle **after** the minter fix will mint BEAN. Rounds that attempted to settle before the fix would have reverted (no BEAN, no BNB credited on-chain).

- **New rounds** (post-fix): Will mint 1 BEAN per round and credit winners correctly.
- **Old rounds** (pre-fix): Did not settle on-chain; Profile may show "expected" winnings from DB, but the contract never credited them.

## BNB rewards flow

1. **Checkpoint** — Credits `userUnclaimedETH` and `userUnclaimedBEAN` from the round into your pending balance.
2. **Claim BNB** — Sends `userUnclaimedETH` to your wallet.
3. **Claim BEAN** — Sends BNBEAN to your wallet (10% roasting fee on unroasted only).

If you checkpointed and see 0 BNB / 0 BEAN in the Rewards panel, either:
- The round never settled on-chain (pre-fix), or
- You already claimed and the pending balance is 0.

## Crown (Winners panel) persistence

The crown fetches the latest settled round's miners from the backend. It now has a fallback: if the proxy returns empty, it tries the backend URL directly.

**Requirements for crown to show after refresh:**
- Backend indexer must have processed `RoundSettled` events.
- MongoDB must have `Round` documents with `settled: true`.
- In Docker, `INTERNAL_API_URL=http://backend:3001` must be set so the proxy can reach the backend.

**Note:** The indexer starts from the current block when the backend starts. It does not backfill. If you restarted Docker, only rounds that settle *after* the restart will be in the DB. Wait for a new round to settle, then the crown should persist.
