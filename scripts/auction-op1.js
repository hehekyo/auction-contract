const { ethers } = require("hardhat");
const { getDeployedAddresses } = require("../utils/address-helper");

async function main() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const addresses = getDeployedAddresses();
    /**
      https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse
https://ipfs.io/ipfs/QmUwivpSjVnzDaMEUZ47tHhmZbeao3eZQFqt2nKf5QzyaH
https://ipfs.io/ipfs/QmTM6pgQRbdJ7kfk1UYQDJE6g95Z2pc7g1Sb5rE1GY4JdN

     */
    const nftUrls= [
        "ipfs://QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse",
        "ipfs://QmUwivpSjVnzDaMEUZ47tHhmZbeao3eZQFqt2nKf5QzyaH",
        "ipfs://QmTM6pgQRbdJ7kfk1UYQDJE6g95Z2pc7g1Sb5rE1GY4JdN"
    ]

    // 给每个账号充值 5 ETH
    console.log("\n=== 充值 ETH ===");
    const ethAmount = ethers.parseEther("5");
    
    // 获取一个可以发送 ETH 的账户（通常是 hardhat 的第一个账户）
    const ethSender = owner;
    
    // 给 owner 充值
    console.log("给 owner 充值 ETH...");
    await ethSender.sendTransaction({
        to: owner.address,
        value: ethAmount
    });
    console.log(`owner ETH 余额: ${ethers.formatEther(await ethers.provider.getBalance(owner.address))}`);

    // 给 addr1 充值
    console.log("\n给 addr1 充值 ETH...");
    await ethSender.sendTransaction({
        to: addr1.address,
        value: ethAmount
    });
    console.log(`addr1 ETH 余额: ${ethers.formatEther(await ethers.provider.getBalance(addr1.address))}`);

    // 给 addr2 充值
    console.log("\n给 addr2 充值 ETH...");
    await ethSender.sendTransaction({
        to: addr2.address,
        value: ethAmount
    });
    console.log(`addr2 ETH 余额: ${ethers.formatEther(await ethers.provider.getBalance(addr2.address))}`);

    // 检查合约地址
    if (!addresses.DAToken || !addresses.DANFT || !addresses.AuctionManager) {
        console.error("合约地址未找到");
        process.exit(1);
    }

    try {
        // 获取合约实例
        const DANFT = await ethers.getContractFactory("DANFT");
        const DAToken = await ethers.getContractFactory("DAToken");
        const AuctionManager = await ethers.getContractFactory("AuctionManager");

        const daNFT = DANFT.attach(addresses.DANFT);
        const daToken = DAToken.attach(addresses.DAToken);
        const auctionManager = AuctionManager.attach(addresses.AuctionManager);

        console.log("\n=== 初始化测试环境 ===");

        // 铸造代币给测试账户
        const tokenAmount = ethers.parseEther("1000");
        console.log("铸造代币给测试账户...");
        // 给 owner 铸造代币
        await daToken.connect(owner).mint(owner.address, tokenAmount);
        // 给 addr1 铸造代币
        await daToken.connect(owner).mint(addr1.address, tokenAmount);
        // 给 addr2 铸造代币
        await daToken.connect(owner).mint(addr2.address, tokenAmount);
        console.log("代币铸造完成");

        // 打印各账户余额
        console.log("\n当前代币余额：");
        console.log("owner:", ethers.formatEther(await daToken.balanceOf(owner.address)), "DAToken");
        console.log("addr1:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
        console.log("addr2:", ethers.formatEther(await daToken.balanceOf(addr2.address)), "DAToken");

        // 铸造 NFT
        console.log("\n=== 铸造 NFT ===");
        const nftIds = [];

        // 铸造3个 NFT 给 addr1
        for(let i = 0; i < 3; i++) {
            console.log(`铸造 NFT #${i}...`);
            const tx = await daNFT.connect(owner).mint(addr1.address, i, nftUrls[i]);
            const receipt = await tx.wait();
            nftIds.push(i);
            console.log(`NFT #${i} 铸造完成`);
        }

        // 验证 NFT 所有权
        console.log("\n验证 NFT 所有权：");
        for(let i = 0; i < nftIds.length; i++) {
            const tokenId = nftIds[i];
            const owner = await daNFT.ownerOf(tokenId);
            console.log(`NFT #${tokenId} 所有者: ${owner}`);
        }

        // 创建三个英式拍卖
        console.log("\n=== 创建三个英式拍卖 ===");

        const auctions = [];
        for (let i = 0; i < 3; i++) {
            console.log(`\n创建第 ${i + 1} 个英式拍卖`);
            
            // 拍卖参数
            const auctionParams = {
                auctionType: 0, // EnglishAuction
                startingPrice: ethers.parseEther("50"),
                reservePrice: ethers.parseEther("30"),
                duration: 3600, // 1小时
                nftContract: await daNFT.getAddress(),
                tokenId: nftIds[i], // 使用刚刚铸造的 NFT
                priceDecrement: 0,
                decrementInterval: 0
            };

            // 授权 NFT 给拍卖合约
            console.log(`授权 NFT #${auctionParams.tokenId} 给拍卖合约...`);
            await daNFT.connect(addr1).approve(addresses.AuctionManager, auctionParams.tokenId);

            // 创建拍卖
            const tx = await auctionManager.connect(addr1).startAuction(
                auctionParams.auctionType,
                auctionParams.startingPrice,
                auctionParams.reservePrice,
                auctionParams.duration,
                auctionParams.nftContract,
                auctionParams.tokenId,
                auctionParams.priceDecrement,
                auctionParams.decrementInterval
            );
            const receipt = await tx.wait();

            // 获取拍卖ID
            let auctionId;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = auctionManager.interface.parseLog(log);
                    if (parsedLog?.name === 'AuctionStarted') {
                        auctionId = parsedLog.args.auctionId;
                        console.log(`拍卖创建成功，ID: ${auctionId}`);
                        auctions.push(auctionId);
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
        }

        // 对每个拍卖进行出价
        console.log("\n=== 对三个拍卖进行出价 ===");

        for (let i = 0; i < auctions.length; i++) {
            const auctionId = auctions[i];
            console.log(`\n对拍卖 #${auctionId} 进行出价`);

            // 获取保证金金额
            const auction = await auctionManager.auctions(auctionId);
            const depositAmount = auction.depositAmount;

            // 第一次出价 (addr2)
            console.log("\n--- 第一次出价 (addr2) ---");
            const bid1Amount = ethers.parseEther("55");
            
            // 授权代币
            await daToken.connect(addr2).approve(addresses.AuctionManager, depositAmount + bid1Amount);
            
            // 支付保证金
            await auctionManager.connect(addr2).deposit(auctionId);
            console.log("addr2 支付保证金完成");

            // 出价
            await auctionManager.connect(addr2).bid(auctionId, bid1Amount);
            console.log(`addr2 出价完成: ${ethers.formatEther(bid1Amount)} DAToken`);

            // 第二次出价 (owner)
            console.log("\n--- 第二次出价 (owner) ---");
            const bid2Amount = ethers.parseEther("60");
            
            // 授权代币
            await daToken.connect(owner).approve(addresses.AuctionManager, depositAmount + bid2Amount);
            
            // 支付保证金
            await auctionManager.connect(owner).deposit(auctionId);
            console.log("owner 支付保证金完成");

            // 出价
            await auctionManager.connect(owner).bid(auctionId, bid2Amount);
            console.log(`owner 出价完成: ${ethers.formatEther(bid2Amount)} DAToken`);

            // 打印当前拍卖状态
            const currentAuction = await auctionManager.auctions(auctionId);
            console.log(`\n拍卖 #${auctionId} 当前状态：`);
            console.log("最高出价者:", currentAuction.winner);
            console.log("当前出价:", ethers.formatEther(currentAuction.currentBid), "DAToken");
            console.log("拍卖状态:", currentAuction.auctionStatus);
        }

        // 打印最终状态
        console.log("\n=== 最终状态 ===");
        console.log("代币余额：");
        console.log("Owner:", ethers.formatEther(await daToken.balanceOf(owner.address)), "DAToken");
        console.log("Addr1:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
        console.log("Addr2:", ethers.formatEther(await daToken.balanceOf(addr2.address)), "DAToken");

        console.log("\nNFT 余额：");
        console.log("Owner:", (await daNFT.balanceOf(owner.address)).toString());
        console.log("Addr1:", (await daNFT.balanceOf(addr1.address)).toString());
        console.log("Addr2:", (await daNFT.balanceOf(addr2.address)).toString());

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
