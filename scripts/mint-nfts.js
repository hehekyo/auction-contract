const { ethers } = require("hardhat");

async function main() {
    // NFT URI 列表
    const nftURIs = [
        "ipfs://QmYGmUgNtaQ57zc8ZsHrdz2iZgWpsziy1jWdT6TDQKyZUP",
        "ipfs://QmZJxaECq6RritpSeY1CzUox36BYFf7uny7JtdNXMoyJPG",
        "ipfs://QmXREzsP8JmGtLuTDr73pXsEZnucttu14VjeUjU8DPakmb",
        "ipfs://QmV5KcUb7j1xY19JJ19ZY6fxt5SvmxqFeSL17NF3QWtB8J",
        "ipfs://QmPXS7r8HaThYJRPH2oaB1WY3i4xNGUSaxQzSAbFairfTn"
    ];

    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log("使用账户:", deployer.address);

    // 获取合约工厂
    const DANFT = await ethers.getContractFactory("DANFT");
    
    // 部署合约
    console.log("部署 DANFT 合约...");
    const danft = await DANFT.deploy(deployer.address);
    await danft.waitForDeployment();
    console.log("DANFT 已部署到:", await danft.getAddress());

    // 铸造 NFT
    console.log("\n开始铸造 NFT...");
    for (let i = 0; i < nftURIs.length; i++) {
        console.log(`\n铸造 NFT ${i}...`);
        try {
            const tx = await danft.mint(nftURIs[i]);
            const receipt = await tx.wait();
            
            // 获取事件
            const event = receipt.logs.find(log => {
                try {
                    const parsed = danft.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsed.name === 'NFTMinted';
                } catch {
                    return false;
                }
            });

            console.log(`✅ NFT ${i} 铸造成功`);
            console.log(`   Token ID: ${event.args.tokenId}`);
            console.log(`   Owner: ${event.args.to}`);
            console.log(`   URI: ${event.args.imageURI}`);
            console.log(`   交易哈希: ${receipt.hash}`);
        } catch (error) {
            console.error(`❌ NFT ${i} 铸造失败:`, error.message);
        }
    }

    // 验证铸造结果
    console.log("\n验证铸造结果...");
    const tokenCounter = await danft.tokenCounter();
    console.log(`总共铸造了 ${tokenCounter} 个 NFT`);

    // 打印所有 NFT 的详细信息
    console.log("\nNFT 详细信息:");
    for (let i = 0; i < tokenCounter; i++) {
        const uri = await danft.tokenURI(i);
        const owner = await danft.ownerOf(i);
        console.log(`\nNFT ${i}:`);
        console.log(`   Owner: ${owner}`);
        console.log(`   URI: ${uri}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 