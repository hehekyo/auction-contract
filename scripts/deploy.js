const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // 部署 ERC20 代币
  const MyToken = await hre.ethers.getContractFactory("MyERC20");
  const myToken = await MyToken.deploy("MyERC20", "MYE");
  await myToken.deployed();
  console.log("MyERC20 deployed to:", myToken.address);

  // 部署 AuctionManager
  const AuctionManager = await hre.ethers.getContractFactory("AuctionManager");
  const auctionManager = await AuctionManager.deploy(
    deployer.address,
    myToken.address
  );
  await auctionManager.waitForDeployment();

  console.log("AuctionManager deployed to:", auctionManager.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 