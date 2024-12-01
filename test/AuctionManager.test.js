const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("拍卖系统测试", function () {
  let DAToken, DANFT, AuctionManager;
  let daToken, danft, auctionManager;
  let owner, admin, seller, bidder1, bidder2;
  const initialSupply = ethers.parseEther("1000000");

  beforeEach(async function () {
    [owner, admin, seller, bidder1, bidder2] = await ethers.getSigners();

    // 部署代币合约
    DAToken = await ethers.getContractFactory("DAToken");
    daToken = await DAToken.deploy(owner.address, initialSupply);
    await daToken.waitForDeployment();

    // 部署 NFT 合约
    DANFT = await ethers.getContractFactory("DANFT");
    danft = await DANFT.deploy(owner.address);
    await danft.waitForDeployment();

    // 部署拍卖管理合约
    AuctionManager = await ethers.getContractFactory("AuctionManager");
    auctionManager = await AuctionManager.deploy();
    await auctionManager.waitForDeployment();
    await auctionManager.initialize(admin.address, await daToken.getAddress());

    // 造一些代币给测试账户
    await daToken.connect(owner).transfer(bidder1.address, ethers.parseEther("10000"));
    await daToken.connect(owner).transfer(bidder2.address, ethers.parseEther("10000"));

    // 为 seller 铸造 tokenId 0 和 1 的 NFT
    await danft.connect(owner).mint(seller.address, 0, "ipfs://test");
    await danft.connect(owner).mint(seller.address, 1, "ipfs://test");
  });

  describe("基础功能测试", function () {
    it("正确初始化合约", async function () {
      expect(await auctionManager.daToken()).to.equal(await daToken.getAddress());
      expect(await auctionManager.hasRole(await auctionManager.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    });

    it("设置手续费率", async function () {
      const newFeeRate = 1000; // 10%
      await auctionManager.connect(admin).setFeeRate(newFeeRate);
      expect(await auctionManager.feeRate()).to.equal(newFeeRate);
    });
  });

  describe("英式拍卖测试", function () {
    const startingPrice = ethers.parseEther("100");
    const reservePrice = ethers.parseEther("80");
    const duration = 3600; // 1小时
    let auctionId;

    beforeEach(async function () {
      // 授权 NFT 给拍卖合约
      await danft.connect(seller).approve(await auctionManager.getAddress(), 0);
    });

    it("成功出价和结束拍卖", async function () {
      // 创建拍卖
      const tx = await auctionManager.connect(seller).startAuction(
        0, // EnglishAuction
        startingPrice,
        reservePrice,
        duration,
        await danft.getAddress(),
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      
      // 获取创建的拍卖ID
      const event = receipt.logs.find(log => {
        try {
          const parsed = auctionManager.interface.parseLog(log);
          return parsed.name === 'AuctionStarted';
        } catch {
          return false;
        }
      });
      auctionId = event.args.auctionId;

      // 支付押金
      const depositAmount = startingPrice * BigInt(10) / BigInt(100);
      const bidAmount = ethers.parseEther("120");
      
      // 授权总金额 = 押金 + 出价金额
      const totalAmount = depositAmount + bidAmount;
      await daToken.connect(bidder1).approve(
        await auctionManager.getAddress(), 
        totalAmount
      );

      // 支付押金
      await auctionManager.connect(bidder1).deposit(auctionId);

      // 出价
      await auctionManager.connect(bidder1).bid(auctionId, bidAmount);

      // 时间快进到拍卖结束
      await time.increase(duration + 1);

      // 结束拍卖
      await auctionManager.connect(admin).endAuction(auctionId);

      // 验证拍卖结果
      const auction = await auctionManager.auctions(auctionId);
      expect(auction.auctionStatus).to.equal(1); // Succeeded
      expect(auction.winner).to.equal(bidder1.address);
      expect(auction.finalPrice).to.equal(bidAmount);
    });
  });

  describe("荷兰拍卖测试", function () {
    const startingPrice = ethers.parseEther("100");
    const minimumPrice = ethers.parseEther("50");
    const duration = 3600;
    const priceDecrement = ethers.parseEther("5");
    const decrementInterval = 300;
    let auctionId;

    beforeEach(async function () {
      await danft.connect(seller).approve(await auctionManager.getAddress(), 1);
    });

    it("价格正确递减并成功购买", async function () {
      // 增加测试超时时间
      this.timeout(60000);

      // 创建拍卖
      const tx = await auctionManager.connect(seller).startAuction(
        1, // DutchAuction
        startingPrice,
        minimumPrice,
        duration,
        await danft.getAddress(),
        1,
        priceDecrement,
        decrementInterval
      );
      const receipt = await tx.wait();
      
      // 获取创建的拍卖ID
      const event = receipt.logs.find(log => {
        try {
          const parsed = auctionManager.interface.parseLog(log);
          return parsed.name === 'AuctionStarted';
        } catch {
          return false;
        }
      });
      auctionId = event.args.auctionId;

      // 时间快进一个递减间隔
      await time.increase(decrementInterval);

      // 获取当前价格
      const currentPrice = await auctionManager.getCurrentPrice(auctionId);
      console.log("Current price:", currentPrice.toString());

      const depositAmount = startingPrice * BigInt(10) / BigInt(100);
      
      // 授权总金额 = 押金 + 当前价格
      const totalAmount = depositAmount + currentPrice;
      await daToken.connect(bidder1).approve(
        await auctionManager.getAddress(), 
        totalAmount
      );

      // 支付押金
      await auctionManager.connect(bidder1).deposit(auctionId);

      // 暂停自动挖块
      await network.provider.send("evm_setAutomine", [false]);
      
      try {
        // 在同一个区块中获取价格和出价
        const latestPrice = await auctionManager.getCurrentPrice(auctionId);
        console.log("Latest price before bid:", latestPrice.toString());

        // 确保有足够的代币授权
        await daToken.connect(bidder1).approve(
          await auctionManager.getAddress(), 
          latestPrice
        );
        
        // 出价
        await auctionManager.connect(bidder1).bid(auctionId, latestPrice);
        
        // 手动挖块
        await network.provider.send("evm_mine");
      } finally {
        // 恢复自动挖块
        await network.provider.send("evm_setAutomine", [true]);
        // 等待一下，确保状态更新
        await network.provider.send("evm_mine");
      }

      // 获取拍卖状态
      const auction = await auctionManager.auctions(auctionId);
      console.log("Auction status:", {
        winner: auction.winner,
        currentPrice: auction.currentPrice.toString(),
        auctionStatus: auction.auctionStatus
      });

      // 验证出价结果
      // expect(auction.winner).to.equal(bidder1.address);
      // expect(auction.currentPrice).to.equal(currentPrice);

      // 时间快进到拍卖结束
      await time.increase(duration + 1);

      // 结束拍卖
      await auctionManager.connect(admin).endAuction(auctionId);

      // 最终验证
      const finalAuction = await auctionManager.auctions(auctionId);
      expect(finalAuction.auctionStatus).to.equal(1); // Succeeded
      expect(finalAuction.winner).to.equal(bidder1.address);
      expect(finalAuction.finalPrice).to.equal(currentPrice);
    });
  });
});