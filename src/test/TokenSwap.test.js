const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("TokenSwap", function () {
    async function deployTokenSwapFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy DAToken
        const DAToken = await ethers.getContractFactory("DAToken");
        const daToken = await DAToken.deploy(
            owner.address,
            ethers.parseEther("1000000") // 1 million tokens
        );
        await daToken.waitForDeployment();
        const daTokenAddress = await daToken.getAddress();

        // Deploy mock ETH/USD price feed
        const MockPriceFeed = await ethers.getContractFactory("MockV3Aggregator");
        const mockPriceFeed = await MockPriceFeed.deploy(
            8, // decimals
            200000000000 // 2000 USD (8 decimals)
        );
        await mockPriceFeed.waitForDeployment();
        const mockPriceFeedAddress = await mockPriceFeed.getAddress();

        // Deploy TokenSwap
        const TokenSwap = await ethers.getContractFactory("TokenSwap");
        const tokenSwap = await TokenSwap.deploy(
            daTokenAddress,
            mockPriceFeedAddress,
            100, // 1 USD = 100 cents
            100  // 1% slippage tolerance
        );
        await tokenSwap.waitForDeployment();
        const tokenSwapAddress = await tokenSwap.getAddress();

        // Transfer 100 ETH to TokenSwap
        await ethers.provider.send("hardhat_setBalance", [
            tokenSwapAddress,
            ethers.toBeHex(ethers.parseEther("100"))
        ]);

        // Transfer 10 ETH to addr1
        await ethers.provider.send("hardhat_setBalance", [
            addr1.address,
            ethers.toBeHex(ethers.parseEther("10"))
        ]);

        // Transfer DATokens to TokenSwap as liquidity
        await daToken.transfer(
            tokenSwapAddress,
            ethers.parseEther("500000") // 500k DAToken as liquidity
        );

        // Transfer DATokens to test account
        await daToken.transfer(
            addr1.address,
            ethers.parseEther("1000")
        );

        return { tokenSwap, daToken, mockPriceFeed, owner, addr1, addr2 };
    }

    describe("Deployment", function () {
        it("Should set the initial state correctly", async function () {
            const { tokenSwap, daToken, mockPriceFeed, addr1, owner } = await loadFixture(deployTokenSwapFixture);
            
            expect(await tokenSwap.daToken()).to.equal(await daToken.getAddress());
            expect(await tokenSwap.ethPriceFeed()).to.equal(await mockPriceFeed.getAddress());
            expect(await tokenSwap.daTokenPrice()).to.equal(100);
            expect(await tokenSwap.slippageTolerance()).to.equal(100);
            
            // DAToken liquidity
            expect(await daToken.balanceOf(await tokenSwap.getAddress())).to.equal(ethers.parseEther("500000"));
            
            console.log("=== Initial State ===");
            
            // TokenSwap ETH balance
            console.log("tokenSwap ETH balance:", ethers.formatEther(await ethers.provider.getBalance(await tokenSwap.getAddress())), "ETH");
            
            // TokenSwap token balance
            console.log("tokenSwap token balance:", ethers.formatEther(await daToken.balanceOf(await tokenSwap.getAddress())), "DAToken");

            // addr1 ETH balance
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            
            // addr1 token balance
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");

            expect(await ethers.provider.getBalance(addr1.address)).to.be.closeTo(
                ethers.parseEther("10"),
                ethers.parseEther("0.1") // allowed error range
            );
        });
    });

    describe("Token Exchange", function () {
        it("Should be able to buy DAToken with ETH", async function () {
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

        it("Should be able to sell DAToken for ETH", async function () {
            const { tokenSwap, daToken, addr1 } = await loadFixture(deployTokenSwapFixture);
        
            const tokenAmount = ethers.parseEther("1000");
            await daToken.connect(addr1).approve(await tokenSwap.getAddress(), tokenAmount);
            
            console.log("=== Before sellTokens ===");
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
            
            await tokenSwap.connect(addr1).sellTokens(tokenAmount);
            
            console.log("=== After sellTokens ===");
            console.log("addr1 ETH balance:", ethers.formatEther(await ethers.provider.getBalance(addr1.address)), "ETH");
            console.log("addr1 token balance:", ethers.formatEther(await daToken.balanceOf(addr1.address)), "DAToken");
        });
    });

    describe("Management Functions", function () {
        it("Should be able to update DAToken price", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await tokenSwap.connect(owner).updateDaTokenPrice(150);
            expect(await tokenSwap.daTokenPrice()).to.equal(150);
        });

        it("Should be able to update slippage tolerance", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await tokenSwap.connect(owner).updateSlippageTolerance(200);
            expect(await tokenSwap.slippageTolerance()).to.equal(200);
        });

        it("Should be able to execute emergency withdrawal", async function () {
            const { tokenSwap, daToken, owner } = await loadFixture(deployTokenSwapFixture);
            
            const initialBalance = await daToken.balanceOf(owner.address);
            await tokenSwap.connect(owner).emergencyWithdraw();
            const finalBalance = await daToken.balanceOf(owner.address);
            
            expect(finalBalance).to.be.gt(initialBalance);
        });
    });

    describe("Error Handling", function () {
        it("Non-owner should not be able to update price", async function () {
            const { tokenSwap, addr1 } = await loadFixture(deployTokenSwapFixture);
            
            await expect(
                tokenSwap.connect(addr1).updateDaTokenPrice(150)
            ).to.be.revertedWithCustomError(tokenSwap, "OwnableUnauthorizedAccount");
        });

        it("Should not allow setting too high slippage tolerance", async function () {
            const { tokenSwap, owner } = await loadFixture(deployTokenSwapFixture);
            
            await expect(
                tokenSwap.connect(owner).updateSlippageTolerance(1001)
            ).to.be.revertedWith("Tolerance too high");
        });
    });
}); 