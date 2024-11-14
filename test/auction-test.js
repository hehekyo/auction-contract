const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Auction System", function () {
    let AuctionManager, MyERC20, MyNFT;
    let auctionManager, myERC20, myNFT;
    let owner, seller, bidder1, bidder2, bidder3;
    let provider;

    // 常量定义
    const INITIAL_TOKEN_SUPPLY = ethers.parseEther("1000000");
    const TOKEN_AMOUNT = ethers.parseEther("10000");
    const STARTING_PRICE = ethers.parseEther("100");
    const RESERVE_PRICE = ethers.parseEther("50");
    const END_PRICE = ethers.parseEther("10");
    const DURATION = 3600; // 1小时
    const PRICE_DECREMENT = ethers.parseEther("10");
    const DECREMENT_INTERVAL = 600; // 10分钟

    // 辅助函数：快进时间
    async function moveTime(seconds) {
        await time.increase(seconds);
    }

    // 辅助函数：部署合约
    async function deployContracts() {
        // 获取合约工厂
        AuctionManager = await ethers.getContractFactory("AuctionManager");
        MyERC20 = await ethers.getContractFactory("MyERC20");
        MyNFT = await ethers.getContractFactory("MyNFT");

        // 部署代币合约
        myERC20 = await MyERC20.deploy(INITIAL_TOKEN_SUPPLY);
        await myERC20.waitForDeployment();

        // 部署NFT合约
        myNFT = await MyNFT.deploy();
        await myNFT.waitForDeployment();

        // 部署拍卖管理合约
        auctionManager = await upgrades.deployProxy(AuctionManager, 
            [owner.address, await myERC20.getAddress(), "1.0.0"], 
            { initializer: 'initialize' }
        );
        await auctionManager.waitForDeployment();
    }

    // 辅助函数：设置代币余额和授权
    async function setupTokenBalances() {
        // 转移代币给竞标者
        await myERC20.transfer(bidder1.address, TOKEN_AMOUNT);
        await myERC20.transfer(bidder2.address, TOKEN_AMOUNT);
        await myERC20.transfer(bidder3.address, TOKEN_AMOUNT);

        // 授权拍卖合约使用代币
        await myERC20.connect(bidder1).approve(auctionManager, TOKEN_AMOUNT);
        await myERC20.connect(bidder2).approve(auctionManager, TOKEN_AMOUNT);
        await myERC20.connect(bidder3).approve(auctionManager, TOKEN_AMOUNT);
    }

    beforeEach(async function () {
        // 获取测试账户
        [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();
        provider = ethers.provider;

        // 部署合约
        await deployContracts();

        // 设置代币余额和授权
        await setupTokenBalances();

        // 铸造NFT给卖家
        await myNFT.connect(seller).mint();
        // 授权拍卖合约转移NFT
        await myNFT.connect(seller).setApprovalForAll(auctionManager, true);
    });

    // 在之前的代码后添加以下测试用例

describe("Basic Functionality", function () {
    it("Should deploy contracts correctly", async function () {
        expect(await myERC20.totalSupply()).to.equal(INITIAL_TOKEN_SUPPLY);
        expect(await myERC20.balanceOf(bidder1.address)).to.equal(TOKEN_AMOUNT);
        expect(await myNFT.ownerOf(1)).to.equal(seller.address);
    });

    it("Should initialize AuctionManager correctly", async function () {
        expect(await auctionManager.version()).to.equal("1.0.0");
        expect(await auctionManager.hasRole(await auctionManager.DEFAULT_ADMIN_ROLE(), owner.address))
            .to.be.true;
    });
});

describe("English Auction", function () {
    let auctionId;

    beforeEach(async function () {
        // 创建英式拍卖
        const tx = await auctionManager.connect(seller).startAuction(
            0, // EnglishAuction
            STARTING_PRICE,
            RESERVE_PRICE,
            DURATION,
            await myNFT.getAddress(),
            1, // tokenId
            0, // priceDecrement (不用于英式拍卖)
            0  // decrementInterval (不用于英式拍卖)
        );
        const receipt = await tx.wait();
        // 从事件中获取拍卖ID
        const event = receipt.events.find(e => e.event === 'AuctionCreated');
        auctionId = event.args.auctionId;
    });

    it("Should create English auction correctly", async function () {
        const auction = await auctionManager.auctions(auctionId);
        expect(auction.seller).to.equal(seller.address);
        expect(auction.auctionType).to.equal(0); // EnglishAuction
    });

    it("Should allow deposit and bidding", async function () {
        // 支付押金
        await auctionManager.connect(bidder1).deposit(auctionId);
        
        // 出价
        const bidAmount = STARTING_PRICE;
        await auctionManager.connect(bidder1).bid(auctionId, bidAmount);
        
        const auction = await auctionManager.auctions(auctionId);
        expect(auction.highestBidder).to.equal(bidder1.address);
    });

    it("Should handle multiple bids correctly", async function () {
        // 多个竞标者支付押金
        await auctionManager.connect(bidder1).deposit(auctionId);
        await auctionManager.connect(bidder2).deposit(auctionId);

        // 竞标过程
        await auctionManager.connect(bidder1).bid(auctionId, STARTING_PRICE);
        await auctionManager.connect(bidder2).bid(auctionId, STARTING_PRICE.add(ethers.parseEther("10")));

        const auction = await auctionManager.auctions(auctionId);
        expect(auction.highestBidder).to.equal(bidder2.address);
    });

    it("Should end auction correctly", async function () {
        // 支付押金和出价
        await auctionManager.connect(bidder1).deposit(auctionId);
        await auctionManager.connect(bidder1).bid(auctionId, STARTING_PRICE);

        // 快进到拍卖结束时间
        await moveTime(DURATION + 1);

        // 结束拍卖
        await auctionManager.endAuction(auctionId);

        const auction = await auctionManager.auctions(auctionId);
        expect(auction.auctionStatus).to.equal(2); // Ended
        expect(await myNFT.ownerOf(1)).to.equal(bidder1.address);
    });
});


// 在之前的代码后添加以下测试用例

describe("Dutch Auction", function () {
    let auctionId;

    beforeEach(async function () {
        // 创建荷兰拍卖
        const tx = await auctionManager.connect(seller).startAuction(
            1, // DutchAuction
            STARTING_PRICE,
            END_PRICE,
            DURATION,
            await myNFT.getAddress(),
            1,
            PRICE_DECREMENT,
            DECREMENT_INTERVAL
        );
        const receipt = await tx.wait();
        const event = receipt.events.find(e => e.event === 'AuctionCreated');
        auctionId = event.args.auctionId;
    });

    it("Should create Dutch auction correctly", async function () {
        const auction = await auctionManager.auctions(auctionId);
        expect(auction.seller).to.equal(seller.address);
        expect(auction.auctionType).to.equal(1); // DutchAuction
    });

    it("Should decrease price over time", async function () {
        // 获取初始价格
        const initialPrice = await auctionManager.getCurrentPrice(auctionId);

        // 快进一个价格递减间隔
        await moveTime(DECREMENT_INTERVAL);

        // 检查价格是否降低
        const newPrice = await auctionManager.getCurrentPrice(auctionId);
        expect(newPrice).to.be.lt(initialPrice);
    });

    it("Should allow immediate purchase at current price", async function () {
        // 支付押金
        await auctionManager.connect(bidder1).deposit(auctionId);

        // 获取当前价格
        const currentPrice = await auctionManager.getCurrentPrice(auctionId);

        // 购买
        await auctionManager.connect(bidder1).bid(auctionId, currentPrice);

        const auction = await auctionManager.auctions(auctionId);
        expect(auction.highestBidder).to.equal(bidder1.address);
    });
});

describe("Advanced Features", function () {
    let auctionId;

    beforeEach(async function () {
        // 创建英式拍卖
        const tx = await auctionManager.connect(seller).startAuction(
            0,
            STARTING_PRICE,
            RESERVE_PRICE,
            DURATION,
            await myNFT.getAddress(),
            1,
            0,
            0
        );
        const receipt = await tx.wait();
        const event = receipt.events.find(e => e.event === 'AuctionCreated');
        auctionId = event.args.auctionId;
    });

    it("Should handle emergency cancel correctly", async function () {
        // 支付押金和出价
        await auctionManager.connect(bidder1).deposit(auctionId);
        await auctionManager.connect(bidder1).bid(auctionId, STARTING_PRICE);

        // 紧急取消
        await auctionManager.connect(owner).emergencyCancelAuction(auctionId);

        const auction = await auctionManager.auctions(auctionId);
        expect(auction.auctionStatus).to.equal(2); // Ended
    });

    it("Should handle deposit refunds correctly", async function () {
        // 支付押金
        await auctionManager.connect(bidder1).deposit(auctionId);
        
        // 快进到拍卖结束
        await moveTime(DURATION + 1);
        
        // 结束拍卖
        await auctionManager.endAuction(auctionId);

        // 退还押金
        const initialBalance = await myERC20.balanceOf(bidder1.address);
        await auctionManager.connect(bidder1).refundDeposit(auctionId);
        const finalBalance = await myERC20.balanceOf(bidder1.address);

        expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should handle contract upgrades correctly", async function () {
        const AuctionManagerV2 = await ethers.getContractFactory("AuctionManagerV2");
        const upgraded = await upgrades.upgradeProxy(
            await auctionManager.getAddress(),
            AuctionManagerV2
        );

        expect(await upgraded.version()).to.equal("1.0.0");
        await upgraded.initializeV2(500); // 5% fee
        expect(await upgraded.version()).to.equal("2.0.0");
    });
});

}); 