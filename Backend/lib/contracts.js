const { ethers } = require('ethers');

const GridMiningABI = require('../abis/GridMining.json');
const AutoMinerABI = require('../abis/AutoMiner.json');
const BeanABI = require('../abis/Bean.json');
const TreasuryABI = require('../abis/Treasury.json');
const StakingABI = require('../abis/Staking.json');

const ADDRESSES = {
  GridMining: process.env.GRIDMINING_ADDRESS || '0x2988C22746A6388B0F967Dac676616e08C5AC1aa',
  Bean: process.env.BEAN_ADDRESS || '0xBfA0F620C0C7BD02Aa6138eB505F4B74Dd1aFD03',
  AutoMiner: process.env.AUTOMINER_ADDRESS || '0xe848b866DDeDD459cEE73311Cde1C8570f3Dc898',
  Treasury: process.env.TREASURY_ADDRESS || '0x8b02C2Fe3831f1B10362Cc11017E55BFf58fD25c',
  Staking: process.env.STAKING_ADDRESS || '0x49811966b9224a5655c54310f2231EA54C105b77',
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
