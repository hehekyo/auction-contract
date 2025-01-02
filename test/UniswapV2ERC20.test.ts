import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("UniswapV2ERC20", function () {
    let token: Contract;
    let owner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;

    async function deployTokenFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();

        const Token = await ethers.getContractFactory("TestUniswapV2ERC20");
        const token = await Token.deploy();
        await token.waitForDeployment();

        return { token, owner, addr1, addr2 };
    }

    beforeEach(async function () {
        const fixture = await loadFixture(deployTokenFixture);
        token = fixture.token;
        owner = fixture.owner;
        addr1 = fixture.addr1;
        addr2 = fixture.addr2;
    });

    describe("基础信息", function () {
        it("应该有正确的名称、符号和小数位数", async function () {
            expect(await token.name()).to.equal("Uniswap V2");
            expect(await token.symbol()).to.equal("UNI-V2");
            expect(await token.decimals()).to.equal(18);
        });

        it("应该正确设置 DOMAIN_SEPARATOR", async function () {
            expect(await token.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
        });

        it("应该有正确的 PERMIT_TYPEHASH", async function () {
            expect(await token.PERMIT_TYPEHASH()).to.equal(
                "0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9"
            );
        });
    });

    describe("转账功能", function () {
        it("应该能够转账代币", async function () {
            const mintAmount = ethers.parseEther("100");
            await token.connect(owner).mint(owner.address, mintAmount);

            const transferAmount = ethers.parseEther("50");
            await token.connect(owner).transfer(addr1.address, transferAmount);

            expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
        });

        it("应该在转账时触发 Transfer 事件", async function () {
            const mintAmount = ethers.parseEther("100");
            await token.connect(owner).mint(owner.address, mintAmount);

            const transferAmount = ethers.parseEther("50");
            await expect(token.connect(owner).transfer(addr1.address, transferAmount))
                .to.emit(token, "Transfer")
                .withArgs(owner.address, addr1.address, transferAmount);
        });
    });

    describe("授权功能", function () {
        it("应该能够授权和转账授权的代币", async function () {
            const mintAmount = ethers.parseEther("100");
            await token.connect(owner).mint(owner.address, mintAmount);

            const approveAmount = ethers.parseEther("50");
            await token.connect(owner).approve(addr1.address, approveAmount);

            expect(await token.allowance(owner.address, addr1.address))
                .to.equal(approveAmount);

            await token.connect(addr1).transferFrom(
                owner.address,
                addr2.address,
                approveAmount
            );

            expect(await token.balanceOf(addr2.address)).to.equal(approveAmount);
        });
    });

    describe("Permit 功能", function () {
        it("应该能够使用 permit 进行授权", async function () {
            const value = ethers.parseEther("100");
            const deadline = ethers.MaxUint256;

            const nonce = await token.nonces(owner.address);

            const domain = {
                name: "Uniswap V2",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await token.getAddress()
            };

            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            };

            const message = {
                owner: owner.address,
                spender: addr1.address,
                value: value,
                nonce: nonce,
                deadline: deadline
            };

            const signature = await owner.signTypedData(domain, types, message);
            const sig = ethers.Signature.from(signature);

            await token.permit(
                owner.address,
                addr1.address,
                value,
                deadline,
                sig.v,
                sig.r,
                sig.s
            );

            expect(await token.allowance(owner.address, addr1.address))
                .to.equal(value);
        });
    });

    describe("铸造和销毁", function () {
        it("应该能够铸造代币", async function () {
            const mintAmount = ethers.parseEther("100");
            await token.connect(owner).mint(owner.address, mintAmount);
            expect(await token.balanceOf(owner.address)).to.equal(mintAmount);
        });

        it("应该能够销毁代币", async function () {
            const mintAmount = ethers.parseEther("100");
            await token.connect(owner).mint(owner.address, mintAmount);

            const burnAmount = ethers.parseEther("50");
            await token.connect(owner).burn(owner.address, burnAmount);

            expect(await token.balanceOf(owner.address))
                .to.equal(mintAmount - burnAmount);
        });
    });
}); 