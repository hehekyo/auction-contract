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

        console.log("部署合约...");

        // 部署 WETH
        WETH = await ethers.getContractFactory("WETH");
        weth = await WETH.deploy();
        await weth.waitForDeployment();
        console.log("WETH deployed to:", await weth.getAddress());

        // 部署 DAToken
        DAToken = await ethers.getContractFactory("DAToken");
        daToken = await DAToken.deploy(ethers.parseEther("1000000")); // 1,000,000 tokens
        await daToken.waitForDeployment();
        console.log("DAToken deployed to:", await daToken.getAddress());

        // 部署工厂合约
        SwapFactory = await ethers.getContractFactory("SwapFactory");
        swapFactory = await SwapFactory.deploy();
        await swapFactory.waitForDeployment();
        console.log("SwapFactory deployed to:", await swapFactory.getAddress());

        // 部署路由合约
        SwapRouter = await ethers.getContractFactory("SwapRouter");
        swapRouter = await SwapRouter.deploy(
            await swapFactory.getAddress(),
            await weth.getAddress()//,
            //await daToken.getAddress()
        );
        await swapRouter.waitForDeployment();
        console.log("SwapRouter deployed to:", await swapRouter.getAddress());

        // 设置 deadline（当前时间 + 20分钟）
        deadline = (await time.latest()) + 1200;

        // 给测试账户转一些 DAToken
        await daToken.transfer(addr1.address, ethers.parseEther("10000"));
        await daToken.transfer(addr2.address, ethers.parseEther("10000"));

        console.log("创建流动性池...");
        // 创建流动性池
        const createPairTx = await swapFactory.createPair(
            await daToken.getAddress(),
            await weth.getAddress()
        );
        await createPairTx.wait();

        // 验证流动性池是否创建成功
        const pair = await swapFactory.getPair(
            await daToken.getAddress(),
            await weth.getAddress()
        );
        console.log("流动性池地址:", pair);
        expect(pair).to.not.equal(ethers.ZeroAddress);
    });

    describe("SwapLibrary", function() {
        it("Should get init code hash", async function() {
            // 获取合约字节码
            const SwapPair = await ethers.getContractFactory("SwapPair");
            const initCode = SwapPair.bytecode;
            
            // 计算 init code hash
            const initCodeHash = ethers.keccak256(initCode);
            console.log("Init code hash:", initCodeHash);
        });
    });

    describe("添加流动性", function () {
        it("应该能够添加 ETH 和代币的流动性", async function () {
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");
            const minTokenAmount = ethers.parseEther("90");
            const minEthAmount = ethers.parseEther("0.9");

            // 检查初始状态
            const initialTokenBalance = await daToken.balanceOf(owner.address);
            const initialEthBalance = await ethers.provider.getBalance(owner.address);
            
            // 检查流动性池是否存在
            const pair = await swapFactory.getPair(await daToken.getAddress(), await weth.getAddress());

            expect(pair).to.not.equal(ethers.ZeroAddress);

            // 授权路由合约使用代币
            await daToken.approve(await swapRouter.getAddress(), tokenAmount);
            
            // 验证授权
            const allowance = await daToken.allowance(owner.address, await swapRouter.getAddress());
            expect(allowance).to.equal(tokenAmount);

            const balance = await ethers.provider.getBalance(owner.address);
            console.log("Owner balance:", ethers.formatEther(balance));  // 转换为 ETH 单位

            try {
                // 添加流动性
                const tx = await swapRouter.addLiquidityETH(
                    await daToken.getAddress(),
                    tokenAmount,
                    minTokenAmount,
                    minEthAmount,
                    owner.address,
                    deadline,
                    { value: ethAmount }
                );
                
                // 等待交易确认
                const receipt = await tx.wait();
                
                // 验证事件
                const event = receipt.events?.find(e => e.event === 'LiquidityAdded');
                expect(event).to.not.be.undefined;
                
                // 验证流动性代币余额
                const pairContract = await ethers.getContractAt("ISwapPair", pair);
                const liquidityBalance = await pairContract.balanceOf(owner.address);
                expect(liquidityBalance).to.be.gt(0);
                
                // 验证代币转移
                const finalTokenBalance = await daToken.balanceOf(owner.address);
                expect(initialTokenBalance.sub(finalTokenBalance)).to.equal(tokenAmount);
                
            } catch (error) {
                console.error("添加流动性失败:", error);
                throw error;
            }
        });

        it("不应该接受过期的 deadline", async function () {
            const expiredDeadline = (await time.latest()) - 1;
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");

            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);

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
            ).to.be.revertedWith("DAuctionSwapRouter: EXPIRED");
        });
    });

    describe("移除流动性", function () {
        beforeEach(async function () {
            // 先添加流动性
            const tokenAmount = ethers.parseEther("100");
            const ethAmount = ethers.parseEther("1");

            await daToken.connect(owner).approve(swapRouter.getAddress(), tokenAmount);
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