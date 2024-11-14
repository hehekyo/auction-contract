const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyNFT", function () {
    let MyNFT;
    let myNFT;
    let owner;
    let addr1;
    let addr2;

    beforeEach(async function () {
        // Get test accounts
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy contract
        MyNFT = await ethers.getContractFactory("MyNFT");
        myNFT = await MyNFT.deploy(owner.address);
        await myNFT.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct owner", async function () {
            expect(await myNFT.owner()).to.equal(owner.address);
        });

        it("Should initialize tokenCounter to 0", async function () {
            expect(await myNFT.tokenCounter()).to.equal(0);
        });
    });

    describe("Minting", function () {
        const imageURI = "ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/1.png";

        it("Should allow owner to mint NFT for themselves", async function () {
            await myNFT.mint(imageURI);
            expect(await myNFT.ownerOf(0)).to.equal(owner.address);
            expect(await myNFT.tokenURI(0)).to.equal(imageURI);
            expect(await myNFT.tokenCounter()).to.equal(1);
        });

        it("Should allow owner to mint NFT for other addresses", async function () {
            await myNFT.mint(addr1.address, 1, imageURI);
            expect(await myNFT.ownerOf(1)).to.equal(addr1.address);
            expect(await myNFT.tokenURI(1)).to.equal(imageURI);
            expect(await myNFT.tokenCounter()).to.equal(2);
        });

        it("Should not allow non-owner to mint NFT", async function () {
            await expect(
                myNFT.connect(addr1).mint(imageURI)
            ).to.be.revertedWithCustomError(myNFT, "OwnableUnauthorizedAccount");
        });

        it("Should not accept empty image URI", async function () {
            await expect(
                myNFT.mint("")
            ).to.be.revertedWith("Image URI cannot be empty");
        });
    });

    describe("Transfer", function () {
        const imageURI = "ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/1.png";

        beforeEach(async function () {
            // Mint an NFT for owner first
            await myNFT.mint(imageURI);
        });

        it("Should allow NFT holder to transfer NFT", async function () {
            await myNFT.safeTransferFrom(owner.address, addr1.address, 0);
            expect(await myNFT.ownerOf(0)).to.equal(addr1.address);
        });

        it("Should not allow non-holder to transfer NFT", async function () {
            await expect(
                myNFT.connect(addr1).safeTransferFrom(owner.address, addr2.address, 0)
            ).to.be.reverted;
        });

        it("Should update tokenCounter correctly", async function () {
            await myNFT.mint(addr1.address, 5, imageURI);
            expect(await myNFT.tokenCounter()).to.equal(6);
        });
    });

    describe("Query", function () {
        const imageURI = "ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/1.png";

        beforeEach(async function () {
            await myNFT.mint(imageURI);
        });

        it("Should be able to query NFT image URI", async function () {
            expect(await myNFT.tokenURI(0)).to.equal(imageURI);
        });

        it("Should fail when querying non-existent NFT", async function () {
            await expect(
                myNFT.tokenURI(99)
            ).to.be.revertedWith("URI query for nonexistent token");
        });
    });

    describe("Access Control", function () {
        it("Should allow ownership transfer", async function () {
            await myNFT.transferOwnership(addr1.address);
            expect(await myNFT.owner()).to.equal(addr1.address);
        });

        it("Should not allow non-owner to transfer ownership", async function () {
            await expect(
                myNFT.connect(addr1).transferOwnership(addr2.address)
            ).to.be.revertedWithCustomError(myNFT, "OwnableUnauthorizedAccount");
        });
    });
}); 