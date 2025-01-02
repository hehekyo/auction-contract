import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("DAToken", function () {
    let DAToken: any;
    let datoken: any;
    let owner: Signer;
    let addr1: Signer;
    let addr2: Signer;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // 部署 DAToken 合约
        const DATokenFactory = await ethers.getContractFactory("DAToken");
        datoken = await DATokenFactory.deploy(ethers.utils.parseEther("1000000")); // 初始供应量
        await datoken.deployed();
    });

    describe("基本信息", function () {
        it("应该返回正确的名称和符号", async function () {
            expect(await datoken.name()).to.equal("DAToken");
            expect(await datoken.symbol()).to.equal("DAT");
        });

        it("应该返回正确的总供应量", async function () {
            expect(await datoken.totalSupply()).to.equal(ethers.utils.parseEther("1000000"));
        });
    });

    describe("转账功能", function () {
        it("应该能够成功转账代币", async function () {
            await datoken.transfer(await addr1.getAddress(), ethers.utils.parseEther("100"));
            expect(await datoken.balanceOf(await addr1.getAddress())).to.equal(ethers.utils.parseEther("100"));
        });

        it("应该失败于转账超过余额", async function () {
            await expect(
                datoken.connect(addr1).transfer(await addr2.getAddress(), ethers.utils.parseEther("1"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });
    });

    describe("授权功能", function () {
        it("应该能够成功授权代币", async function () {
            await datoken.approve(await addr1.getAddress(), ethers.utils.parseEther("50"));
            expect(await datoken.allowance(await owner.getAddress(), await addr1.getAddress())).to.equal(ethers.utils.parseEther("50"));
        });

        it("应该能够成功使用授权的代币", async function () {
            await datoken.approve(await addr1.getAddress(), ethers.utils.parseEther("50"));
            await datoken.connect(addr1).transferFrom(await owner.getAddress(), await addr2.getAddress(), ethers.utils.parseEther("50"));
            expect(await datoken.balanceOf(await addr2.getAddress())).to.equal(ethers.utils.parseEther("50"));
        });

        it("应该失败于使用超过授权的代币", async function () {
            await datoken.approve(await addr1.getAddress(), ethers.utils.parseEther("50"));
            await expect(
                datoken.connect(addr1).transferFrom(await owner.getAddress(), await addr2.getAddress(), ethers.utils.parseEther("100"))
            ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });
    });
}); 