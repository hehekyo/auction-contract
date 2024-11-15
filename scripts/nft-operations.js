const hre = require("hardhat");

async function main() {
    const MyNFT = await ethers.getContractFactory("MyNFT");
    const myNFT = await MyNFT.attach("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");
    const [owner, addr1, addr2] = await ethers.getSigners();

    console.log("\n=== NFT 基本信息 ===");
    console.log("NFT 合约地址:", await myNFT.getAddress());
    console.log("名称:", await myNFT.name());
    console.log("符号:", await myNFT.symbol());
    console.log("所有者:", await myNFT.owner());
    console.log("当前 Token 计数:", await myNFT.tokenCounter());

    console.log("\n=== 开始铸造操作 ===");
    console.log("当前 tokenCounter:", (await myNFT.tokenCounter()).toString());

    console.log("\n铸造第一个 NFT...");
    const imageURI = "https://example.com/nft/1.json";
    const tx1 = await myNFT.mint(imageURI);
    await tx1.wait();
    console.log("铸造完成，当前 tokenCounter:", (await myNFT.tokenCounter()).toString());

    // 第二次铸造 - NFT #1
    console.log("\n开始第二次铸造...");
    const newTokenId = await myNFT.tokenCounter();
    console.log("即将铸造的 TokenID:", newTokenId.toString());
    console.log("目标地址:", addr1.address);
    const tx2 = await myNFT.mint(addr1.address, newTokenId, "https://example.com/nft/2.json");
    await tx2.wait();
    console.log("第二次铸造完成");
    console.log("所有者:", await myNFT.ownerOf(newTokenId));

    // 查询 NFT 信息
    async function displayNFTInfo(tokenId) {
        try {
            const owner = await myNFT.ownerOf(tokenId);
            const uri = await myNFT.tokenURI(tokenId);
            console.log(`\nNFT #${tokenId} 信息:`);
            console.log("所有者:", owner);
            console.log("Token URI:", uri);
        } catch (error) {
            console.log(`NFT #${tokenId} 不存在`);
        }
    }

    // 显示所有已铸造的 NFT 信息
    console.log("\n=== 显示所有 NFT 信息 ===");
    const totalTokens = await myNFT.tokenCounter();
    for (let i = 0; i < totalTokens; i++) {
        await displayNFTInfo(i);
    }

    // 转移 NFT
    console.log("\n=== 测试 NFT 转移 ===");
    try {
        // addr1 将 NFT 转移给 addr2
        await myNFT.connect(addr1).approve(addr2.address, newTokenId);
        console.log("已授权 addr2 转移 NFT");
        
        await myNFT.connect(addr2).transferFrom(addr1.address, addr2.address, newTokenId);
        console.log(`NFT #${newTokenId} 已从 addr1 转移到 addr2`);
        
        // 显示转移后的所有者
        const newOwner = await myNFT.ownerOf(newTokenId);
        console.log(`NFT #${newTokenId} 的新所有者:`, newOwner);
    } catch (error) {
        console.error("转移失败:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 