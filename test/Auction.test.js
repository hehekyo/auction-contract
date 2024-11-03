const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

describe("Auction Contract Logic Test", function () {
    let owner, addr1, addr2, addr3;
    let myNFT, myERC20, auctionFactory, auction;

    before(async () => {
        // 获取合约的工厂
        const MyNFT = await ethers.getContractFactory("MyNFT");
        const MyERC20 = await ethers.getContractFactory("MyERC20");
        const AuctionFactory = await ethers.getContractFactory("AuctionFactory");

        // 获取账户
        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        console.log("owner:", owner.address); // 打印地址

        // 部署 ERC20 代币合约
        myERC20 = await MyERC20.deploy(owner.address);
        await myERC20.waitForDeployment();
        console.log("ERC20 deployed at:", myERC20.target); // 打印地址

        // 部署 NFT 合约
        myNFT = await MyNFT.deploy(owner.address);
        await myNFT.waitForDeployment();
        console.log("NFT deployed at:", myNFT.target); // 打印地址

        // 为参与者铸造 NFT
        await myNFT.mint(owner.address, 1); // 铸造 NFT ID 1 给 owner
        await myNFT.mint(owner.address, 2); // 铸造 NFT ID 2 给 owner

        // 给每个参与者一些 ERC20 代币
        await myERC20.mint(addr1.address, ethers.parseEther("100"));
        await myERC20.mint(addr2.address, ethers.parseEther("100"));
        await myERC20.mint(addr3.address, ethers.parseEther("100"));

        // 部署拍卖工厂合约
        auctionFactory = await upgrades.deployProxy(AuctionFactory, [owner.address], { initializer: "initialize" });
        await auctionFactory.waitForDeployment();
    });

    /*
            address _seller,
        uint _startingPrice,
        uint _endPrice,
        uint _duration,
        uint _priceDecrement,
        uint _decrementInterval,
        address _depositToken,
        uint _depositAmount,
        address _nftContract,
        uint256 _tokenId
    */

    it("Should create an auction", async () => {
        console.log("myERC20 address:", myERC20.target);
        console.log("myNFT address:", myNFT.target);
        console.log("owner address:", owner.address);

        await myERC20.approve(auctionFactory.target, ethers.parseEther("10")); // 授权支付押金

        console.log("123");
        await auctionFactory.connect(owner).createAuction(
            ethers.parseEther("10"),  // 起始价格
            ethers.parseEther("0"),   // 结束价格
            3600,                            // 持续时间（1小时）
            ethers.parseEther("1"),   // 每次降价幅度
            60,                              // 降价间隔（60秒）
            myERC20.target,                // 押金代币地址
            ethers.parseEther("10"),  // 押金金额
            myNFT.target,                  // NFT 合约地址
            1                                // NFT tokenId
        );

        const auctions = await auctionFactory.getAuctions();
        console.log(auctions.length);
        expect(auctions.length).to.equal(1);
    });

    it("Should allow participants to pay deposit", async () => {
        await myERC20.connect(addr1).approve(auction.address, ethers.parseEther("10"));
        await myERC20.connect(addr1).transfer(auction.address, ethers.parseEther("10")); // 支付押金
        expect(await auction.hasDeposited(addr1.address)).to.be.true;
        
        await myERC20.connect(addr2).approve(auction.address, ethers.parseEther("10"));
        await myERC20.connect(addr2).transfer(auction.address, ethers.parseEther("10")); // 支付押金
        expect(await auction.hasDeposited(addr2.address)).to.be.true;

        await myERC20.connect(addr3).approve(auction.address, ethers.parseEther("10"));
        await myERC20.connect(addr3).transfer(auction.address, ethers.parseEther("10")); // 支付押金
        expect(await auction.hasDeposited(addr3.address)).to.be.true;
    });

    it("Should start the auction", async () => {
        auction = await auctionFactory.auctions(0); // 获取拍卖合约地址
        await auction.startAuction();
        expect(await auction.started()).to.be.true;
    });

    it("Should allow bidding", async () => {
        await ethers.provider.send("evm_increaseTime", [60]); // 增加时间以便价格递减
        await ethers.provider.send("evm_mine"); // 确保块被挖掘
        
        await auction.connect(addr1).bid(); // addr1 竞拍

        // 检查拍卖结束
        expect(await auction.ended()).to.be.true;
        expect(await myNFT.ownerOf(1)).to.equal(addr1.address);
    });

    it("Should refund deposits", async () => {
        // addr2 和 addr3 应该能取回押金
        expect(await myERC20.balanceOf(addr2.address)).to.equal(ethers.parseEther("100"));
        await auction.connect(addr2).claimRefund(); // addr2 取回押金
        expect(await myERC20.balanceOf(addr2.address)).to.equal(ethers.parseEther("110"));

        expect(await myERC20.balanceOf(addr3.address)).to.equal(ethers.parseEther("100"));
        await auction.connect(addr3).claimRefund(); // addr3 取回押金
        expect(await myERC20.balanceOf(addr3.address)).to.equal(ethers.parseEther("110"));
    });

    it("Should check ERC20 balances after bidding", async () => {
        // 检查 addr1 是否支付了代币
        expect(await myERC20.balanceOf(addr1.address)).to.equal(ethers.parseEther("90")); // 10 代币已支付
        expect(await myERC20.balanceOf(owner.address)).to.equal(ethers.parseEther("10")); // owner 收到的代币
    });
});
