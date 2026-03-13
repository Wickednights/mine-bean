import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x597Af29D204EE1d019Df89f1E93Cf013b098BEf4' as `0x${string}`,
    abi: GridMiningABI,
  },
  Bean: {
    address: '0xC9ccBa0104a105EcB35B962BD1302cfCF4AE6BEF' as `0x${string}`,
    abi: BeanABI,
  },
  AutoMiner: {
    address: '0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0xD02139f8ce44AA168822a706BDa3dde6a2305728' as `0x${string}`,
    abi: TreasuryABI,
  },
  // TODO: Add LP pair address after creating BEAN/WBNB pool on PancakeSwap
  LP: {
    address: '0xd7e5522c9cc3682c960afada6adde0f8116580f2ad2cef08c197faf625e53842' as `0x${string}`,
  },
  Staking: {
    address: '0x64C90Fdb24F275861067BF332A0C7661cb938F99' as `0x${string}`,
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
