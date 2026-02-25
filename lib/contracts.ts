import GridMiningABI from './abis/GridMining.json'
import AutoMinerABI from './abis/AutoMiner.json'
import BeanABI from './abis/Bean.json'
import TreasuryABI from './abis/Treasury.json'
import StakingABI from './abis/Staking.json'

export const CONTRACTS = {
  GridMining: {
    address: '0x854EeD669c32561Ab54cF3e9731FAbEE7890c0D3' as `0x${string}`,
    abi: GridMiningABI,
  },
  Bean: {
    address: '0xD8D2cbe5D3EB89Bf1974bd276b37574B4bBe5F2c' as `0x${string}`,
    abi: BeanABI,
  },
  AutoMiner: {
    address: '0x38f9BDEE9f2b41e9E2a1E013a3dCCb9d519B0272' as `0x${string}`,
    abi: AutoMinerABI,
  },
  Treasury: {
    address: '0x8ab9E48eB6e36ddd51dBD35628f5b9c78AEd3306' as `0x${string}`,
    abi: TreasuryABI,
  },
  LP: {
    address: '0x08e5e77763ba3deae8dd020e15727b06fe746a64fa562f66a66da3e38357b492' as `0x${string}`,
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
export const EXECUTOR_FLAT_FEE = 0.000006 // ETH per round — fee floor for AutoMiner
