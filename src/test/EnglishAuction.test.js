const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EnglishAuction", function () {
    let daToken;
    let nft;
    let englishAuction;
    let owner;
    let seller;
    let bidder1;
    let bidder2;
    
    const TOKEN_ID = 1;
    const STARTING_PRICE = ethers.parseEther("100"); // 100 DAToken
    const AUCTION_DURATION = 3600; // 1 hour
    const NFT_URI = "ipfs://test-uri";

    beforeEach(async function () {
        // 获取测试账户
        [owner, seller, bidder1, bidder2] = await ethers.getSigners();

        // 部署 DAToken
        const DAToken = await ethers.getContractFactory("DAToken");
        daToken = await DAToken.deploy(ethers.parseEther("1000000")); // 1M tokens

        // 部署 NFT
        const DANFT = await ethers.getContractFactory("DANFT");
        nft = await DANFT.deploy(owner.address);

        // 部署拍卖合约
        const EnglishAuction = await ethers.getContractFactory("EnglishAuction");
        englishAuction = await EnglishAuction.deploy(await daToken.getAddress());

        // 给测试账户铸造代币
        await daToken.mint(bidder1.address, ethers.parseEther("1000"));
        await daToken.mint(bidder2.address, ethers.parseEther("1000"));

        // 铸造 NFT 给 seller
        await nft.mint(seller.address, TOKEN_ID, NFT_URI);
    });

    describe("创建拍卖", function () {
        it("应该正确创建拍卖", async function () {
            // NFT 授权给拍卖合约
            await nft.connect(seller).approve(englishAuction.getAddress(), TOKEN_ID);

            // 创建拍卖
            await englishAuction.connect(seller).createAuction(
                await nft.getAddress(),
                TOKEN_ID,
                STARTING_PRICE,
                AUCTION_DURATION
            );

            const auction = await englishAuction.getAuction(await nft.getAddress(), TOKEN_ID);
            expect(auction.seller).to.equal(seller.address);
            expect(auction.startingPrice).to.equal(STARTING_PRICE);
        });

        it("非 NFT 所有者不能创建拍卖", async function () {
            await expect(
                englishAuction.connect(bidder1).createAuction(
                    await nft.getAddress(),
                    TOKEN_ID,
                    STARTING_PRICE,
                    AUCTION_DURATION
                )
            ).to.be.revertedWithCustomError(
                englishAuction,
                "EnglishAuction__NotOwner"
            );
        });
    });

    describe("竞拍功能", function () {
        beforeEach(async function () {
            // 准备拍卖环境
            await nft.connect(seller).approve(englishAuction.getAddress(), TOKEN_ID);
            await englishAuction.connect(seller).createAuction(
                await nft.getAddress(),
                TOKEN_ID,
                STARTING_PRICE,
                AUCTION_DURATION
            );
        });

        it("应该允许有效的出价", async function () {
            const bidAmount = ethers.parseEther("150");
            
            // 授权代币给拍卖合约
            await daToken.connect(bidder1).approve(
                englishAuction.getAddress(),
                bidAmount
            );

            // 出价
            await englishAuction.connect(bidder1).bid(
                await nft.getAddress(),
                TOKEN_ID,
                bidAmount
            );

            const auction = await englishAuction.getAuction(await nft.getAddress(), TOKEN_ID);
            expect(auction.highestBidder).to.equal(bidder1.address);
            expect(auction.highestBid).to.equal(bidAmount);
        });

        it("不能低于起拍价出价", async function () {
            const lowBidAmount = ethers.parseEther("50");
            
            await daToken.connect(bidder1).approve(
                englishAuction.getAddress(),
                lowBidAmount
            );

            await expect(
                englishAuction.connect(bidder1).bid(
                    await nft.getAddress(),
                    TOKEN_ID,
                    lowBidAmount
                )
            ).to.be.revertedWithCustomError(
                englishAuction,
                "EnglishAuction__InsufficientAmount"
            );
        });

        it("应该正确处理多个出价", async function () {
            // 第一次出价
            const firstBid = ethers.parseEther("150");
            await daToken.connect(bidder1).approve(englishAuction.getAddress(), firstBid);
            await englishAuction.connect(bidder1).bid(
                await nft.getAddress(),
                TOKEN_ID,
                firstBid
            );

            // 第二次出价
            const secondBid = ethers.parseEther("200");
            await daToken.connect(bidder2).approve(englishAuction.getAddress(), secondBid);
            await englishAuction.connect(bidder2).bid(
                await nft.getAddress(),
                TOKEN_ID,
                secondBid
            );

            const auction = await englishAuction.getAuction(await nft.getAddress(), TOKEN_ID);
            expect(auction.highestBidder).to.equal(bidder2.address);
            expect(auction.highestBid).to.equal(secondBid);
        });
    });

    describe("结束拍卖", function () {
        beforeEach(async function () {
            // 准备拍卖环境
            await nft.connect(seller).approve(englishAuction.getAddress(), TOKEN_ID);
            await englishAuction.connect(seller).createAuction(
                await nft.getAddress(),
                TOKEN_ID,
                STARTING_PRICE,
                AUCTION_DURATION
            );

            // 进行一次出价
            const bidAmount = ethers.parseEther("150");
            await daToken.connect(bidder1).approve(englishAuction.getAddress(), bidAmount);
            await englishAuction.connect(bidder1).bid(
                await nft.getAddress(),
                TOKEN_ID,
                bidAmount
            );
        });

        it("应该正确结束拍卖", async function () {
            // 快进时间
            await time.increase(AUCTION_DURATION + 1);

            // 结束拍卖
            await englishAuction.connect(seller).endAuction(
                await nft.getAddress(),
                TOKEN_ID
            );

            // 验证 NFT 所有权转移
            expect(await nft.ownerOf(TOKEN_ID)).to.equal(bidder1.address);

            // 验证卖家收到代币
            const sellerBalance = await daToken.balanceOf(seller.address);
            expect(sellerBalance).to.equal(ethers.parseEther("150"));
        });

        it("拍卖未结束时不能结束拍卖", async function () {
            await expect(
                englishAuction.connect(seller).endAuction(
                    await nft.getAddress(),
                    TOKEN_ID
                )
            ).to.be.revertedWithCustomError(
                englishAuction,
                "EnglishAuction__AuctionIsNotOverYet"
            );
        });

        it("非卖家不能结束拍卖", async function () {
            await time.increase(AUCTION_DURATION + 1);

            await expect(
                englishAuction.connect(bidder2).endAuction(
                    await nft.getAddress(),
                    TOKEN_ID
                )
            ).to.be.revertedWithCustomError(
                englishAuction,
                "EnglishAuction__CallerIsNotTheSeller"
            );
        });
    });
}); 