// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, Ownable {
    uint256 public tokenCounter;

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    constructor(address owner) Ownable(owner) ERC721("MyNFT", "NFT") {
        tokenCounter = 0;
    }

    function mint() public onlyOwner {
        _safeMint(msg.sender, tokenCounter);
        tokenCounter++;
    }

    function mint(address to, uint256 tokenId) public onlyOwner {
        require(!_exists(tokenId), "Token ID already exists");
        _safeMint(to, tokenId);
        // 更新 tokenCounter 确保它始终大于最新的 tokenId
        if (tokenId >= tokenCounter) {
            tokenCounter = tokenId + 1;
        }
    }

}
