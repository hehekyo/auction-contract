const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  try {
    // 部署 ERC20 代币
    const MyToken = await hre.ethers.getContractFactory("MyERC20");
    const myToken = await hre.ethers.deployContract("MyERC20", ["MyToken", "MTK"]);
    await myToken.waitForDeployment();
    console.log("MyToken deployed to:", await myToken.getAddress());

    // 部署 NFT
    const MyNFT = await hre.ethers.getContractFactory("MyNFT");
    const myNFT = await hre.ethers.deployContract("MyNFT");
    await myNFT.waitForDeployment();
    console.log("MyNFT deployed to:", await myNFT.getAddress());

    // 部署 AuctionManager
    const AuctionManager = await hre.ethers.getContractFactory("AuctionManager");
    const auctionManager = await hre.upgrades.deployProxy(
      AuctionManager,
      [deployer.address, await myToken.getAddress()],
      { kind: 'uups' }
    );
    await auctionManager.waitForDeployment();
    console.log("AuctionManager deployed to:", await auctionManager.getAddress());
  } catch (error) {
    console.error("Deployment error:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 