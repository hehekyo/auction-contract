const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyERC20", function () {
    let MyERC20;
    let myERC20;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    const INITIAL_SUPPLY = ethers.parseEther("1000000");

    beforeEach(async function () {
        // 获取合约工厂和测试账户
        MyERC20 = await ethers.getContractFactory("MyERC20");
        

        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        console.log("owner,addr1,addr2", owner, addr1, addr2);
        
        // 部署合约 - 传入 owner 地址和初始供应量
        myERC20 = await MyERC20.deploy(owner.address, INITIAL_SUPPLY);
        console.log("myERC20", myERC20);

        await myERC20.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the right owner", async function () {
            expect(await myERC20.owner()).to.equal(owner.address);
        });

        it("Should assign the total supply to the owner", async function () {
            const ownerBalance = await myERC20.balanceOf(owner.address);
            expect(await myERC20.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(ownerBalance).to.equal(INITIAL_SUPPLY);
        });

        it("Should set the correct initial supply", async function () {
            expect(await myERC20.totalSupply()).to.equal(INITIAL_SUPPLY);
        });
    });

    describe("Transactions", function () {
        it("Should transfer tokens between accounts", async function () {
            // 从owner转账给addr1
            const amount = ethers.parseEther("100");
            await myERC20.transfer(addr1.address, amount);
            expect(await myERC20.balanceOf(addr1.address)).to.equal(amount);
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
            const initialOwnerBalance = await myERC20.balanceOf(owner.address);
            await expect(
                myERC20.connect(addr1).transfer(owner.address, 1)
            ).to.be.revertedWithCustomError(myERC20, "ERC20InsufficientBalance");

            expect(await myERC20.balanceOf(owner.address)).to.equal(
                initialOwnerBalance
            );
        });

        it("Should update allowances on approve", async function () {
            const amount = ethers.parseEther("100");
            await myERC20.approve(addr1.address, amount);
            expect(await myERC20.allowance(owner.address, addr1.address))
                .to.equal(amount);
        });
    });

    describe("Minting", function () {
        it("Should allow owner to mint tokens", async function () {
            const amount = ethers.parseEther("100");
            await myERC20.mint(addr1.address, amount);
            expect(await myERC20.balanceOf(addr1.address)).to.equal(amount);
        });

        it("Should fail if non-owner tries to mint", async function () {
            const amount = ethers.parseEther("100");
            await expect(
                myERC20.connect(addr1).mint(addr2.address, amount)
            ).to.be.revertedWithCustomError(myERC20, "OwnableUnauthorizedAccount")
            .withArgs(addr1.address);
        });
    });
}); 