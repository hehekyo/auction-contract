async function main() {
    const MyERC20 = await ethers.getContractFactory("MyERC20");
    const myERC20 = await MyERC20.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const [owner, addr1, addr2] = await ethers.getSigners();

    async function displayBalances() {
        console.log("\nCurrent Balances:");
        console.log("Owner:", ethers.formatEther(await myERC20.balanceOf(owner.address)));
        console.log("Addr1:", ethers.formatEther(await myERC20.balanceOf(addr1.address)));
        console.log("Addr2:", ethers.formatEther(await myERC20.balanceOf(addr2.address)));
    }

    // 显示基本信息
    console.log("\n=== Token Information ===");
    console.log("Token Address:", await myERC20.getAddress());
    console.log("Name:", await myERC20.name());
    console.log("Symbol:", await myERC20.symbol());
    console.log("Total Supply:", ethers.formatEther(await myERC20.totalSupply()));
    console.log("Owner:", await myERC20.owner());

    // 显示初始余额
    await displayBalances();

    // 转账
    console.log("\n=== Performing Transfers ===");
    await myERC20.transfer(addr1.address, ethers.parseEther("100"));
    console.log("Transferred 100 tokens to addr1");
    await displayBalances();

    // 授权和转账
    console.log("\n=== Testing Approve and TransferFrom ===");
    await myERC20.connect(addr1).approve(addr2.address, ethers.parseEther("50"));
    console.log("Addr1 approved 50 tokens for addr2");
    
    await myERC20.connect(addr2).transferFrom(
        addr1.address, 
        addr2.address, 
        ethers.parseEther("50")
    );
    console.log("Addr2 transferred 50 tokens from addr1");
    await displayBalances();

    // 查询授权额度
    const allowance = await myERC20.allowance(addr1.address, addr2.address);
    console.log("\nRemaining allowance:", ethers.formatEther(allowance));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 