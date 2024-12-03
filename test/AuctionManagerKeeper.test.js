const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuctionManager with DANFT and DAToken", function () {
  let DANFT, daNFT, DAToken, daToken, AuctionManager, auctionManager;
  let owner, user1, user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy DAToken
    DAToken = await ethers.getContractFactory("DAToken");
    daToken = await DAToken.deploy(owner.address, ethers.parseEther("1000000"));
    await daToken.waitForDeployment();

    // Deploy DANFT
    DANFT = await ethers.getContractFactory("DANFT");
    daNFT = await DANFT.deploy(owner.address);
    await daNFT.waitForDeployment();

    // Mint NFT to owner
    await daNFT.mint(owner.address, 1, "ipfs://example-image-uri");

    // Deploy AuctionManager
    AuctionManager = await ethers.getContractFactory("AuctionManager");
    auctionManager = await AuctionManager.deploy();
    await auctionManager.waitForDeployment();
    await auctionManager.initialize(owner.address, await daToken.getAddress());
  });

  it("Should initialize auction manager correctly", async function () {
    expect(await auctionManager.daToken()).to.equal(await daToken.getAddress());
  });

  it("Should allow starting an auction", async function () {
    const startingPrice = ethers.parseEther("10");
    const reservePrice = ethers.parseEther("5");
    const duration = 3600; // 1 hour
    const depositAmount = startingPrice * BigInt(10) / BigInt(100);

    // Approve NFT transfer
    await daNFT.connect(owner).setApprovalForAll(await auctionManager.getAddress(), true);

    // Start auction
    await expect(
      auctionManager.startAuction(
        0, // English Auction
        startingPrice,
        reservePrice,
        duration,
        await daNFT.getAddress(),
        1,
        0, // No price decrement
        0 // No decrement interval
      )
    )
    .to.emit(auctionManager, "AuctionStarted")
    .withArgs(
        1, // auctionId
        owner.address, // seller
        await daNFT.getAddress(), // nftContract
        1, // tokenId
        "ipfs://example-image-uri", // tokenURI
        0, // auctionType
        startingPrice, // startingPrice
        reservePrice, // reservePrice
        duration, // duration
        depositAmount,
        await ethers.provider.getBlock("latest").then((block) => block.timestamp), // startTime
        await ethers.provider.getBlock("latest").then((block) => block.timestamp + duration) // endTime
    );

    const auction = await auctionManager.auctions(1);
    expect(auction.seller).to.equal(owner.address);
    expect(auction.startingPrice).to.equal(startingPrice);
    expect(auction.reservePrice).to.equal(reservePrice);
  });

  it("Should allow bidding in an English auction", async function () {
    const startingPrice = ethers.parseEther("10");
    const reservePrice = ethers.parseEther("5");
    const duration = 3600; // 1 hour

    // Approve NFT transfer
    await daNFT.connect(owner).setApprovalForAll(await auctionManager.getAddress(), true);

    // Start auction
    await auctionManager.startAuction(
      0, // English Auction
      startingPrice,
      reservePrice,
      duration,
      await daNFT.getAddress(),
      1,
      0, // No price decrement
      0 // No decrement interval
    );

    // Approve and deposit DA Token
    await daToken.connect(user1).approve(await auctionManager.getAddress(), startingPrice);
    await auctionManager.connect(user1).deposit(1);

    // Place a bid
    await expect(auctionManager.connect(user1).bid(1, startingPrice))
      .to.emit(auctionManager, "BidPlaced")
      .withArgs(1, user1.address, startingPrice);

    const auction = await auctionManager.auctions(1);
    expect(auction.winner).to.equal(user1.address);
    expect(auction.currentBid).to.equal(startingPrice);
  });

  it("Should update price in a Dutch auction", async function () {
    const startingPrice = ethers.parseEther("10");
    const reservePrice = ethers.parseEther("5");
    const duration = 3600; // 1 hour
    const priceDecrement = ethers.parseEther("1");
    const decrementInterval = 600; // 10 minutes

    // Approve NFT transfer
    await daNFT.connect(owner).setApprovalForAll(await auctionManager.getAddress(), true);

    // Start Dutch auction
    await auctionManager.startAuction(
      1, // Dutch Auction
      startingPrice,
      reservePrice,
      duration,
      await daNFT.getAddress(),
      1,
      priceDecrement,
      decrementInterval
    );

    // Simulate passage of time
    await ethers.provider.send("evm_increaseTime", [decrementInterval]);
    await ethers.provider.send("evm_mine");

    // Trigger upkeep
    const checkData = ethers.defaultAbiCoder.encode([], []);
    const { upkeepNeeded } = await auctionManager.checkUpkeep(checkData);
    expect(upkeepNeeded).to.be.true;

    await expect(auctionManager.performUpkeep([]))
      .to.emit(auctionManager, "DutchAuctionPriceUpdated");

    const auction = await auctionManager.auctions(1);
    expect(auction.currentPrice).to.equal(startingPrice.sub(priceDecrement));
  });
});
