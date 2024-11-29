const { ethers } = require("hardhat");
const { getDeployedAddresses } = require("../utils/address-helper");

// Define common constants
const DEPOSIT_AMOUNT = ethers.parseEther("0.01"); // 0.01 token deposit for all auctions

async function main() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const addresses = getDeployedAddresses();

    // 检查合约地址
    if (!addresses.DAToken || !addresses.DANFT || !addresses.AuctionManager) {
        console.error("合约地址未找到");
        process.exit(1);
    }

    const daNFTAddress = addresses.DANFT;
    const daTokenAddress = addresses.DAToken;
    const auctionManagerAddress = addresses.AuctionManager;

    try {
        // 获取合约实例
        const DANFT = await ethers.getContractFactory("DANFT");
        const DAToken = await ethers.getContractFactory("DAToken");
        const AuctionManager = await ethers.getContractFactory("AuctionManager");

        const daNFT = DANFT.attach(daNFTAddress);
        const daToken = DAToken.attach(daTokenAddress);
        const auctionManager = AuctionManager.attach(auctionManagerAddress);

        // 铸造 NFT (总共30个，然后分配)
        console.log("\n=== Minting and Distributing NFTs ===");
        
        // Owner mints NFTs
        const nftIds = [];
        
        // Wait for each NFT to be minted
        for(let i = 0; i < 30; i++) {
            try {
                console.log(`Minting NFT #${i}...`);
                const tx = await daNFT.connect(owner).mint(`ipfs://token-uri-${i}`);
                const receipt = await tx.wait();
                
                // Get tokenId from event
                let tokenId;
                for (const event of receipt.logs) {
                    try {
                        const parsedLog = daNFT.interface.parseLog(event);
                        if (parsedLog?.name === 'Transfer') {
                            tokenId = parsedLog.args.tokenId;
                            break;
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                if (tokenId === undefined) {
                    throw new Error(`Failed to get tokenId for NFT #${i}`);
                }
                
                // Verify NFT ownership
                console.log(`Verifying ownership of NFT #${tokenId}...`);
                const currentOwner = await daNFT.ownerOf(tokenId);
                console.log(`Current owner of NFT #${tokenId}: ${currentOwner}`);
                console.log(`Owner address: ${owner.address}`);
                
                if (currentOwner.toLowerCase() !== owner.address.toLowerCase()) {
                    throw new Error(`NFT #${tokenId} ownership verification failed`);
                }
                
                nftIds.push(tokenId);
                console.log(`Successfully minted NFT #${tokenId}, owner: ${currentOwner}`);
            } catch (error) {
                console.error(`Failed to mint NFT ${i}:`, error);
                throw error;
            }
        }
        
        console.log("NFT 铸造完成，开始分配...");

        // 分配给 addr1 (前10个)
        for(let i = 10; i < 20; i++) {
            try {
                // 确保NFT存在并且owner拥有它
                const tokenId = nftIds[i];
                const currentOwner = await daNFT.ownerOf(tokenId);
                
                if (currentOwner !== owner.address) {
                    console.log(`跳过 NFT #${tokenId}，当前有者不是owner`);
                    continue;
                }

                console.log(`转移 NFT #${tokenId} 给 addr1...`);
                const tx = await daNFT.connect(owner)["safeTransferFrom(address,address,uint256)"](
                    owner.address,
                    addr1.address,
                    tokenId
                );
                await tx.wait();
                
                // 验证转移
                const newOwner = await daNFT.ownerOf(tokenId);
                console.log(`NFT #${tokenId} 转移成功，新所有者: ${newOwner}`);
            } catch (error) {
                console.error(`转移 NFT ${nftIds[i]} 给 addr1 失败:`, error);
                // 继续处理下一个，而不是直接抛出错误
                continue;
            }
        }

        // 分配给 addr2 (后10个)
        for(let i = 20; i < 30; i++) {
            try {
                console.log(`尝试转移 NFT #${nftIds[i]} 给 addr2...`);
                
                // 检查当前所有者
                const currentOwner = await daNFT.ownerOf(nftIds[i]);
                console.log(`当前所有者: ${currentOwner}`);
                
                // 找到对应的签名者
                let currentOwnerSigner;
                if(currentOwner === owner.address) {
                    currentOwnerSigner = owner;
                } else if(currentOwner === addr1.address) {
                    currentOwnerSigner = addr1;
                } else if(currentOwner === addr2.address) {
                    currentOwnerSigner = addr2;
                } else {
                    throw new Error(`未知的 NFT 所有者: ${currentOwner}`);
                }
                
                // 使用当前所有者的签名者转移
                console.log(`从当前所有者转移 NFT #${nftIds[i]} 给 addr2...`);
                const tx = await daNFT.connect(currentOwnerSigner)["safeTransferFrom(address,address,uint256)"](
                    currentOwner,
                    addr2.address,
                    nftIds[i]
                );
                await tx.wait();
                console.log(`转移 NFT #${nftIds[i]} 给 addr2 成功`);
                
                // 验证新的所有者
                const newOwner = await daNFT.ownerOf(nftIds[i]);
                console.log(`新的所有者: ${newOwner}`);
            } catch (error) {
                console.error(`转移 NFT ${nftIds[i]} 给 addr2 失败:`, error);
                throw error;
            }
        }

        console.log("NFT 分配完成");

        // 铸造代币给参与拍卖的用户
        console.log("\n=== 铸造和分配代币 ===");
        
        // 给每个用户铸造 1 个代币
        const mintAmount = ethers.parseEther("1.0");
        
        console.log("给 owner 铸造代币...");
        let mintTx = await daToken.connect(owner).mint(owner.address, mintAmount);
        await mintTx.wait();
        console.log(`owner 代币余额: ${ethers.formatEther(await daToken.balanceOf(owner.address))}`);
        
        console.log("\n给 addr1 铸造代币...");
        mintTx = await daToken.connect(owner).mint(addr1.address, mintAmount);
        await mintTx.wait();
        console.log(`addr1 代币余额: ${ethers.formatEther(await daToken.balanceOf(addr1.address))}`);
        
        console.log("\n给 addr2 铸造代币...");
        mintTx = await daToken.connect(owner).mint(addr2.address, mintAmount);
        await mintTx.wait();
        console.log(`addr2 代币余额: ${ethers.formatEther(await daToken.balanceOf(addr2.address))}`);

        // 创建示例拍卖（使用较小的金额）
        console.log("\n=== 创建示例拍卖 ===");
        
        // 用于存储拍卖ID
        let dutchAuctionId, englishAuctionId;
        
        // 荷兰式拍卖参数
        const dutchAuctionParams = {
            auctionType: 1, // DutchAuction
            startingPrice: ethers.parseEther("0.1"),   // 起拍价 0.1 代币
            reservePrice: ethers.parseEther("0.01"),   // 保留价 0.01 代币
            duration: 3600,                            // 1小时
            nftContract: await daNFT.getAddress(),
            tokenId: nftIds[0],                        // owner的第一个NFT
            priceDecrement: ethers.parseEther("0.01"), // 每次降价 0.01 代币
            decrementInterval: 300                     // 每5分钟降价一次
        };

        // 先授权 NFT 给拍卖合约
        console.log("授权 NFT 给拍卖合约...");
        let approveTx = await daNFT.connect(owner).approve(auctionManagerAddress, dutchAuctionParams.tokenId);
        await approveTx.wait();
        console.log("NFT 授权完成");

        // // 创建荷兰式拍卖
        // console.log("创建荷兰式拍卖...");
        // let tx = await auctionManager.connect(owner).startAuction(
        //     dutchAuctionParams.auctionType,
        //     dutchAuctionParams.startingPrice,
        //     dutchAuctionParams.reservePrice,
        //     dutchAuctionParams.duration,
        //     dutchAuctionParams.nftContract,
        //     dutchAuctionParams.tokenId,
        //     dutchAuctionParams.priceDecrement,
        //     dutchAuctionParams.decrementInterval
        // );
        // let receipt = await tx.wait();
        
        // // 修改获取荷兰拍卖ID的部分
        // console.log("解析事件日志...");
        // let foundAuctionId = false;
        // for (const log of receipt.logs) {
        //     // 打印日志信息以便调试
        //     console.log("处理日志:", log);
            
        //     try {
        //         // 尝试解析日志
        //         const parsedLog = auctionManager.interface.parseLog({
        //             topics: log.topics,
        //             data: log.data
        //         });
                
        //         console.log("解析的日志:", parsedLog);
                
        //         if (parsedLog && parsedLog.name === 'AuctionCreated') {
        //             dutchAuctionId = parsedLog.args[0]; // 直接获取第一个参数
        //             console.log(`荷兰拍卖创建成功，拍卖ID: ${dutchAuctionId}`);
        //             foundAuctionId = true;
        //             break;
        //         }
        //     } catch (error) {
        //         console.log("解析日志失败:", error.message);
        //         continue;
        //     }
        // }

        // if (!foundAuctionId) {
        //     console.log("完整的交易收据:", receipt);
        //     throw new Error("未能获取荷兰拍卖ID");
        // }

        // 英式拍卖参数
        const englishAuctionParams = {
            auctionType: 0, // EnglishAuction
            startingPrice: ethers.parseEther("0.05"),  // 起拍价 0.05 代币
            reservePrice: ethers.parseEther("0.01"),   // 保留价 0.01 代币
            duration: 3600,                            // 1小时
            nftContract: await daNFT.getAddress(),
            tokenId: nftIds[10],                       // addr1的第一个NFT
            priceDecrement: 0,                         // 英式拍卖不需要
            decrementInterval: 0                       // 英式拍卖不需要
        };

        // 先授权 NFT 给拍卖合约
        console.log("\n授权 NFT 给拍卖合约...");
        approveTx = await daNFT.connect(addr1).approve(auctionManagerAddress, englishAuctionParams.tokenId);
        await approveTx.wait();
        console.log("NFT 授权完成");

        // 创建英式拍卖
        console.log("创建英式拍卖...");
        tx = await auctionManager.connect(addr1).startAuction(
            englishAuctionParams.auctionType,
            englishAuctionParams.startingPrice,
            englishAuctionParams.reservePrice,
            englishAuctionParams.duration,
            englishAuctionParams.nftContract,
            englishAuctionParams.tokenId,
            englishAuctionParams.priceDecrement,
            englishAuctionParams.decrementInterval
        );
        receipt = await tx.wait();
        
        // 修改获取英式拍卖ID的部分
        console.log("解析事件日志...");
        let foundAuctionId = false;
        for (const log of receipt.logs) {
            try {
                // 尝试解析日志
                const parsedLog = auctionManager.interface.parseLog({
                    topics: log.topics,
                    data: log.data
                });
                
                console.log("解析的日志:", parsedLog);
                
                // 使用 AuctionStarted 事件名称
                if (parsedLog && parsedLog.name === 'AuctionStarted') {
                    englishAuctionId = parsedLog.args[0]; // auctionId 是第一个参数
                    console.log(`英式拍卖创建成功，拍卖ID: ${englishAuctionId}`);
                    foundAuctionId = true;
                    break;
                }
            } catch (error) {
                console.log("解析日志失败:", error.message);
                continue;
            }
        }

        if (!foundAuctionId) {
            console.log("完整的交易收据:", receipt);
            throw new Error("未能获取英式拍卖ID");
        }

        // 进行出价
        console.log("\n=== 进行出价测试 ===");

        // 为英式拍卖出价
        console.log("\n英式拍卖出价测试：");
        
        // addr2 出价 0.06 代币
        const englishBidAmount1 = ethers.parseEther("0.06");
        console.log("addr2 出价 0.06 代币...");
        
        // 先授权代币用于保证金
        console.log("授权代币用于保证金...");
        await daToken.connect(addr2).approve(auctionManagerAddress, DEPOSIT_AMOUNT);
        console.log("保证金代币授权完成");
        
        // 支付保证金
        console.log("支付保证金...");
        tx = await auctionManager.connect(addr2).deposit(englishAuctionId);
        receipt = await tx.wait();
        console.log("保证金支付完成");
        
        // 授权代币用于出价
        console.log("授权代币用于出价...");
        await daToken.connect(addr2).approve(auctionManagerAddress, englishBidAmount1);
        console.log("出价代币授权完成");
        
        // 出价
        console.log("提交出价...");
        tx = await auctionManager.connect(addr2).bid(englishAuctionId, englishBidAmount1);
        receipt = await tx.wait();
        
        // 打印出价事件
        for (const log of receipt.logs) {
            try {
                const parsedLog = auctionManager.interface.parseLog(log);
                if (parsedLog?.name === 'BidPlaced') {
                    console.log(`出价成功：
                    - 出价者: ${parsedLog.args.bidder}
                    - 金额: ${ethers.formatEther(parsedLog.args.currentPrice)} 代币`);
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        // owner 出价 0.07 代币
        const englishBidAmount2 = ethers.parseEther("0.07");
        console.log("\nowner 出价 0.07 代币...");
        
        // 先授权代币用于保证金
        console.log("授权代币用于保证金...");
        await daToken.connect(owner).approve(auctionManagerAddress, englishAuctionDepositAmount);
        console.log("保证金代币授权完成");
        
        // 支付保证金
        console.log("支付保证金...");
        tx = await auctionManager.connect(owner).deposit(englishAuctionId);
        receipt = await tx.wait();
        console.log("保证金支付完成");
        
        // 授权代币用于出价
        console.log("授权代币用于出价...");
        await daToken.connect(owner).approve(auctionManagerAddress, englishBidAmount2);
        console.log("出价代币授权完成");
        
        // 出价
        tx = await auctionManager.connect(owner).bid(englishAuctionId, englishBidAmount2);
        receipt = await tx.wait();
        
        // 打印出价事件
        for (const log of receipt.logs) {
            try {
                const parsedLog = auctionManager.interface.parseLog(log);
                if (parsedLog?.name === 'BidPlaced') {
                    console.log(`出价成功：
                    - 出价者: ${parsedLog.args.bidder}
                    - 金额: ${ethers.formatEther(parsedLog.args.currentPrice)} 代币`);
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        // 辅助函数：格式化事件参数值
        const formatEventValue = (value) => {
            if (ethers.isAddress(value)) {
                return value;
            } else if (typeof value === 'bigint') {
                // 尝试将大数字转换为ETH单位，如果失败则返回原始值
                try {
                    return `${ethers.formatEther(value)} ETH (${value.toString()})`;
                } catch {
                    return value.toString();
                }
            } else if (value._isBigNumber) {  // 处理BigNumber类型
                return value.toString();
            } else {
                return value;
            }
        };

        // 辅助函数：打印事件日志
        const printEventLogs = async (receipt) => {
            console.log("\n=== 事件日志详情 ===");
            for (const log of receipt.logs) {
                try {
                    const parsedLog = auctionManager.interface.parseLog(log);
                    if (parsedLog) {
                        console.log(`\n事件名称: ${parsedLog.name}`);
                        console.log('事件参数:');
                        for (const [key, value] of Object.entries(parsedLog.args)) {
                            if (isNaN(parseInt(key))) {  // 只打印非数字索引的参数
                                const formattedValue = formatEventValue(value);
                                console.log(`  ${key}: ${formattedValue}`);
                            }
                        }
                        
                        // 打印事件的其他元数据
                        console.log('\n事件元数据:');
                        console.log(`  区块号: ${receipt.blockNumber}`);
                        console.log(`  交易哈希: ${receipt.hash}`);
                        console.log(`  日志索引: ${log.index}`);
                    }
                } catch (error) {
                    continue;
                }
            }
            console.log("\n=== 事件日志结束 ===\n");
        };

        // // 为荷兰拍卖出价
        // console.log("\n荷兰拍卖出价测试：");

        // // 获取当前价格
        // console.log("获取当前价格...");
        // const currentPrice = await auctionManager.getCurrentPrice(dutchAuctionId);
        // console.log(`当前价格: ${ethers.formatEther(currentPrice)} 代币`);

        // addr1 出价当前价格
        // console.log(`addr1 出价 ${ethers.formatEther(currentPrice)} 代币...`);

        // 先授权代币用于保证金
        console.log("授权代币用于保证金...");
        tx = await daToken.connect(addr1).approve(auctionManagerAddress, englishAuctionDepositAmount);
        receipt = await tx.wait();
        console.log("保证金代币授权完成");
        await printEventLogs(receipt);

        // 支付保证金
        console.log("支付保证金...");
        tx = await auctionManager.connect(addr1).deposit(dutchAuctionId);
        receipt = await tx.wait();
        console.log("保证金支付完成");
        await printEventLogs(receipt);

        // 授权代币用于出价
        console.log("授权代币用于出价...");
        tx = await daToken.connect(addr1).approve(auctionManagerAddress, currentPrice);
        receipt = await tx.wait();
        console.log("出价代币授权完成");
        await printEventLogs(receipt);

        // 出价
        console.log("提交出价...");
        tx = await auctionManager.connect(addr1).bid(dutchAuctionId, currentPrice);
        receipt = await tx.wait();
        console.log("出价完成");
        await printEventLogs(receipt);

        // 显示最终状
        console.log("\n=== 最终状态 ===");
        console.log("代币余额：");
        console.log("Owner:", ethers.formatEther(await daToken.balanceOf(owner.address)));
        console.log("Addr1:", ethers.formatEther(await daToken.balanceOf(addr1.address)));
        console.log("Addr2:", ethers.formatEther(await daToken.balanceOf(addr2.address)));

        console.log("\nNFT 数量：");
        console.log("Owner:", (await daNFT.balanceOf(owner.address)).toString());
        console.log("Addr1:", (await daNFT.balanceOf(addr1.address)).toString());
        console.log("Addr2:", (await daNFT.balanceOf(addr2.address)).toString());

        // Create three English auctions
        console.log("\n=== Creating English Auctions ===");
        
        // Common parameters for English auctions
        const baseEnglishAuctionParams = {
            auctionType: 0, // EnglishAuction
            startingPrice: ethers.parseEther("0.05"),  // 0.05 tokens
            reservePrice: ethers.parseEther("0.01"),   // 0.01 tokens
            duration: 3600,                            // 1 hour
            nftContract: await daNFT.getAddress(),
            priceDecrement: 0,                         // not used in English auction
            decrementInterval: 0                       // not used in English auction
        };

        const englishAuctionIds = [];

        // Create three auctions with different NFTs
        for(let i = 0; i < 3; i++) {
            const tokenId = nftIds[10 + i];  // Use NFTs 10, 11, 12 (owned by addr1)
            
            console.log(`\nCreating English Auction #${i + 1} for NFT #${tokenId}`);
            
            // Approve NFT for auction
            console.log("Approving NFT...");
            const approveTx = await daNFT.connect(addr1).approve(auctionManagerAddress, tokenId);
            await approveTx.wait();
            console.log("NFT approved");

            // Create auction
            console.log("Creating auction...");
            const auctionParams = {
                ...baseEnglishAuctionParams,
                tokenId: tokenId
            };

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

            // Get auction ID
            let auctionId;
            for (const log of receipt.logs) {
                try {
                    const parsedLog = auctionManager.interface.parseLog(log);
                    if (parsedLog?.name === 'AuctionStarted') {
                        auctionId = parsedLog.args[0];
                        console.log(`Auction created with ID: ${auctionId}`);
                        englishAuctionIds.push(auctionId);
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
        }

        // Perform bidding on each auction
        console.log("\n=== Bidding on English Auctions ===");

        const englishAuctionDepositAmount = ethers.parseEther("0.01"); // 0.01 token deposit

        for(let i = 0; i < englishAuctionIds.length; i++) {
            const auctionId = englishAuctionIds[i];
            console.log(`\nBidding on Auction #${i + 1} (ID: ${auctionId})`);

            // First bid by addr2
            const bidAmount1 = ethers.parseEther("0.06");
            console.log("\nFirst bid by addr2:", ethers.formatEther(bidAmount1), "tokens");
            
            // Approve and deposit
            await daToken.connect(addr2).approve(auctionManagerAddress, englishAuctionDepositAmount);
            await auctionManager.connect(addr2).deposit(auctionId);
            
            // Place bid
            await daToken.connect(addr2).approve(auctionManagerAddress, bidAmount1);
            let tx = await auctionManager.connect(addr2).bid(auctionId, bidAmount1);
            await tx.wait();

            // Second bid by owner
            const bidAmount2 = ethers.parseEther("0.07");
            console.log("\nSecond bid by owner:", ethers.formatEther(bidAmount2), "tokens");
            
            // Approve and deposit
            await daToken.connect(owner).approve(auctionManagerAddress, englishAuctionDepositAmount);
            await auctionManager.connect(owner).deposit(auctionId);
            
            // Place bid
            await daToken.connect(owner).approve(auctionManagerAddress, bidAmount2);
            tx = await auctionManager.connect(owner).bid(auctionId, bidAmount2);
            await tx.wait();
        }

    } catch (error) {
        console.error("操作失败:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error("操作失败:", error);
        process.exit(1);
    });