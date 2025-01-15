import { ethers } from "hardhat";
import fs from 'fs';
import path from 'path';

const ADDRESS_FILE = path.join(__dirname, '../../config/contracts.json');
const ENV_FILE = path.join(__dirname, '../../config/env.conf');

// 确保 config 目录存在
const configDir = path.dirname(ADDRESS_FILE);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy WETH
  const WETH = await ethers.getContractFactory("WETH");
  const weth = await WETH.deploy();
  await weth.waitForDeployment();
  console.log("WETH deployed to:", await weth.getAddress());

  // Deploy DAToken with 1M initial supply
  const initialSupply = 1000000; // Use BigNumber
  const DAToken = await ethers.getContractFactory("DAToken");
  const daToken = await DAToken.deploy(initialSupply, deployer.address);
  await daToken.waitForDeployment();
  console.log("DAToken deployed to:", await daToken.getAddress());

  // Deploy DANFT
  const DANFT = await ethers.getContractFactory("DANFT");
  const daNFT = await DANFT.deploy(deployer.address);
  await daNFT.waitForDeployment();
  console.log("DANFT deployed to:", await daNFT.getAddress());

  // Deploy UniswapV2Factory
  const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await UniswapV2Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  console.log("UniswapV2Factory deployed to:", await factory.getAddress());

  // Deploy UniswapV2Router
  const UniswapV2Router = await ethers.getContractFactory("UniswapV2Router");
  const router = await UniswapV2Router.deploy(
    await factory.getAddress(),
    await weth.getAddress()
  );
  await router.waitForDeployment();
  console.log("UniswapV2Router deployed to:", await router.getAddress());

  // Deploy UniswapV2Query
  const UniswapV2Query = await ethers.getContractFactory("UniswapV2Query");
  const uniswapQuery = await UniswapV2Query.deploy(await factory.getAddress());
  await uniswapQuery.waitForDeployment();
  console.log("UniswapV2Query deployed to:", await uniswapQuery.getAddress());

  // Deploy DutchAuction
  const DutchAuction = await ethers.getContractFactory("DutchAuction");
  const dutchAuction = await DutchAuction.deploy();
  await dutchAuction.waitForDeployment();
  console.log("DutchAuction deployed to:", await dutchAuction.getAddress());

  // Deploy EnglishAuction
  const EnglishAuction = await ethers.getContractFactory("EnglishAuction");
  const englishAuction = await EnglishAuction.deploy(await daToken.getAddress());
  await englishAuction.waitForDeployment();
  console.log("EnglishAuction deployed to:", await englishAuction.getAddress());

  // Deploy Airdrop contract
  const Airdrop = await ethers.getContractFactory("Airdrop");
  const airdrop = await Airdrop.deploy();
  await airdrop.waitForDeployment();
  console.log("Airdrop deployed to:", await airdrop.getAddress());

  // Deploy AdAlliance contract
  const AdAlliance = await ethers.getContractFactory("AdAlliance");
  const adAlliance = await AdAlliance.deploy(daToken.getAddress()); // Pass the DAToken address
  await adAlliance.waitForDeployment();
  console.log("AdAlliance deployed to:", await adAlliance.getAddress());


  // Save deployed addresses for verification
  const addresses = {
    WETH: await weth.getAddress(),
    DAToken: await daToken.getAddress(),
    DANFT: await daNFT.getAddress(),
    UniswapV2Factory: await factory.getAddress(),
    UniswapV2Router: await router.getAddress(),
    UniswapV2Query: await uniswapQuery.getAddress(),
    DutchAuction: await dutchAuction.getAddress(),
    EnglishAuction: await englishAuction.getAddress(),
    Airdrop: await airdrop.getAddress(),
    AdAlliance: await adAlliance.getAddress()
  };

  // Write addresses to JSON file
  if (!fs.existsSync(ADDRESS_FILE)) {
    fs.writeFileSync(ADDRESS_FILE, JSON.stringify(addresses, null, 2));
    console.log("\nDeployed contract addresses saved to:", ADDRESS_FILE);
  }

  // 生成 env.conf 文件
  if (!fs.existsSync(ENV_FILE)) {
    const envContent = `
NEXT_PUBLIC_AUCTION_CONTRACT_ADDRESS=${await englishAuction.getAddress()}
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=${await daNFT.getAddress()}
NEXT_PUBLIC_DAT_CONTRACT_ADDRESS=${await daToken.getAddress()}
NEXT_PUBLIC_WETH_ADDRESS=${await weth.getAddress()}
NEXT_PUBLIC_FACTORY_ADDRESS=${await factory.getAddress()}
NEXT_PUBLIC_ROUTER_ADDRESS=${await router.getAddress()}
NEXT_PUBLIC_QUERY_ADDRESS=${await uniswapQuery.getAddress()}
`;

    fs.writeFileSync(ENV_FILE, envContent.trim());
    console.log("Environment variables saved to: config/env.conf");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });