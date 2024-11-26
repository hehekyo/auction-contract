const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");


describe("TokenSwap", function () {
    async function deployTokenSwapFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();


        // 部署 DAToken
        const DAToken = await ethers.getContractFactory("DAToken");
        const daToken = await DAToken.deploy(
            owner.address,
            ethers.parseEther("1000000") // 100万代币
        );
        await daToken.waitForDeployment();
        const daTokenAddress = await daToken.getAddress();

        // 部署模拟的 ETH/USD 价格预言机
        const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");
        const mockPriceFeed = await MockPriceFeed.deploy(
            8, // 精度
            200000000000 // 2000 USD (8位精度)
        );
        await mockPriceFeed.waitForDeployment();
        const mockPriceFeedAddress = await mockPriceFeed.getAddress();

        // 部署 TokenSwap
        const TokenSwap = await ethers.getContractFactory("TokenSwap");
        const tokenSwap = await TokenSwap.deploy(
            daTokenAddress,
            mockPriceFeedAddress,
            100, // 1 USD = 100 cents
            100  // 1% 滑点容忍度
        );
        await tokenSwap.waitForDeployment();
        const tokenSwapAddress = await tokenSwap.getAddress();

        // 向 tokenSwap 转入 100 ETH
        await ethers.provider.send("hardhat_setBalance", [
            tokenSwapAddress,
            ethers.toBeHex(ethers.parseEther("100"))
        ]);

        // 向 addr1 转入 10 ETH
        await ethers.provider.send("hardhat_setBalance", [
            addr1.address,
            ethers.toBeHex(ethers.parseEther("10"))
        ]);

        // 向 TokenSwap 转入一些 DAToken 作为流动性
        await daToken.transfer(
            tokenSwapAddress,
            ethers.parseEther("500000") // 转入 50万 DAToken 作为流动性
        );

        // 向测试账户转入一些 DAToken
        await daToken.transfer(
            addr1.address,
            ethers.parseEther("1000")
        );

        return { 
            tokenSwap, 
            daToken, 
            mockPriceFeed, 
            owner, 
            addr1, 
            addr2 
        };
    }

    describe("部署", function () {
        it("��该正确设置初始状态", async function () {
            const { tokenSwap, daToken, mockPriceFeed, addr1, owner } = await loadFixture(deployTokenSwapFixture);
            
            expect(await tokenSwap.daToken()).to.equal(await daToken.getAddress());
            expect(await tokenSwap.ethPriceFeed()).to.equal(await mockPriceFeed.getAddress());
            expect(await tokenSwap.daTokenPrice()).to.equal(100);
            expect(await tokenSwap.slippageTolerance()).to.equal(100);
            // daToken 的流动性
            expect(await daToken.balanceOf(await tokenSwap.getAddress())).to.equal(ethers.parseEther("500000"));
            
            console.log("===initial state===");
            
            // tokenSwap 以太坊余额 (ETH)
            console.log("tokenSwap ETH balance:", ethers.formatEther(await ethers.provider.getBalance(await tokenSwap.getAddress())), "ETH");
            
            // tokenSwap 代币余额 (Token)
            console.log("tokenSwap token balance:", ethers.formatEther(await daToken.balanceOf(await tokenSwap.getAddress())), "DAToken");

            // addr1 以太坊余额 (ETH)
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            
            // addr1 代币余额 (Token)
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");

            // 使用 closeTo 来检查余额，允许有 0.1 ETH 的误差范围
            // expect(await ethers.provider.getBalance(addr1.address)).to.be.closeTo(
            //     ethers.parseEther("10"),
            //     ethers.parseEther("0.1") // 允许的误差范围
            // );
            // expect(await ethers.provider.getBalance(owner.address)).to.be.closeTo(
            //     ethers.parseEther("100"),
            //     ethers.parseEther("0.1") // 允许的误差范围
            // );
        });
    });

    describe("代币兑换", function () {
        it("应该能用 ETH 购买 DAToken", async function () {
            const { tokenSwap, daToken, addr1 } = await loadFixture(deployTokenSwapFixture);
            
            const ethAmount = ethers.parseEther("1");
            
            console.log("=== Before buyTokens ===");
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
            
            await tokenSwap.connect(addr1).buyTokens({ value: ethAmount });
            
            console.log("=== After buyTokens ===");
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
        });

        it("应该能用 DAToken 换回 ETH", async function () {
            const { tokenSwap, daToken, addr1, owner } = await loadFixture(deployTokenSwapFixture);
            
            await owner.sendTransaction({
                to: await tokenSwap.getAddress(),
                value: ethers.parseEther("1")
            });
            
            const tokenAmount = ethers.parseEther("100");
            await daToken.connect(addr1).approve(tokenSwap.getAddress(), tokenAmount);
            
            const initialBalance = await ethers.provider.getBalance(addr1.address);
            await tokenSwap.connect(addr1).sellTokens(tokenAmount);
            
            const finalBalance = await ethers.provider.getBalance(addr1.address);
            expect(finalBalance).to.be.gt(initialBalance);

             console.log("===sellTokens===");
              // tokenSwap 以太坊余额 (ETH)
              console.log("tokenSwap ETH balance:", ethers.formatEther(await ethers.provider.getBalance(await tokenSwap.getAddress())), "ETH");
            
              // tokenSwap 代币余额 (Token)
              console.log("tokenSwap token balance:", ethers.formatEther(await daToken.balanceOf(await tokenSwap.getAddress())), "DAToken");
  
              // addr1 以太坊余额 (ETH)
              console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
              
              // addr1 代币余额 (Token)
              console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
 
        });
    });

    describe("管理功能", function () {
        it("应该能更新 DAToken 价格", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await tokenSwap.connect(owner).updateDaTokenPrice(150);
            expect(await tokenSwap.daTokenPrice()).to.equal(150);
        });

        it("应该能更新滑点容忍度", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await tokenSwap.connect(owner).updateSlippageTolerance(200);
            expect(await tokenSwap.slippageTolerance()).to.equal(200);
        });

        it("应该能执行紧急提取", async function () {
            const { tokenSwap, daToken, owner } = await loadFixture(deployTokenSwapFixture);
            
            const initialBalance = await daToken.balanceOf(owner.address);
            await tokenSwap.connect(owner).emergencyWithdraw();
            const finalBalance = await daToken.balanceOf(owner.address);
            
            expect(finalBalance).to.be.gt(initialBalance);
        });
    });

    describe("错误处理", function () {
        it("非管理员不能更新价格", async function () {
            const { tokenSwap, addr1 } = await loadFixture(deployTokenSwapFixture);
            
            await expect(
                tokenSwap.connect(addr1).updateDaTokenPrice(150)
            ).to.be.revertedWithCustomError(tokenSwap, "OwnableUnauthorizedAccount");
        });

        it("不能设置过高的滑点容忍度", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await expect(
                tokenSwap.connect(owner).updateSlippageTolerance(1001)
            ).to.be.revertedWith("Tolerance too high");
        });
    });
}); 