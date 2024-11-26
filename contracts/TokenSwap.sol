// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

import "hardhat/console.sol";

contract TokenSwap is Ownable, ReentrancyGuard {
    IERC20 public daToken;
    AggregatorV3Interface public ethPriceFeed;
    
    // DAToken price (in cents, e.g., 100 = 1 USD)
    uint256 public daTokenPrice;
    
    // Slippage tolerance (in basis points, 1 = 0.01%)
    uint256 public slippageTolerance;
    
    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event TokensSold(address indexed seller, uint256 tokenAmount, uint256 ethAmount);
    event PriceUpdated(uint256 newPrice);
    event SlippageToleranceUpdated(uint256 newTolerance);

    constructor(
        address _daToken,
        address _ethPriceFeed,
        uint256 _initialDaTokenPrice,
        uint256 _slippageTolerance
    ) Ownable(msg.sender) {
        daToken = IERC20(_daToken);
        ethPriceFeed = AggregatorV3Interface(_ethPriceFeed);
        daTokenPrice = _initialDaTokenPrice;
        slippageTolerance = _slippageTolerance;
    }

    // Get the latest ETH price
    function getLatestETHPrice() public view returns (uint256) {
        (, int256 price,,,) = ethPriceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        return uint256(price) * 1e10;
    }

    function buyTokens() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        console.log("Received ETH:", msg.value / 1e18);
        
        // Get the current ETH price from Chainlink oracle (returns price with 18 decimals)
        uint256 ethPriceInUsd = getLatestETHPrice();
        console.log("ETH Price (USD):", ethPriceInUsd / 1e18);
        
        // Calculate token amount:
        // msg.value (in wei) * ETH price (USD with 18 decimals) * 100 (convert USD to cents) 
        // divided by 
        // daTokenPrice (in cents) * 1e18 (to maintain precision)
        uint256 tokenAmount = (msg.value * ethPriceInUsd * 100) / (daTokenPrice * 1e18);
        console.log("Token Amount to send:", tokenAmount / 1e18);

        require(tokenAmount > 0, "Token amount too small");
        
        // Check if contract has enough tokens
        uint256 contractBalance = daToken.balanceOf(address(this));
        require(contractBalance >= tokenAmount, "Insufficient token balance");

        // Transfer tokens to buyer
        bool success = daToken.transfer(msg.sender, tokenAmount);
        require(success, "Token transfer failed");

        emit TokensPurchased(msg.sender, msg.value, tokenAmount);
    }

    function sellTokens(uint256 tokenAmount) external nonReentrant {
        require(tokenAmount > 0, "Amount must be greater than 0");
        console.log("Tokens to sell:", tokenAmount / 1e18);
        
        // Get the current ETH price from Chainlink oracle (returns price with 18 decimals)
        uint256 ethPriceInUsd = getLatestETHPrice();
        console.log("ETH Price (USD):", ethPriceInUsd / 1e18);
        
        // Calculate ETH amount:
        // tokenAmount (in wei) * daTokenPrice (in cents) * 1e18 (precision factor)
        // divided by
        // 100 (convert cents to USD) * ETH price (USD with 18 decimals)
        uint256 ethAmount = (tokenAmount * daTokenPrice * 1e18) / (100 * ethPriceInUsd);
        console.log("ETH Amount to return:", ethAmount / 1e18);
        
        require(ethAmount > 0, "ETH amount too small");
        
        // Check if contract has enough ETH
        require(address(this).balance >= ethAmount, "Insufficient ETH balance");

        // Transfer tokens from seller to contract
        require(
            daToken.transferFrom(msg.sender, address(this), tokenAmount),
            "Token transfer failed"
        );

        // Transfer ETH to seller
        (bool success,) = payable(msg.sender).call{value: ethAmount}("");
        require(success, "ETH transfer failed");

        emit TokensSold(msg.sender, tokenAmount, ethAmount);
    }

    // Update DAToken price (only by the owner)
    function updateDaTokenPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Invalid price");
        daTokenPrice = newPrice;
        emit PriceUpdated(newPrice);
    }

    // Update slippage tolerance (only by the owner)
    function updateSlippageTolerance(uint256 newTolerance) external onlyOwner {
        require(newTolerance <= 1000, "Tolerance too high"); // Maximum 10%
        slippageTolerance = newTolerance;
        emit SlippageToleranceUpdated(newTolerance);
    }

    // Emergency withdrawal (only by the owner)
    function emergencyWithdraw() external onlyOwner {
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool success,) = payable(msg.sender).call{value: ethBalance}("");
            require(success, "ETH withdrawal failed");
        }

        uint256 tokenBalance = daToken.balanceOf(address(this));
        if (tokenBalance > 0) {
            require(daToken.transfer(msg.sender, tokenBalance), "Token withdrawal failed");
        }
    }

    receive() external payable {}
} 