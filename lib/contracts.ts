import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x2988C22746A6388B0F967Dac676616e08C5AC1aa' as `0x${string}`,
    abi: GridMiningABI,
  },
  Bean: {
    address: '0xBfA0F620C0C7BD02Aa6138eB505F4B74Dd1aFD03' as `0x${string}`,
    abi: BeanABI,
  },
  AutoMiner: {
    address: '0xe848b866DDeDD459cEE73311Cde1C8570f3Dc898' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0x8b02C2Fe3831f1B10362Cc11017E55BFf58fD25c' as `0x${string}`,
    abi: TreasuryABI,
  },
  LP: {
    address: '0xd7e5522c9cc3682c960afada6adde0f8116580f2ad2cef08c197faf625e53842' as `0x${string}`,
  },
  Staking: {
    address: '0x49811966b9224a5655c54310f2231EA54C105b77' as `0x${string}`,
    abi: StakingABI,
  },
} as const

// Below values are used by frontend validations to avoid users submitting tx's that will revert due to contract limits.
// Make sure they reflect the true contract values.
export const MIN_DEPLOY_PER_BLOCK = 0.0000025 // BNB
export const EXECUTOR_FEE_BPS = 100 // 1% AutoMiner executor fee
export const EXECUTOR_FLAT_FEE = 0.000006 // BNB per round — fee floor for AutoMiner

// ERC-8021 Builder Code attribution suffix (bc_rudgiazu)
export const BUILDER_CODE_SUFFIX = '0x62635f7275646769617a750b0080218021802180218021802180218021' as `0x${string}`
