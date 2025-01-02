// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DAToken is ERC20, Ownable {
    constructor(
        address initialOwner,
        uint256 initialSupply
    ) 
        ERC20("DAToken", "DAT") 
        Ownable(initialOwner)  
    {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}