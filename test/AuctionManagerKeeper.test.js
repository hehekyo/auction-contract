const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuctionManager with DANFT and DAToken", function () {
  let DANFT, daNFT, DAToken, daToken, AuctionManager, auctionManager;
  let owner, user1, user2, user3;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

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

    // Start auction and get the emitted event
    const tx = await auctionManager.startAuction(
        0, // English Auction
        startingPrice,
        reservePrice,
        duration,
        await daNFT.getAddress(),
        1,
        0, // No price decrement
        0 // No decrement interval
    );

    const receipt = await tx.wait();
    //console.log("Transaction Logs:", receipt.logs); // 直接查看原始日志

    // 找到 AuctionStarted 的日志
    const auctionStartedLog = receipt.logs.find(
        log => log.fragment?.name === "AuctionStarted"
    );

    if (auctionStartedLog) {
        const { args } = auctionStartedLog;
        //console.log("AuctionStarted Event Arguments:", args);

        // 验证事件内容
        expect(args[0]).to.equal(1n); // auctionId
        expect(args[1]).to.equal(owner.address); // seller
        expect(args[2]).to.equal(await daNFT.getAddress()); // nftContract
        expect(args[3]).to.equal(1n); // tokenId
        expect(args[4]).to.equal("ipfs://example-image-uri"); // tokenURI
        expect(args[5]).to.equal(0n); // auctionType
        expect(args[6]).to.equal(startingPrice); // startingPrice
        expect(args[7]).to.equal(reservePrice); // reservePrice
        expect(args[8]).to.equal(duration); // duration
        expect(args[9]).to.equal(depositAmount); // depositAmount
        // 检查时间戳
        const startTime = args[10];
        const endTime = args[11];
        const latestBlock = await ethers.provider.getBlock("latest");
        expect(startTime).to.equal(BigInt(latestBlock.timestamp));
        expect(endTime).to.equal(BigInt(latestBlock.timestamp) + BigInt(duration));
    } else {
        throw new Error("AuctionStarted event not found");
    }
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
    await daToken.connect(owner).mint(user1, ethers.parseEther("10000000"));
    await daToken.connect(user1).approve(await auctionManager.getAddress(), ethers.parseEther("11") );
    await auctionManager.connect(user1).deposit(1);

    console.log("balance(user1)" + await daToken.balanceOf(user1));
    console.log("allowance(user1)" + await daToken.allowance(user1, await auctionManager.getAddress()));
    const latestBlock = await ethers.provider.getBlock("latest");
    // Place a bid
    await expect(auctionManager.connect(user1).bid(1, startingPrice))
      .to.emit(auctionManager, "BidPlaced")
      .withArgs(1, user1.address, startingPrice, latestBlock.timestamp + 1);

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

    const AbiCoder = new ethers.AbiCoder()
    // Trigger upkeep
    const checkData = AbiCoder.encode([], []);
    const tx = await auctionManager.checkUpkeep(checkData);
    const receipt = await tx.wait();
    //console.log("receipt log: ", receipt.logs);
    var upkeepNeeded;
    receipt.logs.forEach((log) => {
        if (log.fragment && log.fragment.name === "CheckUpkeepResult") {
            upkeepNeeded = log.args[0]; // 获取第一个参数
            console.log("CheckUpkeepResult - First argument (upkeepNeeded):", upkeepNeeded);
        }
    });

    expect(upkeepNeeded).to.be.true;

    const performData = AbiCoder.encode([], []);
    await expect(auctionManager.performUpkeep(performData))
      .to.emit(auctionManager, "DutchAuctionPriceUpdated");

    const auction = await auctionManager.auctions(1);
    expect(auction.currentPrice).to.equal(startingPrice - priceDecrement);
  });

  it("Should handle multiple bids and complete an English auction correctly with deposit", async function () {
      const startingPrice = ethers.parseEther("10");
      const reservePrice = ethers.parseEther("5");
      const duration = 3600; // 1 hour

      // Approve NFT transfer
      await daNFT.connect(owner).setApprovalForAll(await auctionManager.getAddress(), true);

      // Start English auction
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

      // Approve and deposit DA Token for bidders
      const depositAmount = (startingPrice * 10n) / 100n; // Assuming deposit is 10% of starting price

      await daToken.connect(owner).mint(user1, ethers.parseEther("100"));
      await daToken.connect(owner).mint(user2, ethers.parseEther("100"));
      await daToken.connect(owner).mint(user3, ethers.parseEther("100")); // Add a third bidder

      await daToken.connect(user1).approve(await auctionManager.getAddress(), depositAmount + ethers.parseEther("20"));
      await daToken.connect(user2).approve(await auctionManager.getAddress(), depositAmount + ethers.parseEther("20"));
      await daToken.connect(user3).approve(await auctionManager.getAddress(), depositAmount + ethers.parseEther("20"));

      await auctionManager.connect(user1).deposit(1);
      await auctionManager.connect(user2).deposit(1);
      await auctionManager.connect(user3).deposit(1);

      // Place bids
      await auctionManager.connect(user1).bid(1, ethers.parseEther("12"));
      await auctionManager.connect(user2).bid(1, ethers.parseEther("15"));
      await auctionManager.connect(user3).bid(1, ethers.parseEther("20")); // Third bidder

      // Check current highest bid and winner
      const auction = await auctionManager.auctions(1);
      expect(auction.winner).to.equal(user3.address);
      expect(auction.currentBid).to.equal(ethers.parseEther("20"));

      const AbiCoder = new ethers.AbiCoder()
      // Trigger upkeep
      const checkData = AbiCoder.encode([], []);
      const tx = await auctionManager.checkUpkeep(checkData);
      const receipt = await tx.wait();
      //console.log("receipt log: ", receipt.logs);
      var upkeepNeeded;
      receipt.logs.forEach((log) => {
          if (log.fragment && log.fragment.name === "CheckUpkeepResult") {
              upkeepNeeded = log.args[0]; // 获取第一个参数
              console.log("1 CheckUpkeepResult - First argument (upkeepNeeded):", upkeepNeeded);
          }
      });

      expect(upkeepNeeded).to.be.false;

      // Simulate end of auction
      await ethers.provider.send("evm_increaseTime", [duration]);
      await ethers.provider.send("evm_mine");

      // Trigger upkeep
      const tx2 = await auctionManager.checkUpkeep(checkData);
      const receipt2 = await tx2.wait();

      receipt2.logs.forEach((log) => {
          if (log.fragment && log.fragment.name === "CheckUpkeepResult") {
              upkeepNeeded = log.args[0]; // 获取第一个参数
              console.log("2 CheckUpkeepResult - First argument (upkeepNeeded):", upkeepNeeded);
          }
      });

      expect(upkeepNeeded).to.be.true;

      // Check and perform upkeep to finalize auction
      const performData = new ethers.AbiCoder().encode([], []);
      await auctionManager.performUpkeep(performData);

      // Validate NFT transfer and token settlement
      expect(await daNFT.ownerOf(1)).to.equal(user3.address);
      expect(await daToken.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000") + ethers.parseEther("20"));
  });

  it("Should complete a Dutch auction with deposit, price updates, and NFT transfer", async function () {
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

      // Deposit for user1
      const depositAmount = (startingPrice * 10n) / 100n; // 10% deposit
      await daToken.connect(owner).mint(user1, ethers.parseEther("100"));
      await daToken.connect(user1).approve(await auctionManager.getAddress(), depositAmount + ethers.parseEther("10"));
      await auctionManager.connect(user1).deposit(1);

      // Simulate time passing and upkeep calls
      for (let i = 0; i < 3; i++) {
          await ethers.provider.send("evm_increaseTime", [decrementInterval]);
          await ethers.provider.send("evm_mine");
          const AbiCoder = new ethers.AbiCoder()
          // Trigger upkeep
          const checkData = AbiCoder.encode([], []);
          const tx = await auctionManager.checkUpkeep(checkData);
          const receipt = await tx.wait();
          //console.log("receipt log: ", receipt.logs);
          var upkeepNeeded;
          receipt.logs.forEach((log) => {
              if (log.fragment && log.fragment.name === "CheckUpkeepResult") {
                  upkeepNeeded = log.args[0]; // 获取第一个参数
                  console.log(i);
                  console.log("Dutch test: CheckUpkeepResult - First argument (upkeepNeeded):", upkeepNeeded);
              }
          });
          await auctionManager.performUpkeep(new ethers.AbiCoder().encode([], []));
      }

      const auction = await auctionManager.auctions(1);
      expect(auction.currentPrice).to.equal(startingPrice - priceDecrement * 3n);

      // Bid at updated price
      const updatedPrice = auction.currentPrice;
      await daToken.connect(user1).approve(await auctionManager.getAddress(), updatedPrice);
      await auctionManager.connect(user1).bid(1, updatedPrice);

      const AbiCoder = new ethers.AbiCoder()
      // Trigger upkeep
      const checkData = AbiCoder.encode([], []);
      const tx = await auctionManager.checkUpkeep(checkData);
      const receipt = await tx.wait();
      //console.log("receipt log: ", receipt.logs);
      var upkeepNeeded;
      receipt.logs.forEach((log) => {
          if (log.fragment && log.fragment.name === "CheckUpkeepResult") {
              upkeepNeeded = log.args[0]; // 获取第一个参数
              console.log("final Dutch test: CheckUpkeepResult - First argument (upkeepNeeded):", upkeepNeeded);
          }
      });

      expect(upkeepNeeded).to.be.true;

      // Check and perform upkeep to finalize auction
      const performData = new ethers.AbiCoder().encode([], []);
      await expect(auctionManager.performUpkeep(performData)).to.be.revertedWith("Auction not ended");

      // Simulate end of auction
      await ethers.provider.send("evm_increaseTime", [duration]);
      await ethers.provider.send("evm_mine");

      // Perform upkeep to finalize auction
      await auctionManager.performUpkeep(new ethers.AbiCoder().encode([], []));

      // Validate NFT transfer and token settlement
      expect(await daNFT.ownerOf(1)).to.equal(user1.address);
      expect(await daToken.balanceOf(owner.address)).to.equal(updatedPrice + ethers.parseEther("1000000"));
  });


});
