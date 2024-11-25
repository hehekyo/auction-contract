import hre from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("当前账户:", deployer.address);

    // 读取部署的合约地址
    const addresses = JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
    console.log("NFT合约地址:", addresses.MyNFT);

    // 获取NFT合约实例
    const myNFT = await hre.ethers.getContractAt("MyNFT", addresses.MyNFT);

    try {
        // 检查 TokenID 0
        const owner = await myNFT.ownerOf(0);
        console.log("TokenID 0 的所有者:", owner);
        const uri = await myNFT.tokenURI(0);
        console.log("TokenID 0 的URI:", uri);
    } catch (error) {
        console.log("TokenID 0 不存在，需要先铸造");
    }

    // 检查合约owner
    const contractOwner = await myNFT.owner();
    console.log("NFT合约的owner:", contractOwner);

    // 检查已铸造数量
    const tokenCounter = await myNFT.tokenCounter();
    console.log("已铸造的NFT数量:", tokenCounter.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 