import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x6d13A234a589e73AD5868121859E4EcA3b027339' as `0x${string}`,
    abi: GridMiningABI,
  },
  Bean: {
    address: '0xD8D2cbe5D3EB89Bf1974bd276b37574B4bBe5F2c' as `0x${string}`,
    abi: BeanABI,
  },
  AutoMiner: {
    address: '0xaff68371ead83d6C56485a7A24Db3E002244a040' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0x4634846e66f5b8b0F8e9E7b30e31148b218E14e9' as `0x${string}`,
    abi: TreasuryABI,
  },
  LP: {
    address: '' as `0x${string}`,
  },
  Staking: {
    address: '0x3Db46e2957F0B720D2dB3d5C3dc862083521C811' as `0x${string}`,
    abi: StakingABI,
  },
} as const

// Below values are used by frontend validations to avoid users submitting tx's that will revert due to contract limits.
// Make sure they reflect the true contract values.
export const MIN_DEPLOY_PER_BLOCK = 0.0000025 // ETH
export const EXECUTOR_FEE_BPS = 100 // 1% AutoMiner executor fee
