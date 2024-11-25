import hre from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');
const TARGET_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

async function main() {
    console.log("\n=== 合约信息查询 ===");
    
    // 获取账户信息
    const [deployer] = await hre.ethers.getSigners();
    console.log("\n当前账户:", deployer.address);
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("ETH余额:", ethers.formatEther(balance), "ETH");

    // 读取部署的合约地址
    const addresses = await getDeployedAddresses();
    
    // 获取合约实例
    const myToken = await hre.ethers.getContractAt("MyERC20", addresses.MyToken);
    const myNFT = await hre.ethers.getContractAt("MyNFT", addresses.MyNFT);

    console.log("\n=== ERC20代币信息 ===");
    console.log("代币合约地址:", addresses.MyToken);
    console.log("代币名称:", await myToken.name());
    console.log("代币符号:", await myToken.symbol());
    const totalSupply = await myToken.totalSupply();
    console.log("总供应量:", ethers.formatEther(totalSupply));
    
    // 查询部署者余额
    const deployerBalance = await myToken.balanceOf(deployer.address);
    console.log("部署者代币余额:", ethers.formatEther(deployerBalance));
    
    // 查询目标地址余额
    const targetBalance = await myToken.balanceOf(TARGET_ADDRESS);
    console.log(`目标地址 ${TARGET_ADDRESS} 代币余额:`, ethers.formatEther(targetBalance));

    console.log("\n=== NFT信息 ===");
    console.log("NFT合约地址:", addresses.MyNFT);
    console.log("NFT名称:", await myNFT.name());
    console.log("NFT符号:", await myNFT.symbol());
    try {
        const tokenCounter = await myNFT.tokenCounter();
        console.log("已铸造NFT数量:", tokenCounter);

        // 列出部署者的NFT
        console.log("\n部署者拥有的NFT:");
        const deployerNFTs = [];
        for (let i = 0; i < tokenCounter; i++) {
            try {
                const owner = await myNFT.ownerOf(i);
                if (owner.toLowerCase() === deployer.address.toLowerCase()) {
                    deployerNFTs.push(i);
                    const uri = await myNFT.tokenURI(i);
                    console.log(`TokenID ${i}:`);
                    console.log(`  URI: ${uri}`);
                }
            } catch (error) {
                continue;
            }
        }
        console.log("部署者拥有的NFT数量:", deployerNFTs.length);

        // 列出目标地址的NFT
        console.log("\n目标地址拥有的NFT:");
        const targetNFTs = [];
        for (let i = 0; i < tokenCounter; i++) {
            try {
                const owner = await myNFT.ownerOf(i);
                if (owner.toLowerCase() === TARGET_ADDRESS.toLowerCase()) {
                    targetNFTs.push(i);
                    const uri = await myNFT.tokenURI(i);
                    console.log(`TokenID ${i}:`);
                    console.log(`  URI: ${uri}`);
                }
            } catch (error) {
                continue;
            }
        }
        console.log("目标地址拥有的NFT数量:", targetNFTs.length);

    } catch (error) {
        console.log("查询NFT信息失败:", error);
    }

    console.log("\n=== 查询完成 ===\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 