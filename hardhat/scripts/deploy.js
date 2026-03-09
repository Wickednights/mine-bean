const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "BNB");

  // VRF Coordinator address — must be set for BSC
  const vrfCoordinator = process.env.VRF_COORDINATOR;
  if (!vrfCoordinator) {
    console.error("ERROR: VRF_COORDINATOR env var not set");
    process.exit(1);
  }

  // Executor fee config (defaults match production)
  const executorFeeBps = process.env.EXECUTOR_FEE_BPS || 100;        // 1%
  const executorFlatFee = process.env.EXECUTOR_FLAT_FEE
    ? hre.ethers.parseEther(process.env.EXECUTOR_FLAT_FEE)
    : hre.ethers.parseEther("0.000006");

  // Buyback threshold (defaults to 0.01 BNB)
  const buybackThreshold = process.env.BUYBACK_THRESHOLD
    ? hre.ethers.parseEther(process.env.BUYBACK_THRESHOLD)
    : hre.ethers.parseEther("0.01");

  // 1. Deploy Bean (BNBEAN) token
  console.log("\n1. Deploying Bean (BNBEAN) token...");
  const Bean = await hre.ethers.getContractFactory("Bean");
  const bean = await Bean.deploy();
  await bean.waitForDeployment();
  const beanAddress = await bean.getAddress();
  console.log("   Bean deployed to:", beanAddress);

  // 2. Deploy Treasury (needed by GridMining constructor)
  console.log("\n2. Deploying Treasury...");
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(beanAddress, buybackThreshold);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("   Treasury deployed to:", treasuryAddress);

  // 3. Deploy GridMining (constructor: vrfCoordinator, bean, treasury, feeCollector)
  console.log("\n3. Deploying GridMining...");
  const GridMining = await hre.ethers.getContractFactory("GridMining");
  const gridMining = await GridMining.deploy(
    vrfCoordinator,
    beanAddress,
    treasuryAddress,
    deployer.address   // feeCollector = deployer
  );
  await gridMining.waitForDeployment();
  const gridMiningAddress = await gridMining.getAddress();
  console.log("   GridMining deployed to:", gridMiningAddress);

  // 4. Deploy AutoMiner (constructor: gridMining, executor, feeBps, flatFee)
  console.log("\n4. Deploying AutoMiner...");
  const AutoMiner = await hre.ethers.getContractFactory("AutoMiner");
  const autoMiner = await AutoMiner.deploy(
    gridMiningAddress,
    deployer.address,   // executor = deployer
    executorFeeBps,
    executorFlatFee
  );
  await autoMiner.waitForDeployment();
  const autoMinerAddress = await autoMiner.getAddress();
  console.log("   AutoMiner deployed to:", autoMinerAddress);

  // 5. Deploy Staking (constructor: bean, treasury)
  console.log("\n5. Deploying Staking...");
  const Staking = await hre.ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(beanAddress, treasuryAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("   Staking deployed to:", stakingAddress);

  // ─── Configuration ───────────────────────────────────────────

  console.log("\n--- Configuring contracts ---\n");

  // Set Bean minter to GridMining
  console.log("Setting Bean minter to GridMining...");
  await (await bean.setMinter(gridMiningAddress)).wait();

  // Configure GridMining
  console.log("Setting GridMining autoMiner...");
  await (await gridMining.setAutoMiner(autoMinerAddress)).wait();

  // Configure Treasury
  console.log("Setting Treasury gridMining...");
  await (await treasury.setGridMining(gridMiningAddress)).wait();

  console.log("Setting Treasury staking...");
  await (await treasury.setStaking(stakingAddress)).wait();

  // VRF Config (must be set before starting the game)
  if (process.env.VRF_SUBSCRIPTION_ID && process.env.VRF_KEY_HASH) {
    console.log("Setting VRF config...");
    await (await gridMining.setVRFConfig(
      process.env.VRF_SUBSCRIPTION_ID,
      process.env.VRF_KEY_HASH,
      500000, // callback gas limit
      3       // request confirmations
    )).wait();
  } else {
    console.log("WARNING: VRF_SUBSCRIPTION_ID or VRF_KEY_HASH not set. Set VRF config manually before starting the game.");
  }

  // ─── Summary ─────────────────────────────────────────────────

  console.log("\n════════════════════════════════════════════");
  console.log("  BEAN Protocol — Deployment Complete");
  console.log("════════════════════════════════════════════");
  console.log(`  Bean (BNBEAN):  ${beanAddress}`);
  console.log(`  GridMining:     ${gridMiningAddress}`);
  console.log(`  AutoMiner:      ${autoMinerAddress}`);
  console.log(`  Staking:        ${stakingAddress}`);
  console.log(`  Treasury:       ${treasuryAddress}`);
  console.log("════════════════════════════════════════════");
  console.log("\nNext steps:");
  console.log("  1. Add GridMining as VRF consumer at vrf.chain.link");
  console.log("  2. Verify contracts on BscScan");
  console.log("  3. Create BNBEAN/WBNB liquidity pool on PancakeSwap");
  console.log("  4. Call gridMining.startFirstRound() to begin the game");
  console.log("  5. Freeze Bean minter: bean.freezeMinter()");
  console.log("  6. Update frontend contract addresses in lib/contracts.ts");
  console.log("  7. Update backend contract addresses in Backend/lib/contracts.js");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
