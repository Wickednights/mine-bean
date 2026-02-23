import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x63EBE4e2e2710CA02617912160a1A97799c5B50B' as `0x${string}`,
    abi: GridMiningABI,
  },
  Bean: {
    address: '0x958607Bb23262e86d04e81747f8955518F2e1f7F' as `0x${string}`,
    abi: BeanABI,
  },
  AutoMiner: {
    address: '0x04CDB3154715FA1538378aaD7fF2aa094dD2A528' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0x9444d4Be677260a579075e8229910ED1D1818357' as `0x${string}`,
    abi: TreasuryABI,
  },
  LP: {
    address: '' as `0x${string}`,
  },
  Staking: {
    address: '0x58237d94dD81251289b17830A11A33c75117dcf3' as `0x${string}`,
    abi: StakingABI,
  },
} as const

// Below values are used by frontend validations to avoid users submitting tx's that will revert due to contract limits.
// Make sure they reflect the true contract values.
export const MIN_DEPLOY_PER_BLOCK = 0.0000025 // ETH
export const EXECUTOR_FEE_BPS = 100 // 1% AutoMiner executor fee
