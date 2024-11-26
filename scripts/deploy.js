const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

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
    console.log("开始部署合约，部署账户:", deployer.address);

    try {
        const addresses = getDeployedAddresses();

        // 部署 DAToken
        console.log("正在部署 DAToken...");
        const DAToken = await hre.ethers.getContractFactory("DAToken");
        const daToken = await DAToken.deploy(
            deployer.address,
            "1000000000000000000000000" // 1,000,000 tokens with 18 decimals
        );
        await daToken.waitForDeployment();
        addresses.DAToken = await daToken.getAddress();
        console.log("DAToken 已部署到:", addresses.DAToken);

        // 部署 DANFT
        console.log("正在部署 DANFT...");
        const DANFT = await hre.ethers.getContractFactory("DANFT");
        const daNFT = await DANFT.deploy(deployer.address);
        await daNFT.waitForDeployment();
        addresses.DANFT = await daNFT.getAddress();
        console.log("DANFT 已部署到:", addresses.DANFT);

        // 部署 AuctionManager
        console.log("正在部署 AuctionManager...");
        const AuctionManager = await hre.ethers.getContractFactory("AuctionManager");
        const auctionManager = await hre.upgrades.deployProxy(
            AuctionManager,
            [deployer.address, await daToken.getAddress()],
            {
                kind: 'uups',
                initializer: 'initialize',
                unsafeAllow: ['constructor']
            }
        );
        await auctionManager.waitForDeployment();
        addresses.AuctionManager = await auctionManager.getAddress();
        console.log("AuctionManager 已部署到:", addresses.AuctionManager);

        // 验证部署
        console.log("验证部署结果...");
        const tokenBalance = await daToken.balanceOf(deployer.address);
        console.log("部署者 DAToken 余额:", tokenBalance.toString());

        const auctionManagerToken = await auctionManager.myERC20Token();
        console.log("AuctionManager 中的 token 地址:", auctionManagerToken);

        // 保存地址
        saveDeployedAddresses(addresses);
        console.log("部署完成！");

    } catch (error) {
        console.error("部署出错:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 