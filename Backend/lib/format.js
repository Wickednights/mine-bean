const { ethers } = require('ethers');

function formatWei(wei, decimals = 18) {
  if (!wei) return '0.0';
  return ethers.formatUnits(wei.toString(), decimals);
}

function formatEth(wei) {
  return formatWei(wei, 18);
}

function truncateAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getRelativeTime(date) {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = { formatWei, formatEth, truncateAddress, getRelativeTime };
