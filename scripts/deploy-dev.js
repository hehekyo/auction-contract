const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// 添加保存地址的辅助函数
const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

function saveDeployedAddresses(addresses) {
    fs.writeFileSync(
        ADDRESS_FILE,
        JSON.stringify(addresses, null, 2)
    );
    console.log('部署地址已保存到:', ADDRESS_FILE);
}

function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    try {
        // 读取现有地址（如果有的话）
        const addresses = getDeployedAddresses();

        // 部署 ERC20 代币
        const MyToken = await hre.ethers.getContractFactory("MyERC20");
        const myToken = await MyToken.deploy(deployer.address, "1000000000000000000000000");
        await myToken.waitForDeployment();
        addresses.MyToken = await myToken.getAddress();
        console.log("MyToken deployed to:", addresses.MyToken);

        // 部署 NFT
        const MyNFT = await hre.ethers.getContractFactory("MyNFT");
        const myNFT = await MyNFT.deploy(deployer.address);
        await myNFT.waitForDeployment();
        addresses.MyNFT = await myNFT.getAddress();
        console.log("MyNFT deployed to:", addresses.MyNFT);

        // 部署 AuctionManager
        const AuctionManager = await hre.ethers.getContractFactory("AuctionManager");
        const auctionManager = await hre.upgrades.deployProxy(
            AuctionManager,
            [deployer.address, await myToken.getAddress()],
            { kind: 'uups' }
        );
        await auctionManager.waitForDeployment();
        addresses.AuctionManager = await auctionManager.getAddress();
        console.log("AuctionManager deployed to:", addresses.AuctionManager);

        // 保存所有部署地址
        saveDeployedAddresses(addresses);

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