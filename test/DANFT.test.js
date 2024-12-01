const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DANFT", function () {
    let DANFT;
    let danft;
    let owner;
    let addr1;
    let addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // 部署合约
        DANFT = await ethers.getContractFactory("DANFT");
        danft = await DANFT.deploy(owner.address);
        await danft.waitForDeployment();
    });

    describe("部署", function () {
        it("应该设置正确的所有者", async function () {
            expect(await danft.owner()).to.equal(owner.address);
        });

        it("应该初始化 tokenCounter 为 0", async function () {
            expect(await danft.tokenCounter()).to.equal(0);
        });
    });

    describe("铸造", function () {
        const imageURI = "https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse";

        it("应该允许所有者为自己铸造 NFT", async function () {
            // 监听铸造事件
            await expect(danft.mint(imageURI))
                .to.emit(danft, "NFTMinted")
                .withArgs(0, owner.address, imageURI, await time.latest());

            expect(await danft.ownerOf(0)).to.equal(owner.address);
            expect(await danft.tokenURI(0)).to.equal(imageURI);
            expect(await danft.tokenCounter()).to.equal(1);
        });

        it("应该允许所有者为其他地址铸造 NFT", async function () {
            const tx = await danft.mint(addr1.address, 1, imageURI);
            const receipt = await tx.wait();
            
            // 获取事件
            const event = receipt.logs.find(log => {
                try {
                    const parsed = danft.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsed.name === 'NFTMinted';
                } catch {
                    return false;
                }
            });
            
            expect(event.args.tokenId).to.equal(1);
            expect(event.args.to).to.equal(addr1.address);
            expect(event.args.imageURI).to.equal(imageURI);
            // 验证时间戳在合理范围内
            expect(event.args.timestamp).to.be.closeTo(
                await time.latest(),
                2  // 允许2秒的误差
            );

            expect(await danft.ownerOf(1)).to.equal(addr1.address);
            expect(await danft.tokenURI(1)).to.equal(imageURI);
            expect(await danft.tokenCounter()).to.equal(2);
        });

        it("不应该允许非所有者铸造 NFT", async function () {
            await expect(
                danft.connect(addr1).mint(imageURI)
            ).to.be.revertedWithCustomError(danft, "OwnableUnauthorizedAccount");
        });

        it("不应该接受空的图片 URI", async function () {
            await expect(
                danft.mint("")
            ).to.be.revertedWith("Image URI cannot be empty");
        });

        it("应该正确更新 tokenCounter", async function () {
            await danft.mint(addr1.address, 5, imageURI);
            expect(await danft.tokenCounter()).to.equal(6);
        });
    });

    describe("转移", function () {
        const imageURI = "https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse";

        beforeEach(async function () {
            await danft.mint(imageURI);
        });

        it("应该允许 NFT 持有者转移 NFT", async function () {
            await danft.safeTransferFrom(owner.address, addr1.address, 0);
            expect(await danft.ownerOf(0)).to.equal(addr1.address);
        });

        it("不应该允许非持有者转移 NFT", async function () {
            await expect(
                danft.connect(addr1).safeTransferFrom(owner.address, addr2.address, 0)
            ).to.be.reverted;
        });
    });

    describe("查询", function () {
        const imageURI = "https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse";

        beforeEach(async function () {
            await danft.mint(imageURI);
        });

        it("应该能够查询 NFT 图片 URI", async function () {
            expect(await danft.tokenURI(0)).to.equal(imageURI);
        });

        it("查询不存在的 NFT 应该失败", async function () {
            await expect(
                danft.tokenURI(99)
            ).to.be.revertedWith("URI query for nonexistent token");
        });
    });

    describe("访问控制", function () {
        it("应该允许转移所有权", async function () {
            await danft.transferOwnership(addr1.address);
            expect(await danft.owner()).to.equal(addr1.address);
        });

        it("不应该允许非所有者转移所有权", async function () {
            await expect(
                danft.connect(addr1).transferOwnership(addr2.address)
            ).to.be.revertedWithCustomError(danft, "OwnableUnauthorizedAccount");
        });
    });

    describe("事件", function () {
        const imageURI = "https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse";

        it("铸造时应该触发 NFTMinted 事件", async function () {
            const tx = await danft.mint(imageURI);
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = danft.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsed.name === 'NFTMinted';
                } catch {
                    return false;
                }
            });

            expect(event.args.tokenId).to.equal(0);
            expect(event.args.to).to.equal(owner.address);
            expect(event.args.imageURI).to.equal(imageURI);
            expect(event.args.timestamp).to.be.closeTo(
                await time.latest(),
                2
            );
        });

        it("为其他地址铸造时应该触发 NFTMinted 事件", async function () {
            const tx = await danft.mint(addr1.address, 1, imageURI);
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = danft.interface.parseLog({
                        topics: log.topics,
                        data: log.data
                    });
                    return parsed.name === 'NFTMinted';
                } catch {
                    return false;
                }
            });

            expect(event.args.tokenId).to.equal(1);
            expect(event.args.to).to.equal(addr1.address);
            expect(event.args.imageURI).to.equal(imageURI);
            expect(event.args.timestamp).to.be.closeTo(
                await time.latest(),
                2
            );
        });
    });
}); 