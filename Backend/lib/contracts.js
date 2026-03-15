const { ethers } = require('ethers');

const GridMiningABI = require('../abis/GridMining.json');
const AutoMinerABI = require('../abis/AutoMiner.json');
const BeanABI = require('../abis/Bean.json');
const TreasuryABI = require('../abis/Treasury.json');
const StakingABI = require('../abis/Staking.json');

const ADDRESSES = {
  GridMining: process.env.GRIDMINING_ADDRESS || '0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB',
  Bean: process.env.BEAN_ADDRESS || '0xC9ccBa0104a105EcB35B962BD1302cfCF4AE6BEF',
  AutoMiner: process.env.AUTOMINER_ADDRESS || '0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304',
  Treasury: process.env.TREASURY_ADDRESS || '0xD02139f8ce44AA168822a706BDa3dde6a2305728',
  Staking: process.env.STAKING_ADDRESS || '0x64C90Fdb24F275861067BF332A0C7661cb938F99',
};

let provider;
let contracts = {};

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://bsc-testnet-dataseed.bnbchain.org');
  }
  return provider;
}

function getContracts() {
  if (Object.keys(contracts).length === 0) {
    const p = getProvider();
    contracts = {
      GridMining: new ethers.Contract(ADDRESSES.GridMining, GridMiningABI, p),
      Bean: new ethers.Contract(ADDRESSES.Bean, BeanABI, p),
      AutoMiner: new ethers.Contract(ADDRESSES.AutoMiner, AutoMinerABI, p),
      Treasury: new ethers.Contract(ADDRESSES.Treasury, TreasuryABI, p),
      Staking: new ethers.Contract(ADDRESSES.Staking, StakingABI, p),
    };
  }
  return contracts;
}

module.exports = { ADDRESSES, getProvider, getContracts };
