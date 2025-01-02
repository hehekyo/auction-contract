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
        await weth.waitForDeployment();

        // 部署 DAToken
        DAToken = await ethers.getContractFactory("DAToken");
        daToken = await DAToken.deploy(ethers.parseEther("1000000"));
        await daToken.waitForDeployment();

        // 部署工厂合约
        SwapFactory = await ethers.getContractFactory("SwapFactory");
        swapFactory = await SwapFactory.deploy(owner.address);
        await swapFactory.waitForDeployment();

        // 部署路由合约
        SwapRouter = await ethers.getContractFactory("SwapRouter");
        swapRouter = await SwapRouter.deploy(
            await swapFactory.getAddress(),
            await weth.getAddress()
        );
        await swapRouter.waitForDeployment();

        // 创建流动性池
        await swapFactory.createPair(
            await daToken.getAddress(),
            await weth.getAddress()
        );

        // 验证流动性池是否创建成功
        const pair = await swapFactory.getPair(
            await daToken.getAddress(),
            await weth.getAddress()
        );
        expect(pair).to.not.equal(ethers.constants.AddressZero);

        deadline = (await time.latest()) + 1200;

        await daToken.transfer(addr1.address, ethers.parseEther("10000"));
        await daToken.transfer(addr2.address, ethers.parseEther("10000"));
    });

    describe("添加流动性", function () {
        it("应该能够添加 ETH 和代币的流动性", async function () {
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");
            const minTokenAmount = ethers.parseEther("90");
            const minEthAmount = ethers.parseEther("0.9");

            await daToken.approve(await swapRouter.getAddress(), tokenAmount);

            await expect(
                swapRouter.addLiquidityETH(
                    await daToken.getAddress(),
                    tokenAmount,
                    minTokenAmount,
                    minEthAmount,
                    owner.address,
                    deadline,
                    { value: ethAmount }
                )
            ).to.not.be.reverted;
        });

        it("不应该接受过期的 deadline", async function () {
            const expiredDeadline = (await time.latest()) - 1;
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");

            await daToken.approve(await swapRouter.getAddress(), tokenAmount);

            await expect(
                swapRouter.addLiquidityETH(
                    await daToken.getAddress(),
                    tokenAmount,
                    0,
                    0,
                    owner.address,
                    expiredDeadline,
                    { value: ethAmount }
                )
            ).to.be.revertedWith("SwapRouter: EXPIRED");
        });
    });

    describe("删除流动性", function () {
        let pair;
        let liquidityAmount;

        beforeEach(async function () {
            // 先添加流动性
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");
            
            await daToken.approve(await swapRouter.getAddress(), tokenAmount);
            
            const tx = await swapRouter.addLiquidityETH(
                await daToken.getAddress(),
                tokenAmount,
                0,
                0,
                owner.address,
                deadline,
                { value: ethAmount }
            );
            
            // 获取流动性池地址
            pair = await swapFactory.getPair(await daToken.getAddress(), await weth.getAddress());
            const pairContract = await ethers.getContractAt("ISwapPair", pair);
            liquidityAmount = await pairContract.balanceOf(owner.address);
        });

        it("应该能够移除 ETH 和代币的流动性", async function () {
            const pairContract = await ethers.getContractAt("ISwapPair", pair);
            await pairContract.approve(await swapRouter.getAddress(), liquidityAmount);

            await expect(
                swapRouter.removeLiquidityETH(
                    await daToken.getAddress(),
                    liquidityAmount,
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
            
            await daToken.approve(await swapRouter.getAddress(), tokenAmount);
            
            await swapRouter.addLiquidityETH(
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
            const expectedTokenAmount = await swapRouter.getAmountOut(
                swapAmount,
                await weth.getAddress(),
                await daToken.getAddress()
            );

            await expect(
                swapRouter.swapExactETHForTokens(
                    expectedTokenAmount,
                    [await weth.getAddress(), await daToken.getAddress()],
                    owner.address,
                    deadline,
                    { value: swapAmount }
                )
            ).to.not.be.reverted;
        });

        it("应该能够用代币换取 ETH", async function () {
            const swapAmount = ethers.parseEther("100");
            const expectedEthAmount = await swapRouter.getAmountOut(
                swapAmount,
                await daToken.getAddress(),
                await weth.getAddress()
            );

            await daToken.approve(await swapRouter.getAddress(), swapAmount);

            await expect(
                swapRouter.swapExactTokensForETH(
                    swapAmount,
                    expectedEthAmount,
                    [await daToken.getAddress(), await weth.getAddress()],
                    owner.address,
                    deadline
                )
            ).to.not.be.reverted;
        });

        it("应该能够用代币换取代币", async function () {
            // 部署另一个测试代币
            const TestToken = await ethers.getContractFactory("DAToken");
            const testToken = await TestToken.deploy(ethers.parseEther("1000000"));
            await testToken.waitForDeployment();

            // 为测试代币添加流动性
            const testTokenAmount = ethers.parseEther("1000");
            const ethAmount = ethers.parseEther("10");
            
            await testToken.approve(await swapRouter.getAddress(), testTokenAmount);
            
            await swapRouter.addLiquidityETH(
                await testToken.getAddress(),
                testTokenAmount,
                0,
                0,
                owner.address,
                deadline,
                { value: ethAmount }
            );

            // 执行代币到代币的交换
            const swapAmount = ethers.parseEther("100");
            await daToken.approve(await swapRouter.getAddress(), swapAmount);

            await expect(
                swapRouter.swapExactTokensForTokens(
                    swapAmount,
                    0,
                    [await daToken.getAddress(), await weth.getAddress(), await testToken.getAddress()],
                    owner.address,
                    deadline
                )
            ).to.not.be.reverted;
        });
    });
}); 