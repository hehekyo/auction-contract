const { expect } = require("chai");
const { ethers } = require("hardhat");

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
        danft = await DANFT.deploy();
    });

    describe("铸造", function () {
        const imageURI = "https://ipfs.io/ipfs/QmV6hWqJ1du519rrrk23G9XCmKuvRzvjaPUy2tLtfEwgse";

        it("应该允许合约拥有者铸造 NFT", async function () {
            await expect(danft.mint(imageURI))
                .to.emit(danft, "NFTMinted")
                .withArgs(0, owner.address, imageURI);

            expect(await danft.ownerOf(0)).to.equal(owner.address);
            expect(await danft.tokenURI(0)).to.equal(imageURI);
        });

        it("不应该允许非拥有者铸造 NFT", async function () {
            await expect(
                danft.connect(addr1).mint(imageURI)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("不应该接受空的图片 URI", async function () {
            await expect(
                danft.mint("")
            ).to.be.revertedWith("Image URI cannot be empty");
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

        it("应该能够获取我的 NFT", async function () {
            const tokens = await danft.getMyTokens(owner.address);
            expect(tokens.length).to.equal(1);
            expect(tokens[0].tokenId).to.equal(0);
            expect(tokens[0].imageURI).to.equal(imageURI);
        });
    });
}); 