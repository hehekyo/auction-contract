const { ethers } = require("hardhat");
const { getDeployedAddresses } = require("../utils/address-helper");

async function queryEvents() {
    const addresses = getDeployedAddresses();
    const auctionManagerAddress = addresses.AuctionManager;

    if (!auctionManagerAddress) {
        console.error("找不到 AuctionManager 合约地址");
        process.exit(1);
    }

    console.log("auctionManagerAddress",auctionManagerAddress);
    

    const AuctionManager = await ethers.getContractFactory("AuctionManager");
    const auctionManager = AuctionManager.attach(auctionManagerAddress);

    // 获取最新区块
    const latestBlock = await ethers.provider.getBlockNumber();
    // 查询范围：最近1000个区块（可调整）
    const fromBlock = Math.max(0, latestBlock - 1000);

    console.log(`查询区块范围: ${fromBlock} - ${latestBlock}`);

    try {
        // 查询所有相关事件
        const events = {
            auctionStarted: await auctionManager.queryFilter(
                auctionManager.filters.AuctionStarted(),
                fromBlock
            ),
            auctionEnded: await auctionManager.queryFilter(
                auctionManager.filters.AuctionEnded(),
                fromBlock
            ),
            bidPlaced: await auctionManager.queryFilter(
                auctionManager.filters.BidPlaced(),
                fromBlock
            ),
            dutchAuctionPriceUpdated: await auctionManager.queryFilter(
                auctionManager.filters.DutchAuctionPriceUpdated(),
                fromBlock
            ),
            depositHandled: await auctionManager.queryFilter(
                auctionManager.filters.DepositHandled(),
                fromBlock
            ),
            auctionCancelled: await auctionManager.queryFilter(
                auctionManager.filters.AuctionCancelled(),
                fromBlock
            ),
            paymentSettled: await auctionManager.queryFilter(
                auctionManager.filters.PaymentSettled(),
                fromBlock
            ),
            nftTransferred: await auctionManager.queryFilter(
                auctionManager.filters.NFTTransferred(),
                fromBlock
            )
        };

        // 打印事件统计
        console.log("\n=== 事件统计 ===");
        Object.entries(events).forEach(([eventName, eventList]) => {
            console.log(`${eventName}: ${eventList.length} 条记录`);
        });

        // 详细打印每种事件
        console.log("\n=== 详细事件记录 ===");
        
        // AuctionStarted 事件
        if (events.auctionStarted.length > 0) {
            console.log("\n--- 拍卖创建事件 ---");
            for (const event of events.auctionStarted) {
                console.log(`
拍卖ID: ${event.args.auctionId}
卖家: ${event.args.seller}
NFT合约: ${event.args.nftContract}
Token ID: ${event.args.tokenId}
拍卖类型: ${event.args.auctionType === 0 ? '英式拍卖' : '荷兰拍卖'}
起始价格: ${ethers.formatEther(event.args.startingPrice)} ETH
保留价格: ${ethers.formatEther(event.args.reservePrice)} ETH
持续时间: ${event.args.duration.toString()} 秒
保证金: ${ethers.formatEther(event.args.depositAmount)} ETH
开始时间: ${new Date(Number(event.args.startTime) * 1000).toLocaleString()}
结束时间: ${new Date(Number(event.args.endTime) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // BidPlaced 事件
        if (events.bidPlaced.length > 0) {
            console.log("\n--- 出价事件 ---");
            for (const event of events.bidPlaced) {
                console.log(`
拍卖ID: ${event.args.auctionId}
出价者: ${event.args.bidder}
出价金额: ${ethers.formatEther(event.args.bidAmount)} ETH
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // AuctionEnded 事件
        if (events.auctionEnded.length > 0) {
            console.log("\n--- 拍卖结束事件 ---");
            for (const event of events.auctionEnded) {
                console.log(`
拍卖ID: ${event.args.auctionId}
获胜者: ${event.args.winner}
最终价格: ${ethers.formatEther(event.args.finalPrice)} ETH
结束时间: ${new Date(Number(event.args.endTime) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // DepositHandled 事件
        if (events.depositHandled.length > 0) {
            console.log("\n--- 保证金处理事件 ---");
            for (const event of events.depositHandled) {
                console.log(`
拍卖ID: ${event.args.auctionId}
参与者: ${event.args.participant}
金额: ${ethers.formatEther(event.args.amount)} ETH
类型: ${event.args.isDeposit ? '缴纳' : '退还'}
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // AuctionCancelled 事件
        if (events.auctionCancelled.length > 0) {
            console.log("\n--- 拍卖取消事件 ---");
            for (const event of events.auctionCancelled) {
                console.log(`
拍卖ID: ${event.args.auctionId}
取消者: ${event.args.canceller}
原因: ${event.args.reason}
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // PaymentSettled 事件
        if (events.paymentSettled.length > 0) {
            console.log("\n--- 支付结算事件 ---");
            for (const event of events.paymentSettled) {
                console.log(`
拍卖ID: ${event.args.auctionId}
卖家: ${event.args.seller}
买家: ${event.args.buyer}
金额: ${ethers.formatEther(event.args.amount)} ETH
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // NFTTransferred 事件
        if (events.nftTransferred.length > 0) {
            console.log("\n--- NFT转移事件 ---");
            for (const event of events.nftTransferred) {
                console.log(`
拍卖ID: ${event.args.auctionId}
从: ${event.args.from}
至: ${event.args.to}
NFT合约: ${event.args.nftContract}
Token ID: ${event.args.tokenId}
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

        // DutchAuctionPriceUpdated 事件
        if (events.dutchAuctionPriceUpdated.length > 0) {
            console.log("\n--- 荷兰拍卖价格更新事件 ---");
            for (const event of events.dutchAuctionPriceUpdated) {
                console.log(`
拍卖ID: ${event.args.auctionId}
旧价格: ${ethers.formatEther(event.args.oldPrice)} ETH
新价格: ${ethers.formatEther(event.args.newPrice)} ETH
时间戳: ${new Date(Number(event.args.timestamp) * 1000).toLocaleString()}
区块号: ${event.blockNumber}
                `);
            }
        }

    } catch (error) {
        console.error("查询事件失败:", error);
        throw error;
    }
}

queryEvents()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("脚本执行失败:", error);
        process.exit(1);
    }); 