// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyERC20 is ERC20, Ownable {

    constructor(address owner) Ownable(owner) ERC20("MyERC20", "myERC20") {
        mint(owner, (10 ** 18) * (10 ** 18)); // Mint 1000 tokens
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}