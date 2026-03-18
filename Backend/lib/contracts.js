const { ethers } = require('ethers');

const GridMiningABI = require('../abis/GridMining.json');
const AutoMinerABI = require('../abis/AutoMiner.json');
const BeanABI = require('../abis/Bean.json');
const TreasuryABI = require('../abis/Treasury.json');
const StakingABI = require('../abis/Staking.json');

const ADDRESSES = {
  GridMining: process.env.GRIDMINING_ADDRESS || '0x268Cac7cCEFa8F542a3B64002D66Edc3d6C930FB',
  Bean: process.env.BEAN_ADDRESS || '0x89BeA6C663D33b129525F14574b8eFdC1d19A39c',
  AutoMiner: process.env.AUTOMINER_ADDRESS || '0xCdB629B6E58BBae482adfE49B9886a6a1BBD7304',
  Treasury: process.env.TREASURY_ADDRESS || '0x90bAbE945cffaA081a3853acFeAe1c97cEf726F4',
  Staking: process.env.STAKING_ADDRESS || '0xeDcA64d1620D544Ac0184467CAc24867e682Bdc7',
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
