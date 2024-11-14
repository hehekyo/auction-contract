// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MyNFT is ERC721, Ownable {
    using Strings for uint256;
    uint256 public tokenCounter;
    mapping(uint256 => string) public _tokenURIs;

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    constructor(address owner) Ownable(owner) ERC721("AuctionNFT", "ANFT") {
        tokenCounter = 0;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        string memory _tokenURI = _tokenURIs[tokenId];
        require(bytes(_tokenURI).length > 0, "Token URI not set");
        return _tokenURI;
    }


    function setTokenURI(uint256 tokenId, string memory _cid) public onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        _tokenURIs[tokenId] = string(abi.encodePacked("ipfs://", _cid, "/", tokenId.toString(), ".json"));
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
