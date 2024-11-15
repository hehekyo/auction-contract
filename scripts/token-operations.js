async function main() {
    const MyERC20 = await ethers.getContractFactory("MyERC20");
    const myERC20 = await MyERC20.attach("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const [owner, addr1, addr2] = await ethers.getSigners();

    async function displayBalances() {
        console.log("\n当前余额:");
        const ownerBalance = await myERC20.balanceOf(owner.address);
        const addr1Balance = await myERC20.balanceOf(addr1.address);
        const addr2Balance = await myERC20.balanceOf(addr2.address);
        
        console.log("Owner:", ethers.formatUnits(ownerBalance, 18));
        console.log("Addr1:", ethers.formatUnits(addr1Balance, 18));
        console.log("Addr2:", ethers.formatUnits(addr2Balance, 18));
    }

    // 显示基本信息
    console.log("\n=== 代币信息 ===");
    console.log("代币地址:", await myERC20.getAddress());
    console.log("名称:", await myERC20.name());
    console.log("符号:", await myERC20.symbol());
    const totalSupply = await myERC20.totalSupply();
    console.log("总供应量:", ethers.formatUnits(totalSupply, 18));
    console.log("所有者:", await myERC20.owner());

    // 显示初始余额
    await displayBalances();

    // 转账
    console.log("\n=== 执行转账 ===");
    const tx1 = await myERC20.transfer(addr1.address, ethers.parseUnits("100", 18));
    await tx1.wait();
    console.log("已转账 100 代币到 addr1");
    await displayBalances();

    // 授权和转账
    console.log("\n=== 测试授权和转账 ===");
    const tx2 = await myERC20.connect(addr1).approve(addr2.address, ethers.parseUnits("50", 18));
    await tx2.wait();
    console.log("Addr1 授权 50 代币给 addr2");
    
    const tx3 = await myERC20.connect(addr2).transferFrom(
        addr1.address, 
        addr2.address, 
        ethers.parseUnits("50", 18)
    );
    await tx3.wait();
    console.log("Addr2 从 addr1 转移了 50 代币");
    await displayBalances();

    // 查询授权额度
    const allowance = await myERC20.allowance(addr1.address, addr2.address);
    console.log("\n剩余授权额度:", ethers.formatUnits(allowance, 18));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 