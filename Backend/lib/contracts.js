const { ethers } = require('ethers');

const GridMiningABI = require('../abis/GridMining.json');
const AutoMinerABI = require('../abis/AutoMiner.json');
const BeanABI = require('../abis/Bean.json');
const TreasuryABI = require('../abis/Treasury.json');
const StakingABI = require('../abis/Staking.json');

const ADDRESSES = {
  GridMining: '0x9632495bDb93FD6B0740Ab69cc6c71C9c01da4f0',
  Bean: '0x5c72992b83E74c4D5200A8E8920fB946214a5A5D',
  AutoMiner: '0x31358496900D600B2f523d6EdC4933E78F72De89',
  Treasury: '0x38F6E74148D6904286131e190d879A699fE3Aeb3',
  Staking: '0xfe177128Df8d336cAf99F787b72183D1E68Ff9c2',
};

let provider;
let contracts = {};

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://bsc-dataseed.binance.org');
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
