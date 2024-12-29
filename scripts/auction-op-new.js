const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

const ADDRESS_FILE = path.join(__dirname, '../auction-addresses.json');

function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

async function main() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const addresses = getDeployedAddresses();

    // IPFS URIs for test NFTs
    const nftUrls = [
        "ipfs://QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse",
        "ipfs://QmUwivpSjVnzDaMEUZ47tHhmZbeao3eZQFqt2nKf5QzyaH",
        "ipfs://QmTM6pgQRbdJ7kfk1UYQDJE6g95Z2pc7g1Sb5rE1GY4JdN"
    ];

    try {
        // 获取合约实例
        const DANFT = await ethers.getContractFactory("DANFT");
        const DAToken = await ethers.getContractFactory("DAToken");
        const EnglishAuction = await ethers.getContractFactory("EnglishAuction");

        const daNFT = DANFT.attach(addresses.DANFT);
        const daToken = DAToken.attach(addresses.DAToken);
        const englishAuction = EnglishAuction.attach(addresses.EnglishAuction);

        console.log("\n=== 初始化测试环境 ===");

        // 铸造代币给测试账户
        const tokenAmount = 1000; // 直接使用数值，不需要 parseEther
        for (const account of [owner, addr1, addr2]) {
            await daToken.mint(account.address, tokenAmount);
            console.log(`${account.address} DAToken 余额: ${await daToken.balanceOf(account.address)}`);
        }

        // 铸造 NFT
        console.log("\n=== 铸造 NFT ===");
        const nftIds = [];
        for(let i = 0; i < 3; i++) {
            console.log(`铸造 NFT #${i}...`);
            await daNFT.connect(owner).mint(addr1.address, i, nftUrls[i]);
            nftIds.push(i);
            console.log(`NFT #${i} 铸造完成，所有者: ${await daNFT.ownerOf(i)}`);
        }

        // 创建英式拍卖
        console.log("\n=== 创建英式拍卖 ===");
        const englishAuctionParams = {
            startingPrice: 50, // 50 DAToken，直接使用数值
            duration: 3600 // 1小时
        };

        // 授权 NFT 给拍卖合约
        await daNFT.connect(addr1).approve(englishAuction.getAddress(), nftIds[0]);
        
        // 创建拍卖
        await englishAuction.connect(addr1).createAuction(
            addresses.DANFT,
            nftIds[0],
            englishAuctionParams.startingPrice,
            englishAuctionParams.duration
        );
        console.log("英式拍卖创建成功");

        // 对英式拍卖进行出价
        console.log("\n=== 英式拍卖出价 ===");
        const bidAmount = 60; // 60 DAToken，直接使用数值

        // 授权 DAToken 给拍卖合约
        await daToken.connect(addr2).approve(
            englishAuction.getAddress(),
            bidAmount
        );

        // 进行出价
        await englishAuction.connect(addr2).bid(
            addresses.DANFT,
            nftIds[0],
            bidAmount
        );
        console.log(`addr2 出价 ${bidAmount} DAToken`);

        // 快进时间（在测试网络中）
        await ethers.provider.send("evm_increaseTime", [3700]); // 增加 3700 秒
        await ethers.provider.send("evm_mine"); // 挖一个新区块

        // // 结束拍卖
        // console.log("\n=== 结束拍卖 ===");
        // await englishAuction.connect(addr1).endAuction(
        //     addresses.DANFT,
        //     nftIds[0]
        // );
        // console.log("拍卖结束");

        // 打印最终状态
        console.log("\n=== 最终状态 ===");
        console.log("NFT 所有权：");
        for(let i = 0; i < nftIds.length; i++) {
            const owner = await daNFT.ownerOf(nftIds[i]);
            console.log(`NFT #${nftIds[i]} 所有者: ${owner}`);
        }

        console.log("\nDAToken 余额：");
        for (const account of [owner, addr1, addr2]) {
            const balance = await daToken.balanceOf(account.address);
            console.log(`${account.address}: ${balance} DAToken`); // 直接显示数值
        }

    } catch (error) {
        console.error("操作失败:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 