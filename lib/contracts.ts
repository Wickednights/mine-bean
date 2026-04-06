import type { Abi } from 'viem'
import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB' as `0x${string}`,
    abi: GridMiningABI as Abi,
  },
  // Bean (BNBEAN) — matches GridMining.bean() on-chain (legacy deployment)
  Bean: {
    address: '0x89BeA6C663D33b129525F14574b8eFdC1d19A39c' as `0x${string}`,
    abi: BeanABI as Abi,
  },
  AutoMiner: {
    address: '0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304' as `0x${string}`,
    abi: AutoMinerABI as Abi,
  },
  Treasury: {
    address: '0x90bAbE945cffaA081a3853acFeAe1c97cEf726F4' as `0x${string}`,
    abi: TreasuryABI as Abi,
  },
  // BEAN/WBNB pair address from PancakeSwap V2 (BSC Testnet). Update after creating pool — see POST_DEPLOYMENT_GUIDE Step 3.
  LP: {
    address: '0xf0cfc19A81D85504578f92c61D18FD46AB52505d' as `0x${string}`,
  },
  Staking: {
    address: '0xeDcA64d1620D544Ac0184467CAc24867e682Bdc7' as `0x${string}`,
    abi: StakingABI as Abi,
  },
} as const

// Below values are used by frontend validations to avoid users submitting tx's that will revert due to contract limits.
// Make sure they reflect the true contract values.
export const MIN_DEPLOY_PER_BLOCK = 0.0000025 // BNB
export const EXECUTOR_FEE_BPS = 100 // 1% AutoMiner executor fee
export const EXECUTOR_FLAT_FEE = 0.000006 // BNB per round — fee floor for AutoMiner

// ERC-8021 Builder Code attribution suffix (bc_rudgiazu)
export const BUILDER_CODE_SUFFIX = '0x62635f7275646769617a750b0080218021802180218021802180218021' as `0x${string}`

/** Default max rounds for `checkpointPending` — must be ≤ 50 (GridMining `MAX_CHECKPOINT_BATCH`). */
export const CHECKPOINT_PENDING_DEFAULT_MAX = 20
