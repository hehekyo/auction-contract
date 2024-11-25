import hre from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("使用账户:", deployer.address);

    // 读取部署的合约地址
    const addresses = JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
    
    // 获取NFT合约实例
    const myNFT = await hre.ethers.getContractAt("MyNFT", addresses.MyNFT);

    try {
        // 铸造单个NFT
        const tokenId = 0;
        const imageURI = `https://example.com/nft/${tokenId}`;
        
        // 铸造NFT给deployer
        await myNFT.mint(deployer.address, tokenId, imageURI);
        console.log(`已铸造 NFT #${tokenId} 到地址: ${deployer.address}`);

        // 验证铸造结果
        const owner = await myNFT.ownerOf(tokenId);
        console.log(`NFT #${tokenId} 的所有者是: ${owner}`);
        const uri = await myNFT.tokenURI(tokenId);
        console.log(`NFT #${tokenId} 的URI是: ${uri}`);

    } catch (error) {
        console.error("铸造错误:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 