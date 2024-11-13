const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AuctionManagerUpgradeable", function () {
  let auctionManager;
  let myERC20Token;
  let myNFT;
  let owner;
  let seller;
  let bidder1;
  let bidder2;
  let bidder3;
  const initialDeposit = ethers.parseUnits("100", 18); // ERC20 token 押金
  const nftTokenId = 1;
  const startingPrice = ethers.parseUnits("100", 18); // 起拍价
  const reservePrice = ethers.parseUnits("50", 18);  // 保留价
  const auctionDuration = 3600; // 1 小时

  beforeEach(async function () {
    [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();

    // 部署 ERC20 token 合约
    const MyERC20 = await ethers.getContractFactory("MyERC20");
    myERC20Token = await MyERC20.deploy(owner.address);
    await myERC20Token.waitForDeployment();

    // 部署 NFT 合约
    const MyNFT = await ethers.getContractFactory("MyNFT");
    myNFT = await MyNFT.deploy(owner.address);
    await myNFT.waitForDeployment();

    console.log("MyERC20 Address:", await myERC20Token.getAddress());
    console.log("MyNFT Address:", await myNFT.getAddress());

    // 给参与者分配一些 ERC20 token 和 NFT
    await myERC20Token.transfer(bidder1.address, ethers.parseUnits("1500", 18));
    await myERC20Token.transfer(bidder2.address, ethers.parseUnits("1500", 18));
    await myERC20Token.transfer(bidder3.address, ethers.parseUnits("1500", 18));
    await myNFT.mint(seller.address, nftTokenId); // 销售者铸造NFT

    // 部署升级版的 AuctionManager 合约
    const AuctionManager = await ethers.getContractFactory("AuctionManager");
    const myERC20TokenAddress = await myERC20Token.getAddress();
    auctionManager = await upgrades.deployProxy(AuctionManager, [owner.address, myERC20TokenAddress], { initializer: "initialize" });
    await auctionManager.waitForDeployment();
  });

  it("should create an auction", async function () {
    // 创建拍卖
    const myNFTaddress = await myNFT.getAddress();
    await auctionManager.connect(seller).createEnglishAuction(
      startingPrice, // startingPrice
      reservePrice,  // reservePrice
      auctionDuration, // duration
      myNFTaddress, // nftContract
      nftTokenId // tokenId
    );

    const auction = await auctionManager.auctions(1);
    expect(auction.auctionStatus).to.equal(0); // 初始状态是 Registration
    expect(auction.seller).to.equal(seller.address);
    expect(auction.englishAuction.startingPrice).to.equal(startingPrice);
  });

  it("should allow participants to deposit tokens", async function () {
    // 创建拍卖
    await auctionManager.createEnglishAuction(
      startingPrice, 
      reservePrice,  
      auctionDuration, 
      await myNFT.getAddress(), 
      nftTokenId 
    );
    const auctionManagerAddress = await auctionManager.getAddress();

    // bidder1 授权 ERC20 token
    await myERC20Token.connect(bidder1).approve(auctionManagerAddress, initialDeposit);
    await auctionManager.connect(bidder1).deposit(1);

    // bidder2 授权 ERC20 token
    await myERC20Token.connect(bidder2).approve(auctionManagerAddress, initialDeposit);
    await auctionManager.connect(bidder2).deposit(1);

    // bidder3 授权 ERC20 token
    await myERC20Token.connect(bidder3).approve(auctionManagerAddress, initialDeposit);
    await auctionManager.connect(bidder3).deposit(1);

    const auction = await auctionManager.auctions(1);

    console.log(`Auction data:`, bidder1.address);
    const hasBidder1Deposited = await auctionManager.hasDeposited(1, bidder1.address);
    const hasBidder2Deposited = await auctionManager.hasDeposited(1, bidder2.address);
    const hasBidder3Deposited = await auctionManager.hasDeposited(1, bidder3.address);

    expect(hasBidder1Deposited).to.be.true;
    expect(hasBidder2Deposited).to.be.true;
    expect(hasBidder3Deposited).to.be.true;
  });

  it("should allow participants to place bids", async function () {
    await auctionManager.connect(seller).createEnglishAuction(
      startingPrice, 
      reservePrice,  
      auctionDuration, 
      await myNFT.getAddress(), 
      nftTokenId
    );

    // bidder1 授权 ERC20 token
    await myERC20Token.connect(bidder1).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder1).deposit(1);

    // bidder2 授权 ERC20 token
    await myERC20Token.connect(bidder2).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder2).deposit(1);

    await auctionManager.connect(seller).startAuction(1);

    // bidder1 竞标
    const bidAmount1 = ethers.parseUnits("150", 18);
    await auctionManager.connect(bidder1).bid(1, bidAmount1);

    // bidder2 竞标
    const bidAmount2 = ethers.parseUnits("200", 18);
    await auctionManager.connect(bidder2).bid(1, bidAmount2);

    const auction = await auctionManager.auctions(1);
    expect(auction.englishAuction.currentBid).to.equal(bidAmount2);
    expect(auction.highestBidder).to.equal(bidder2.address);
  });

  it("should end the auction and transfer NFT and funds", async function () {

    // 授权 AuctionManager 合约可以转移卖家的 NFT
    await myNFT.connect(seller).approve(await auctionManager.getAddress(), nftTokenId);

    await auctionManager.connect(seller).createEnglishAuction(
      startingPrice, 
      reservePrice,  
      auctionDuration, 
      await myNFT.getAddress(), 
      nftTokenId
    );

    // bidder1 授权 ERC20 token
    await myERC20Token.connect(bidder1).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder1).deposit(1);

    // bidder2 授权 ERC20 token
    await myERC20Token.connect(bidder2).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder2).deposit(1);

    // 开始拍卖
    await auctionManager.connect(seller).startAuction(1);

    // bidder1 竞标
    const bidAmount1 = ethers.parseUnits("150", 18);
    await auctionManager.connect(bidder1).bid(1, bidAmount1);
    await myERC20Token.connect(bidder1).approve(await auctionManager.getAddress(), bidAmount1);

    // bidder2 竞标
    const bidAmount2 = ethers.parseUnits("200", 18);
    const balanceBidder2BeforeBid = await myERC20Token.balanceOf(bidder2.address);
    console.log(`Bidder2 Balance before bid: ${balanceBidder2BeforeBid.toString()}`);
    await auctionManager.connect(bidder2).bid(1, bidAmount2);
    await myERC20Token.connect(bidder2).approve(await auctionManager.getAddress(), bidAmount2);
    const allowanceBidder2 = await myERC20Token.allowance(bidder2.address, await auctionManager.getAddress());
    console.log(`Bidder2 approved ${allowanceBidder2.toString()} tokens for bidding`);

    console.log("seller: " + seller.address);
    console.log("bidder1: " + bidder1.address);
    console.log("bidder2: " + bidder2.address);
    console.log("auctionManager: " + await auctionManager.getAddress());
    console.log("owner: " + owner.address);
    

    // 结束拍卖
    await auctionManager.endAuction(1);

    const auction = await auctionManager.auctions(1);
    expect(auction.auctionStatus).to.equal(2); // 结束状态是 Ended
    expect(auction.isPaymentTransferred).to.be.true;
    expect(auction.isNFTTransferred).to.be.true;
  });

  it("should refund deposits for non-winning participants", async function () {
    // 授权 AuctionManager 合约可以转移卖家的 NFT
    await myNFT.connect(seller).approve(await auctionManager.getAddress(), nftTokenId);
    await auctionManager.connect(seller).createEnglishAuction(
      startingPrice, 
      reservePrice,  
      auctionDuration, 
      await myNFT.getAddress(), 
      nftTokenId
    );

    // bidder1 授权 ERC20 token
    await myERC20Token.connect(bidder1).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder1).deposit(1);

    // bidder2 授权 ERC20 token
    await myERC20Token.connect(bidder2).approve(await auctionManager.getAddress(), initialDeposit);
    await auctionManager.connect(bidder2).deposit(1);


    // 开始拍卖
    await auctionManager.connect(seller).startAuction(1);

    // bidder1 竞标
    const bidAmount1 = ethers.parseUnits("150", 18);
    await auctionManager.connect(bidder1).bid(1, bidAmount1);
    await myERC20Token.connect(bidder1).approve(await auctionManager.getAddress(), bidAmount1);

    // bidder2 竞标
    const bidAmount2 = ethers.parseUnits("200", 18);
    const balanceBidder2BeforeBid = await myERC20Token.balanceOf(bidder2.address);
    console.log(`Bidder2 Balance before bid: ${balanceBidder2BeforeBid.toString()}`);
    await auctionManager.connect(bidder2).bid(1, bidAmount2);
    await myERC20Token.connect(bidder2).approve(await auctionManager.getAddress(), bidAmount2);
    const allowanceBidder2 = await myERC20Token.allowance(bidder2.address, await auctionManager.getAddress());
    console.log(`Bidder2 approved ${allowanceBidder2.toString()} tokens for bidding`);

    console.log("seller: " + seller.address);
    console.log("bidder1: " + bidder1.address);
    console.log("bidder2: " + bidder2.address);
    console.log("auctionManager: " + await auctionManager.getAddress());
    console.log("owner: " + owner.address);

    // 结束拍卖
    await auctionManager.endAuction(1);

    // bidder1 退还押金
    await expect(auctionManager.connect(bidder1).refundDeposit(1))
      .to.emit(auctionManager, "DepositRefunded")
      .withArgs(bidder1.address, 1);

    // bidder2 退还押金
    await expect(auctionManager.connect(bidder2).refundDeposit(1))
      .to.emit(auctionManager, "DepositRefunded")
      .withArgs(bidder2.address, 1);
  });
});
