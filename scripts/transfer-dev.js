const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

async function mintAndTransferTokens(myToken, myNFT, recipientAddress) {
    console.log("开始铸造代币和NFT...");
    
    // 直接铸造100000个代币到指定地址
    const tokenAmount = hre.ethers.parseEther("100000");
    await myToken.mint(recipientAddress, tokenAmount);
    console.log(`已铸造 100000 个代币到地址: ${recipientAddress}`);

    // 铸造10个NFT到指定地址
    // for (let i = 0; i < 10; i++) {
    //     const imageURI = `https://example.com/nft/${i}`; // 示例URI，请根据实际需求修改
    //     await myNFT.mint(recipientAddress, i, imageURI);
    //     console.log(`已铸造 NFT #${i} 到地址: ${recipientAddress}`);
    // }
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("使用账户:", deployer.address);

    const RECIPIENT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    try {
        // 读取已部署的合约地址
        const addresses = getDeployedAddresses();
        
        // 获取合约实例
        const MyToken = await hre.ethers.getContractFactory("DAToken");
        const myToken = MyToken.attach(addresses.DAToken);
        
        const MyNFT = await hre.ethers.getContractFactory("DANFT");
        const myNFT = MyNFT.attach(addresses.DANFT);

        // 执行铸造和转账
        await mintAndTransferTokens(myToken, myNFT, RECIPIENT_ADDRESS);

    } catch (error) {
        console.error("转账错误:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
