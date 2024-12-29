const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

const ADDRESS_FILE = path.join(__dirname, '../auction-addresses.json');

function saveDeployedAddresses(addresses) {
    fs.writeFileSync(
        ADDRESS_FILE,
        JSON.stringify(addresses, null, 2)
    );
    console.log('拍卖合约地址已保存到:', ADDRESS_FILE);
}

function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("开始部署拍卖相关合约，部署账户:", deployer.address);

    try {
        const addresses = getDeployedAddresses();

        // 部署 DAToken
        console.log("正在部署 DAToken...");
        const DAToken = await hre.ethers.getContractFactory("DAToken");
        const daToken = await DAToken.deploy("1000000000000000000000000"); // 1,000,000 tokens
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

        // 部署 EnglishAuction
        console.log("正在部署 EnglishAuction...");
        const EnglishAuction = await hre.ethers.getContractFactory("EnglishAuction");
        const englishAuction = await EnglishAuction.deploy(daToken.getAddress());
        await englishAuction.waitForDeployment();
        addresses.EnglishAuction = await englishAuction.getAddress();
        console.log("EnglishAuction 已部署到:", addresses.EnglishAuction);

        // 部署 DutchAuction
        console.log("正在部署 DutchAuction...");
        const DutchAuction = await hre.ethers.getContractFactory("DutchAuction");
        const dutchAuction = await DutchAuction.deploy();
        await dutchAuction.waitForDeployment();
        addresses.DutchAuction = await dutchAuction.getAddress();
        console.log("DutchAuction 已部署到:", addresses.DutchAuction);

        // 验证部署
        console.log("验证部署结果...");
        
        // 验证 DAToken
        const tokenBalance = await daToken.balanceOf(deployer.address);
        console.log("部署者 DAToken 余额:", tokenBalance.toString());

        // // 铸造一个 NFT 用于测试
        // console.log("铸造测试 NFT...");
        // await daNFT.mint("ipfs://test-uri");
        // const nftBalance = await daNFT.balanceOf(deployer.address);
        // console.log("部署者 NFT 余额:", nftBalance.toString());

        // 保存地址
        saveDeployedAddresses(addresses);
        console.log("所有合约部署完成！");

        // 输出部署摘要
        console.log("\n部署摘要:");
        console.log("=================");
        console.log("DAToken:", addresses.DAToken);
        console.log("DANFT:", addresses.DANFT);
        console.log("EnglishAuction:", addresses.EnglishAuction);
        console.log("DutchAuction:", addresses.DutchAuction);
        console.log("=================");

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