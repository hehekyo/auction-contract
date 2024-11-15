const { ethers } = require("hardhat");
const { getDeployedAddresses } = require("../utils/address-helper");

async function main() {
    // 获取签名者账户
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    // 获取部署的地址
    const addresses = getDeployedAddresses();
    
    // 检查所有必需的合约地址
    if (!addresses.MyNFT || !addresses.MyToken || !addresses.AuctionManager) {
        console.error("合约地址未找到：");
        console.error("MyNFT:", addresses.MyNFT);
        console.error("MyToken:", addresses.MyToken);
        console.error("AuctionManager:", addresses.AuctionManager);
        throw new Error("请先部署所有合约！");
    }

    try {
        // 获取合约实例
        const MyNFT = await ethers.getContractFactory("MyNFT");
        const MyToken = await ethers.getContractFactory("MyERC20");
        const AuctionManager = await ethers.getContractFactory("AuctionManager");

        // 连接到已部署的合约
        const myNFT = MyNFT.attach(addresses.MyNFT);
        const myToken = MyToken.attach(addresses.MyToken);
        const auctionManager = AuctionManager.attach(addresses.AuctionManager);

        // 验证合约连接
        try {
            await myNFT.name();
            await myToken.name();
            await auctionManager.owner();
            console.log("合约连接验证成功");
        } catch (error) {
            console.error("合约连接失败，请确保地址正确且合约已部署");
            throw error;
        }

        console.log("\n=== 合约地址 ===");
        console.log("NFT 合约:", await myNFT.getAddress());
        console.log("代币合约:", await myToken.getAddress());
        console.log("拍卖管理合约:", await auctionManager.getAddress());

        // 检查 NFT 授权
        console.log("\n=== 检查 NFT 授权 ===");
        const auctionManagerAddress = await auctionManager.getAddress();
        const isApproved = await myNFT.isApprovedForAll(
            owner.address, 
            auctionManagerAddress
        );
        
        if (!isApproved) {
            console.log("授权 NFT 给拍卖合约...");
            const approveTx = await myNFT.setApprovalForAll(auctionManagerAddress, true);
            await approveTx.wait();
            console.log("NFT 授权完成");
        } else {
            console.log("NFT 已授权给拍卖合约");
        }

        // 铸造 NFT
        console.log("\n=== 铸造 NFT ===");
        
        // 获取当前的 tokenCounter
        const currentTokenId = await myNFT.tokenCounter();
        console.log("当前 Token ID:", currentTokenId.toString());

        // 尝试使用另一个 mint 函数 (只需要 imageURI 的版本)
        console.log("铸造 NFT #0...");
        const mintTx1 = await myNFT.mint("ipfs://token-uri-0");
        await mintTx1.wait();
        console.log("NFT #0 铸造成功");

        console.log("铸造 NFT #1...");
        const mintTx2 = await myNFT.mint("ipfs://token-uri-1");
        await mintTx2.wait();
        console.log("NFT #1 铸造成功");

        // 创建荷兰式拍卖
        console.log("\n=== 创建荷兰式拍卖 ===");
        const nftAddress = await myNFT.getAddress();
        
        const dutchAuctionParams = {
            auctionType: 0, // DutchAuction
            startingPrice: ethers.parseEther("100"),  // 起拍价 100 代币
            reservePrice: ethers.parseEther("50"),    // 保留价 50 代币
            duration: 3600,                           // 持续时间 1 小时
            nftContract: nftAddress,                  // 使用 getAddress() 获取的地址
            tokenId: 0,                               // NFT #0
            priceDecrement: ethers.parseEther("5"),   // 每次降价 5 代币
            decrementInterval: 300                    // 每 5 分钟降价一次
        };

        console.log("创建荷兰式拍卖...");
        const dutchTx = await auctionManager.startAuction(
            dutchAuctionParams.auctionType,
            dutchAuctionParams.startingPrice,
            dutchAuctionParams.reservePrice,
            dutchAuctionParams.duration,
            dutchAuctionParams.nftContract,
            dutchAuctionParams.tokenId,
            dutchAuctionParams.priceDecrement,
            dutchAuctionParams.decrementInterval
        );
        const dutchReceipt = await dutchTx.wait();
        // 添加事件日志打印
        console.log("\n荷兰式拍卖事件日志:");
        for (const event of dutchReceipt.logs) {
            try {
                const parsedEvent = auctionManager.interface.parseLog(event);
                if (parsedEvent) {
                    console.log(`事件名称: ${parsedEvent.name}`);
                    console.log("事件参数:", parsedEvent.args);
                }
            } catch (error) {
                // 跳过无法解析的日志
                continue;
            }
        }
        console.log("荷兰式拍卖创建成功");

        // 创建英式拍卖
        console.log("\n=== 创建英式拍卖 ===");
        const englishAuctionParams = {
            auctionType: 1, // EnglishAuction
            startingPrice: ethers.parseEther("80"),   // 起拍价 80 代币
            reservePrice: ethers.parseEther("40"),    // 保留价 40 代币
            duration: 7200,                           // 持续时间 2 小时
            nftContract: nftAddress,                  // 使用同一个 nftAddress
            tokenId: 1,                               // NFT #1
            priceDecrement: 0,                        // 英式拍卖不需要降价参数
            decrementInterval: 0                      // 英式拍卖不需要降价间隔
        };

        console.log("创建英式拍卖...");
        const englishTx = await auctionManager.startAuction(
            englishAuctionParams.auctionType,
            englishAuctionParams.startingPrice,
            englishAuctionParams.reservePrice,
            englishAuctionParams.duration,
            englishAuctionParams.nftContract,
            englishAuctionParams.tokenId,
            englishAuctionParams.priceDecrement,
            englishAuctionParams.decrementInterval
        );
        await englishTx.wait();
        console.log("英式拍卖创建成功");

        // 显示拍卖信息
        const dutchAuctionId = 1;
        const englishAuctionId = 2;

        async function displayAuctionInfo(auctionId, auctionType) {
            const auction = await auctionManager.auctions(auctionId);
            console.log(`\n${auctionType}拍卖信息 (ID: ${auctionId}):`);
            console.log("卖家:", auction.seller);
            console.log("NFT 合约:", auction.nftContract);
            console.log("Token ID:", auction.tokenId);
            console.log("拍卖状态:", auction.auctionStatus);
            console.log("押金金额:", ethers.formatEther(auction.depositAmount), "代币");
            
            if (auctionType === "荷兰式") {
                const currentPrice = await auctionManager.getCurrentPrice(auctionId);
                console.log("当前价格:", ethers.formatEther(currentPrice), "代币");
            }
        }

        await displayAuctionInfo(dutchAuctionId, "荷兰式");
        await displayAuctionInfo(englishAuctionId, "英式");

        // 模拟用户参与拍卖
        console.log("\n=== 用户参与拍卖 ===");
        
        // 先给用户铸造代币
        console.log("给用户铸造代币...");
        const mintAmount = ethers.parseEther("10000"); // 铸造 10000 代币
        await myToken.mint(addr1.address, mintAmount);
        await myToken.mint(addr2.address, mintAmount);
        console.log("代币铸造完成");
        
        // 显示用户代币余额
        const addr1Balance = await myToken.balanceOf(addr1.address);
        const addr2Balance = await myToken.balanceOf(addr2.address);
        console.log("用户1代币余额:", ethers.formatEther(addr1Balance));
        console.log("用户2代币余额:", ethers.formatEther(addr2Balance));
        
        // 获取拍卖管理合约地址
        const auctionManagerAddr = await auctionManager.getAddress();
        
        // 授币
        const tokenAmount = ethers.parseEther("1000");
        await myToken.connect(addr1).approve(auctionManagerAddr, tokenAmount);
        await myToken.connect(addr2).approve(auctionManagerAddr, tokenAmount);
        console.log("用户代币授权完成");

        // 用户1参与荷兰式拍卖
        console.log("\n用户1参与荷兰式拍卖...");
        
        try {
            console.log("支付押金...");
            await auctionManager.connect(addr1).deposit(dutchAuctionId);
            console.log("用户1支付押金完成");
        } catch (error) {
            if (error.message.includes("Already deposited")) {
                console.log("用户1已支付押金");
            } else {
                throw error;
            }
        }
        
        // 获取并显示当前价格
        const dutchCurrentPrice = await auctionManager.getCurrentPrice(dutchAuctionId);
        console.log("当前荷兰式拍卖价格:", ethers.formatEther(dutchCurrentPrice), "代币");
        
        // // 使用确切的当前价格进行出价
        // console.log("用户1出价:", ethers.formatEther(dutchCurrentPrice), "代币");
        // await auctionManager.connect(addr1).bid(dutchAuctionId, dutchCurrentPrice);
        // console.log("用户1出价成功");

        // 用户2参与英式拍卖
        console.log("\n用户2参与英式拍卖...");
        
        try {
            console.log("支付押金...");
            await auctionManager.connect(addr2).deposit(englishAuctionId);
            console.log("用户2支付押金完成");
        } catch (error) {
            if (error.message.includes("Already deposited")) {
                console.log("用户2已支付押金");
            } else {
                throw error;
            }
        }
        
        // 使用更高的出价金额
        const bidAmount = ethers.parseEther("90");  // 出价90代币，确保高于之前的出价
        console.log("用户2出价:", ethers.formatEther(bidAmount), "代币");
        
        try {
            const bidTx = await auctionManager.connect(addr2).bid(englishAuctionId, bidAmount);
            const bidReceipt = await bidTx.wait();
            console.log("\n出价事件日志:");
            for (const event of bidReceipt.logs) {
                try {
                    const parsedEvent = auctionManager.interface.parseLog(event);
                    if (parsedEvent) {
                        console.log(`事件名称: ${parsedEvent.name}`);
                        console.log("事件参数:", parsedEvent.args);
                    }
                } catch (error) {
                    continue;
                }
            }
            console.log("用户2出价成功");
        } catch (error) {
            if (error.message.includes("Bid must be higher than current bid")) {
                // 如果出价仍然太低，再增加出价
                const higherBidAmount = ethers.parseEther("100");  // 增加到100代币
                console.log("尝试更高的出价:", ethers.formatEther(higherBidAmount), "代币");
                await auctionManager.connect(addr2).bid(englishAuctionId, higherBidAmount);
                console.log("用户2出价成功");
            } else {
                throw error;
            }
        }

        // 结束拍卖
        console.log("\n=== 结束拍卖 ===");
        
        // 快进时间
        console.log("快进时间...");
        await ethers.provider.send("evm_increaseTime", [7260]); // 2小时1分钟
        await ethers.provider.send("evm_mine"); // 挖一个新区块
        console.log("时间快进完成");

        // 尝试结束拍卖
        console.log("结束荷兰式拍卖...");
        const endDutchTx = await auctionManager.endAuction(dutchAuctionId);
        const endDutchReceipt = await endDutchTx.wait();
        console.log("\n结束荷兰式拍卖事件日志:");
        for (const event of endDutchReceipt.logs) {
            try {
                const parsedEvent = auctionManager.interface.parseLog(event);
                if (parsedEvent) {
                    console.log(`事件名称: ${parsedEvent.name}`);
                    console.log("事件参数:", parsedEvent.args);
                }
            } catch (error) {
                continue;
            }
        }
        console.log("荷兰式拍卖已结束");

        console.log("结束英式拍卖...");
        const endEnglishTx = await auctionManager.endAuction(englishAuctionId);
        const endEnglishReceipt = await endEnglishTx.wait();
        console.log("\n结束英式拍卖事件日志:");
        for (const event of endEnglishReceipt.logs) {
            try {
                const parsedEvent = auctionManager.interface.parseLog(event);
                if (parsedEvent) {
                    console.log(`事件名称: ${parsedEvent.name}`);
                    console.log("事件参数:", parsedEvent.args);
                }
            } catch (error) {
                continue;
            }
        }
        console.log("英式拍卖已结束");

        // 显示最终结果
        await displayAuctionInfo(dutchAuctionId, "荷兰式");
        await displayAuctionInfo(englishAuctionId, "英式");

    } catch (error) {
        console.error("操作失败:", error.message);
        if (error.stack) {
            console.error("错误堆栈:", error.stack);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 