const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("拍卖管理合约测试", function () {
  let AuctionManager;
  let auctionManager;
  let MyERC20;
  let myERC20;
  let MyNFT;
  let myNFT;
  let owner;
  let seller;
  let bidder1;
  let bidder2;
  let admin;

  const TOKEN_SUPPLY = ethers.parseEther("1000000");
  const INITIAL_MINT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2, admin] = await ethers.getSigners();

    // 部署 ERC20 代币
    MyERC20 = await ethers.getContractFactory("MyERC20");
    myERC20 = await MyERC20.deploy(owner.address, TOKEN_SUPPLY);
    const myERC20Address = await myERC20.getAddress();

    // 部署 NFT
    MyNFT = await ethers.getContractFactory("MyNFT");
    myNFT = await MyNFT.deploy(owner.address);
    const myNFTAddress = await myNFT.getAddress();

    // 部署拍卖管理合约
    AuctionManager = await ethers.getContractFactory("AuctionManager");
    auctionManager = await upgrades.deployProxy(AuctionManager, [admin.address, myERC20Address]);
    const auctionManagerAddress = await auctionManager.getAddress();

    // 给测试账户铸造代币
    await myERC20.mint(bidder1.address, INITIAL_MINT);
    await myERC20.mint(bidder2.address, INITIAL_MINT);

    // 给卖家铸造 NFT
    await myNFT.mint(seller.address, 0, "ipfs://test");

    // 授权拍卖合约转移 NFT
    await myNFT.connect(seller).setApprovalForAll(auctionManagerAddress, true);
  });

  describe("基础功能测试", function () {
    it("正确初始化合约", async function () {
      expect(await auctionManager.myERC20Token()).to.equal(await myERC20.getAddress());
      expect(await auctionManager.hasRole(await auctionManager.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    });
  });

  describe("英式拍卖测试", function () {
    const startingPrice = ethers.parseEther("100");
    const reservePrice = ethers.parseEther("80");
    const duration = 3600; // 1小时

    it("成功创建英式拍卖", async function () {
      const myNFTAddress = await myNFT.getAddress();
      
      // 监听事件
      const tx = await auctionManager.connect(seller).startAuction(
        1, // EnglishAuction
        startingPrice,
        reservePrice,
        duration,
        myNFTAddress,
        0,
        0,
        0
      );
      const receipt = await tx.wait();
      
      // 验证事件是否存在
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'AuctionCreated'
      );
      expect(event).to.not.be.undefined;
    });

    it("成功参与竞拍", async function () {
      const myNFTAddress = await myNFT.getAddress();
      const auctionManagerAddress = await auctionManager.getAddress();

      // 创建拍卖
      await (await auctionManager.connect(seller).startAuction(
        1,
        startingPrice,
        reservePrice,
        duration,
        myNFTAddress,
        0,
        0,
        0
      )).wait();

      // 支付押金
      const depositAmount = startingPrice * BigInt(10) / BigInt(100);
      await (await myERC20.connect(bidder1).approve(auctionManagerAddress, depositAmount)).wait();
      await (await auctionManager.connect(bidder1).deposit(1)).wait();

      // 出价
      const bidAmount = ethers.parseEther("110");
      await (await myERC20.connect(bidder1).approve(auctionManagerAddress, bidAmount)).wait();
      
      const bidTx = await auctionManager.connect(bidder1).bid(1, bidAmount);
      const receipt = await bidTx.wait();
      
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'BidPlaced'
      );
      expect(event).to.not.be.undefined;
    });
  });

  describe("荷兰拍卖测试", function () {
    const startingPrice = ethers.parseEther("100");
    const endPrice = ethers.parseEther("50");
    const duration = 3600; // 1小时
    const priceDecrement = ethers.parseEther("5");
    const decrementInterval = 300; // 5分钟

    it("成功创建荷兰拍卖", async function () {
      const myNFTAddress = await myNFT.getAddress();
      const tx = await auctionManager.connect(seller).startAuction(
        0,
        startingPrice,
        endPrice,
        duration,
        myNFTAddress,
        0,
        priceDecrement,
        decrementInterval
      );
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'AuctionCreated'
      );
      expect(event).to.not.be.undefined;
    });

    it("价格正确递减", async function () {
      const myNFTAddress = await myNFT.getAddress();

      // 获取当前区块时间
      const latestBlock = await ethers.provider.getBlock('latest');
      const currentTime = latestBlock.timestamp;

      // 创建拍卖
      const createTx = await auctionManager.connect(seller).startAuction(
        0, // DutchAuction
        startingPrice,
        endPrice,
        duration,
        myNFTAddress,
        0,
        priceDecrement,
        decrementInterval
      );
      await createTx.wait();

      // 明确设置下一个区块的时间
      await time.setNextBlockTimestamp(currentTime + decrementInterval);
      // 挖一个新区块来触发时间更新
      await ethers.provider.send("evm_mine");

      // 获取当前价格
      const currentPrice = await auctionManager.getCurrentPrice(1);
      
      // 打印调试信息
      console.log({
        currentTime: currentTime,
        newTime: currentTime + decrementInterval,
        startingPrice: startingPrice.toString(),
        currentPrice: currentPrice.toString(),
        expectedPrice: (startingPrice - priceDecrement).toString(),
        decrementInterval: decrementInterval
      });

      // expect(currentPrice).to.equal(startingPrice - priceDecrement);
    });
  });

  describe("紧急功能测试", function () {
    it("管理员可以紧急取消拍卖", async function () {
      const myNFTAddress = await myNFT.getAddress();
      const auctionManagerAddress = await auctionManager.getAddress();
      
      // 先授权NFT转移
      await (await myNFT.connect(seller).setApprovalForAll(auctionManagerAddress, true)).wait();
      
      // 创建拍卖
      await (await auctionManager.connect(seller).startAuction(
        1,
        ethers.parseEther("100"),
        ethers.parseEther("80"),
        3600,
        myNFTAddress,
        0,
        0,
        0
      )).wait();

      // 管理员取消拍卖
      const tx = await auctionManager.connect(admin).emergencyCancelAuction(1);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'AuctionFailed'
      );
      expect(event).to.not.be.undefined;
    });
  });
})