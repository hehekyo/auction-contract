// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, Ownable {
    mapping(uint256 => string) private _imageURIs;
    uint256 public tokenCounter;

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    constructor(address owner) Ownable(owner) ERC721("MyNFT", "NFT") {
        tokenCounter = 0;
    }

    // Owner mint for themselves
    function mint(string memory imageURI) public onlyOwner {
        require(bytes(imageURI).length > 0, "Image URI cannot be empty");
        uint256 newTokenId = tokenCounter;
        _mintWithURI(msg.sender, newTokenId, imageURI);
        tokenCounter++;
    }

    // Mint for specific address
    function mint(address to, uint256 tokenId, string memory imageURI) public onlyOwner {
        require(bytes(imageURI).length > 0, "Image URI cannot be empty");
        _mintWithURI(to, tokenId, imageURI);
        if (tokenId >= tokenCounter) {
            tokenCounter = tokenId + 1;
        }
    }

    // Internal mint helper
    function _mintWithURI(address to, uint256 tokenId, string memory imageURI) internal {
        _safeMint(to, tokenId);
        _imageURIs[tokenId] = imageURI;
    }

    // Override tokenURI function from ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        return _imageURIs[tokenId];
    }
}
