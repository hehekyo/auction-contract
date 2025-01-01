const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SwapRouter", function () {
    let SwapRouter, SwapFactory, WETH, DAToken;
    let swapRouter, swapFactory, weth, daToken;
    let owner, addr1, addr2;
    let deadline;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // 部署 WETH
        WETH = await ethers.getContractFactory("WETH");
        weth = await WETH.deploy();

        // 部署 DAToken
        const DATokenFactory = await ethers.getContractFactory("DAToken");
        daToken = await DATokenFactory.deploy(ethers.parseEther("1000000")); // 1,000,000 tokens

        // 部署工厂合约
        SwapFactory = await ethers.getContractFactory("SwapFactory");
        swapFactory = await SwapFactory.deploy();

        // 部署路由合约
        SwapRouter = await ethers.getContractFactory("SwapRouter");
        swapRouter = await SwapRouter.deploy(
            await swapFactory.getAddress(),
            await weth.getAddress(),
            await daToken.getAddress()
        );

        // 设置 deadline（当前时间 + 20分钟）
        deadline = (await time.latest()) + 1200;

        // 给测试账户转一些 DAToken
        await daToken.transfer(addr1.address, ethers.parseEther("10000"));
        await daToken.transfer(addr2.address, ethers.parseEther("10000"));

        // 创建流动性池
        await swapFactory.createPair(await daToken.getAddress(), await weth.getAddress());
    });

    describe("添加流动性", function () {
        it("应该能够添加 ETH 和代币的流动性", async function () {
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");
            const minTokenAmount = ethers.parseEther("90");
            const minEthAmount = ethers.parseEther("0.9");

            // 授权路由合约使用代币
            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);

            // 添加流动性
            await expect(
                swapRouter.addLiquidityWithETH(
                    await daToken.getAddress(),
                    tokenAmount,
                    minTokenAmount,
                    minEthAmount,
                    owner.address,
                    deadline,
                    { value: ethAmount }
                )
            ).to.emit(swapRouter, "LiquidityAdded");

            // 验证流动性池是否创建
            const pair = await swapFactory.getPair(
                await daToken.getAddress(),
                await weth.getAddress()
            );
            expect(pair).to.not.equal(ethers.constants.AddressZero);
        });

        it("不应该接受过期的 deadline", async function () {
            const expiredDeadline = (await time.latest()) - 1;
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");

            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);

            await expect(
                swapRouter.addLiquidityWithETH(
                    await daToken.getAddress(),
                    tokenAmount,
                    0,
                    0,
                    owner.address,
                    expiredDeadline,
                    { value: ethAmount }
                )
            ).to.be.revertedWith("DAuctionSwapRouter: EXPIRED");
        });
    });

    describe("移除流动性", function () {
        beforeEach(async function () {
            // 先添加流动性
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");

            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);
            await swapRouter.addLiquidityWithETH(
                await daToken.getAddress(),
                tokenAmount,
                0,
                0,
                owner.address,
                deadline,
                { value: ethAmount }
            );
        });

        it("应该能够移除 ETH 和代币的流动性", async function () {
            const pair = await swapFactory.getPair(
                await daToken.getAddress(),
                await weth.getAddress()
            );
            const pairContract = await ethers.getContractAt("ISwapPair", pair);
            const liquidity = await pairContract.balanceOf(owner.address);

            await pairContract.connect(owner).approve(swapRouter.getAddress(), liquidity);

            await expect(
                swapRouter.removeLiquidityWithETH(
                    await daToken.getAddress(),
                    liquidity,
                    0,
                    0,
                    owner.address,
                    deadline
                )
            ).to.not.be.reverted;
        });
    });

    describe("交换", function () {
        beforeEach(async function () {
            // 添加初始流动性
            const tokenAmount = ethers.parseEther("1000");
            const ethAmount = ethers.parseEther("10");

            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);
            await swapRouter.addLiquidityWithETH(
                await daToken.getAddress(),
                tokenAmount,
                0,
                0,
                owner.address,
                deadline,
                { value: ethAmount }
            );
        });

        it("应该能够用 ETH 换取代币", async function () {
            const swapAmount = ethers.parseEther("1");
            const path = [await weth.getAddress(), await daToken.getAddress()];

            await expect(
                swapRouter.swapExactETHForTokens(
                    0, // 最小获得的代币数量
                    path,
                    owner.address,
                    deadline,
                    { value: swapAmount }
                )
            ).to.not.be.reverted;
        });

        it("应该能够用代币换取 ETH", async function () {
            const swapAmount = ethers.parseEther("100");
            const path = [await daToken.getAddress(), await weth.getAddress()];

            await daToken.connect(owner).approve(swapRouter.getAddress(), swapAmount);

            await expect(
                swapRouter.swapExactTokensForETH(
                    swapAmount,
                    0, // 最小获得的 ETH 数量
                    path,
                    owner.address,
                    deadline
                )
            ).to.not.be.reverted;
        });
    });
}); 