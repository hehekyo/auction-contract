// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@chainlink/contracts/src/v0.8/automation/KeeperCompatible.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract AuctionManager is Initializable, UUPSUpgradeable, AccessControlUpgradeable, OwnableUpgradeable {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    function initialize(address initialAdmin, IERC20 _myERC20Token) public initializer {
        __AccessControl_init();
        // __Ownable_init();
        // __UUPSUpgradeable_init();
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE, initialAdmin);
        myERC20Token = _myERC20Token;
    }

    // 定义拍卖类型
    enum AuctionType { DutchAuction, EnglishAuction }

    // 定义拍卖状态
    enum AuctionStatus { Registration, Ongoing, Ended }

    uint[] private auctions2End;
    uint[] private dutchAuctions2UpdatePrice;

    // 拍卖事件
    event AuctionCreated(
        uint indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        AuctionType auctionType,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 duration,
        uint256 depositAmount
    );

    event AuctionStarted(
        uint indexed auctionId,
        uint256 startTime,
        uint256 endTime,
        uint256 startingPrice
    );

    event AuctionEnded(
        uint indexed auctionId, 
        address indexed winner,
        uint256 finalPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint indexed auctionId,
        address indexed bidder,
        uint256 bidAmount,
        uint256 timestamp
    );

    event DutchAuctionPriceUpdated(
        uint indexed auctionId,
        uint256 oldPrice,
        uint256 newPrice,
        uint256 timestamp
    );

    event DepositHandled(
        uint indexed auctionId,
        address indexed participant,
        uint256 amount,
        bool isDeposit,  // true for deposit, false for refund
        uint256 timestamp
    );

    event AuctionCancelled(
        uint indexed auctionId,
        address indexed canceller,
        string reason,
        uint256 timestamp
    );

    event PaymentSettled(
        uint indexed auctionId,
        address indexed seller,
        address indexed buyer,
        uint256 amount,
        uint256 timestamp
    );

    event NFTTransferred(
        uint indexed auctionId,
        address indexed from,
        address indexed to,
        address nftContract,
        uint256 tokenId,
        uint256 timestamp
    );

    IERC20 public myERC20Token;

    struct Auction {
        AuctionType auctionType;
        address seller;
        address nftContract;
        uint tokenId;
        AuctionStatus auctionStatus;
        uint duration;
        uint depositAmount;
        address highestBidder;
        uint finalPrice;
        EnglishAuction englishAuction;
        DutchAuction dutchAuction;
        mapping(address => bool) hasDeposited; // 存储参与者是否已缴纳押金
        bool isPaymentTransferred;
        bool isNFTTransferred;
    }

    // 英式拍卖结构体
    struct EnglishAuction {
        uint startingPrice;
        uint reservePrice;    // 最低成交价
        uint auctionEndTime;
        uint currentBid;
    }

    // 荷兰拍卖结构体
    struct DutchAuction {
        uint startingPrice;
        uint endPrice;
        uint auctionEndTime;
        uint currentPrice;
        uint priceDecrement;
        uint decrementInterval;
        uint lastUpdateTime;
    }

    // 存储拍卖
    mapping(uint => Auction) public auctions; // 存储英式拍卖

    uint public auctionCount;  // 当前拍卖的总数

    // Additional Map for checking if key exists
    mapping (uint => bool) _auctionIdExist;  

    // 添加重入锁
    bool private locked;
    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    function calculateDepositAmount(uint startingPrice) internal pure returns (uint) {
        // 设置为起拍价的10%
        return startingPrice * 10 / 100;
    }

    function startAuction(
        AuctionType auctionType,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 duration,
        address nftContract,
        uint256 tokenId,
        uint256 priceDecrement,
        uint256 decrementInterval
    ) external {
        // 基本参数检查
        require(nftContract != address(0), "Invalid NFT contract address");
        require(duration > 0, "Duration must be greater than 0");
        require(startingPrice > 0, "Starting price must be greater than 0");
        
        // 自动计算押金金额
        uint depositAmount = calculateDepositAmount(startingPrice);
        require(depositAmount > 0, "Deposit amount must be greater than 0");
        
        // NFT 相关检查
        IERC721 nftContractInstance = IERC721(nftContract);
        require(nftContractInstance.ownerOf(tokenId) == msg.sender, "Caller must own the NFT");
        require(nftContractInstance.isApprovedForAll(msg.sender, address(this)) || 
                nftContractInstance.getApproved(tokenId) == address(this), 
                "Contract must be approved to transfer NFT");

        // 根据拍卖类型进行不同的验证
        if (auctionType == AuctionType.EnglishAuction) {
            require(priceDecrement == 0, "English auction should not have price decrement");
            require(decrementInterval == 0, "English auction should not have decrement interval");
        } else if (auctionType == AuctionType.DutchAuction) {
            require(priceDecrement > 0, "Dutch auction must have price decrement");
            require(decrementInterval > 0, "Dutch auction must have decrement interval");
            require(duration >= decrementInterval, "Duration too short for price decrements");
            require(startingPrice > reservePrice, "Starting price must be greater than end price");
        }

        auctionCount++;
        uint auctionId = auctionCount;
        _auctionIdExist[auctionId] = true;

        Auction storage newAuction = auctions[auctionId];
        newAuction.seller = msg.sender;
        newAuction.nftContract = nftContract;
        newAuction.tokenId = tokenId;
        newAuction.auctionStatus = AuctionStatus.Ongoing;
        newAuction.depositAmount = depositAmount;  // 设置计算得到的押金金额
        newAuction.auctionType = auctionType;
        newAuction.duration = duration;

        uint _endTime = block.timestamp + duration;

        if (auctionType == AuctionType.EnglishAuction) {
            newAuction.englishAuction.startingPrice = startingPrice;
            newAuction.englishAuction.reservePrice = reservePrice;
            newAuction.englishAuction.currentBid = 0;
            newAuction.englishAuction.auctionEndTime = _endTime;
        } else {
            newAuction.dutchAuction.startingPrice = startingPrice;
            newAuction.dutchAuction.endPrice = reservePrice;
            newAuction.dutchAuction.currentPrice = startingPrice;
            newAuction.dutchAuction.priceDecrement = priceDecrement;
            newAuction.dutchAuction.decrementInterval = decrementInterval;
            newAuction.dutchAuction.auctionEndTime = _endTime;
            newAuction.dutchAuction.lastUpdateTime = block.timestamp;
        }

        emit AuctionCreated(auctionId, msg.sender, nftContract, tokenId, auctionType, startingPrice, reservePrice, duration, depositAmount);
        emit AuctionStarted(auctionId, block.timestamp, _endTime, startingPrice);
    }

    // 竞标
    function bid(uint auctionId, uint amount) public {
        // 基本检查
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        require(msg.sender != address(0), "Invalid bidder address");

        Auction storage auction = auctions[auctionId];
        
        // 状态检查
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(auction.hasDeposited[msg.sender], "Deposit not paid");

        // 时间检查
        if (auction.auctionType == AuctionType.EnglishAuction) {
            require(block.timestamp < auction.englishAuction.auctionEndTime, "Auction has ended");
        } else {
            require(block.timestamp < auction.dutchAuction.auctionEndTime, "Auction has ended");
        }

        // 拍卖类型特定检查
        if (auction.auctionType == AuctionType.DutchAuction) {
            // 荷兰拍卖检查
            require(auction.highestBidder == address(0), "Dutch auction already has a bidder");
            require(amount == auction.dutchAuction.currentPrice, "Bid must equal current price");
            
            // 检查用户是否有足够的代币余额
            require(myERC20Token.balanceOf(msg.sender) >= amount, "Insufficient token balance");
            // 检查用户是否已经授权合约使用足够的代币
            require(myERC20Token.allowance(msg.sender, address(this)) >= amount, "Insufficient token allowance");

            // 更新拍卖状态
            auction.highestBidder = msg.sender;
            auction.finalPrice = amount;
            
            emit BidPlaced(auctionId, msg.sender, amount, block.timestamp);

        } else {
            // 英式拍卖检查
            require(amount > auction.englishAuction.currentBid, "Bid must be higher than current bid");
            require(amount >= auction.englishAuction.startingPrice, "Bid must be at least starting price");
            
            // 如果不是第一个出价，要求新出价必须高于当前出价一定比例（例如1%）
            if (auction.englishAuction.currentBid > 0) {
                require(amount >= auction.englishAuction.currentBid + (auction.englishAuction.currentBid / 100), 
                    "Bid increment too small");
            }

            // 检查用户是否有足够的代币余额
            require(myERC20Token.balanceOf(msg.sender) >= amount, "Insufficient token balance");
            // 检查用户是否已经授权合约使用足够的代币
            require(myERC20Token.allowance(msg.sender, address(this)) >= amount, "Insufficient token allowance");

            // 更新拍卖状态
            if (auction.highestBidder != address(0)) {
                // 如果存在之前的最高出价者，退还其出价
                require(myERC20Token.transfer(auction.highestBidder, auction.englishAuction.currentBid), 
                    "Failed to refund previous bidder");
            }

            auction.englishAuction.currentBid = amount;
            auction.highestBidder = msg.sender;
            
            emit BidPlaced(auctionId, msg.sender, amount, block.timestamp);
        }

        // 转移竞标金额到合约
        require(myERC20Token.transferFrom(msg.sender, address(this), amount), 
            "Failed to transfer bid amount");
    }

    // 缴纳押金, 前端需要帮助 授权
    function deposit(uint auctionId) public {
        // 基本检查
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        require(msg.sender != address(0), "Invalid depositor address");

        Auction storage auction = auctions[auctionId];
        
        // 状态检查
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction not ongoing");
        require(msg.sender != auction.seller, "Seller cannot deposit");
        require(!auction.hasDeposited[msg.sender], "Already deposited");
        require(auction.depositAmount > 0, "Invalid deposit amount");

        // 时间检查
        uint auctionEndTime = auction.auctionType == AuctionType.EnglishAuction ? 
            auction.englishAuction.auctionEndTime : 
            auction.dutchAuction.auctionEndTime;
        require(block.timestamp < auctionEndTime, "Auction has ended");

        // 荷兰拍卖特殊检查
        if (auction.auctionType == AuctionType.DutchAuction) {
            require(auction.highestBidder == address(0), "Dutch auction already has a winner");
        }

        // 代币相关检查
        require(address(myERC20Token) != address(0), "Token not initialized");
        uint depositAmount = auction.depositAmount;

        // 余额检查
        uint userBalance = myERC20Token.balanceOf(msg.sender);
        require(userBalance >= depositAmount, "Insufficient token balance");
        
        // 授权检查
        uint allowance = myERC20Token.allowance(msg.sender, address(this));
        require(allowance >= depositAmount, "Insufficient token allowance");

        // 安全转账
        require(myERC20Token.transferFrom(msg.sender, address(this), depositAmount), 
            "Deposit transfer failed");

        // 更新状态
        auction.hasDeposited[msg.sender] = true;

        // 触发事件
        emit DepositHandled(auctionId, msg.sender, depositAmount, true, block.timestamp);
    }

    // 结束拍卖
    function endAuction(uint auctionId) public {
        // 基本检查
        require(_auctionIdExist[auctionId], "Auction does not exist");
        
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");

        // 时间检查
        uint endTime = auction.auctionType == AuctionType.EnglishAuction ? 
            auction.englishAuction.auctionEndTime : 
            auction.dutchAuction.auctionEndTime;
        
        // 英式拍卖必须等到结束时间
        if (auction.auctionType == AuctionType.EnglishAuction) {
            require(block.timestamp >= endTime, "Auction not yet ended");
            require(auction.englishAuction.currentBid >= auction.englishAuction.reservePrice, 
                "Reserve price not met");
        }
        
        // 荷拍卖有人出价就可以结束
        if (auction.auctionType == AuctionType.DutchAuction) {
            require(auction.highestBidder != address(0) || block.timestamp >= endTime, 
                "Auction cannot be ended yet");
        }

        // 检查是否已经有人出价
        address highestBidder = auction.highestBidder;
        if (highestBidder == address(0)) {
            // 无人出价，拍卖失败
            auction.auctionStatus = AuctionStatus.Ended;
            emit AuctionCancelled(auctionId, msg.sender, "No bids", block.timestamp);
            return;
        }

        // 防止重复执行
        require(!auction.isPaymentTransferred, "Payment already transferred");
        require(!auction.isNFTTransferred, "NFT already transferred");

        // 设置最终价格
        if (auction.auctionType == AuctionType.EnglishAuction) {
            auction.finalPrice = auction.englishAuction.currentBid;
        } else {
            auction.finalPrice = auction.dutchAuction.currentPrice;
        }

        // 更新状标志
        auction.isPaymentTransferred = true;
        auction.isNFTTransferred = true;
        auction.auctionStatus = AuctionStatus.Ended;

        // 安全转账检查
        IERC721 nftContract = IERC721(auction.nftContract);
        require(nftContract.ownerOf(auction.tokenId) == auction.seller, 
            "Seller no longer owns NFT");
        require(nftContract.isApprovedForAll(auction.seller, address(this)) || 
                nftContract.getApproved(auction.tokenId) == address(this), 
                "Contract not approved for NFT transfer");

        // 先转移代币，再移NFT（防止重入攻）
        require(myERC20Token.transfer(auction.seller, auction.finalPrice), 
            "Payment transfer failed");
        emit PaymentSettled(auctionId, auction.seller, auction.highestBidder, auction.finalPrice, block.timestamp);

        // 转移NFT
        try nftContract.safeTransferFrom(auction.seller, auction.highestBidder, auction.tokenId) {
            emit NFTTransferred(auctionId, auction.seller, auction.highestBidder, auction.nftContract, auction.tokenId, block.timestamp);
        } catch {
            // NFT转移失败，回滚支付
            require(myERC20Token.transfer(address(this), auction.finalPrice), 
                "Payment revert failed");
            auction.isPaymentTransferred = false;
            auction.isNFTTransferred = false;
            auction.auctionStatus = AuctionStatus.Ongoing;
            revert("NFT transfer failed");
        }

        emit AuctionEnded(auctionId, auction.highestBidder, auction.finalPrice, endTime);
    }

    // 添加访问控制
    modifier onlyAuthorized(uint auctionId) {
        Auction storage auction = auctions[auctionId];
        require(msg.sender == auction.seller || hasRole(ADMIN_ROLE, msg.sender), 
            "Not authorized");
        _;
    }

    // 紧急情况下取消拍卖
    function emergencyCancelAuction(uint auctionId) external onlyAuthorized(auctionId) {
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction not ongoing");
        
        auction.auctionStatus = AuctionStatus.Ended;
        
        // 如果有出价，退还出价
        if (auction.highestBidder != address(0)) {
            if (auction.auctionType == AuctionType.EnglishAuction) {
                require(myERC20Token.transfer(auction.highestBidder, 
                    auction.englishAuction.currentBid), "Refund failed");
            } else {
                require(myERC20Token.transfer(auction.highestBidder, 
                    auction.dutchAuction.currentPrice), "Refund failed");
            }
        }
        
        emit AuctionCancelled(auctionId, msg.sender, "Emergency cancellation", block.timestamp);
    }

    function refundDeposit(uint auctionId) public nonReentrant {
        // 基本检查
        require(_auctionIdExist[auctionId], "Auction does not exist");
        require(msg.sender != address(0), "Invalid address");

        Auction storage auction = auctions[auctionId];
        
        // 状检查
        require(auction.auctionStatus == AuctionStatus.Ended, "Auction not ended");
        require(auction.hasDeposited[msg.sender], "No deposit found");

        // 确保该用户没有成为赢家
        require(msg.sender != auction.highestBidder, "Winner cannot refund deposit");

        // 检查是否已经退还过
        require(auction.hasDeposited[msg.sender], "Deposit already refunded");

        // 获取押金金额
        uint depositAmount = auction.depositAmount;
        require(depositAmount > 0, "Invalid deposit amount");

        // 检查合约余额
        require(myERC20Token.balanceOf(address(this)) >= depositAmount, 
            "Insufficient contract balance");

        // 先修改状态再转账（防止重入攻击）
        auction.hasDeposited[msg.sender] = false;

        // 安全转账
        bool success = myERC20Token.transfer(msg.sender, depositAmount);
        require(success, "Transfer failed");

        emit DepositHandled(auctionId, msg.sender, depositAmount, false, block.timestamp);
    }

    // 添加批量退还押金功能（管理员使用）
    function batchRefundDeposits(
        uint auctionId, 
        address[] calldata depositors
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(_auctionIdExist[auctionId], "Auction does not exist");
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ended, "Auction not ended");

        for (uint i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            if (depositor != address(0) && 
                auction.hasDeposited[depositor] && 
                depositor != auction.highestBidder) {
                
                uint depositAmount = auction.depositAmount;
                auction.hasDeposited[depositor] = false;
                
                bool success = myERC20Token.transfer(depositor, depositAmount);
                require(success, "Transfer failed");
                
                emit DepositHandled(auctionId, depositor, depositAmount, false, block.timestamp);
            }
        }
    }

    // 添加紧急提取功能（仅管理员）
    function emergencyWithdraw(
        address token,
        address to,
        uint amount
    ) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "Invalid address");
        require(amount > 0, "Invalid amount");
        
        if (token == address(myERC20Token)) {
            require(myERC20Token.transfer(to, amount), "Transfer failed");
        } else {
            IERC20 tokenContract = IERC20(token);
            require(tokenContract.transfer(to, amount), "Transfer failed");
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}

    // function checkUpkeep(bytes calldata /* checkData */) external override returns (bool upkeepNeeded, bytes memory /* performData */) {
    //     delete auctions2End;
    //     delete dutchAuctions2UpdatePrice;

    //     upkeepNeeded = false;

    //     for (uint i = 1; i <= auctionCount; i++) {
    //         Auction storage auction = auctions[i];

    //         if (auction.auctionStatus == AuctionStatus.Ongoing) {
    //             // 英式拍卖到达结束时间
    //             if (auction.auctionType == AuctionType.EnglishAuction &&
    //                 auction.englishAuction.auctionEndTime <= block.timestamp) {
    //                 upkeepNeeded = true;
    //                 auctions2End.push(i);  // 将需要结束的拍加入列表
    //             }

    //             // 荷兰拍卖需要更新价格，且未结束且有出价者
    //             if (auction.auctionType == AuctionType.DutchAuction) {
    //                 // 检查是否有最高出价者，若有，则认为拍卖结束
    //                 if (auction.highestBidder != address(0)) {
    //                     upkeepNeeded = true;
    //                     auctions2End.push(i);  // 如果有出价者，结束拍卖
    //                 }
    //                 // 如果拍卖未结束且价格可以更新，执行价格递减
    //                 else if (block.timestamp >= auction.dutchAuction.lastUpdateTime + auction.dutchAuction.decrementInterval &&
    //                     auction.dutchAuction.currentPrice > auction.dutchAuction.endPrice) {
    //                     upkeepNeeded = true;
    //                     dutchAuctions2UpdatePrice.push(i);  // 将需要更新价格的拍卖加入列表
    //                 }
    //             }
    //         }
    //     }
    // }

    // function performUpkeep(bytes calldata /* performData */) external override {
    //     // 结束所有符合条件的英式拍卖或荷兰拍卖（有出价者）
    //     for (uint i = 0; i < auctions2End.length; i++) {
    //         uint auctionId = auctions2End[i];
    //         endAuction(auctionId);  // 调用 endAuction 结束拍卖
    //     }

    //     // 更新所有符合条的荷兰拍卖价格
    //     for (uint i = 0; i < dutchAuctions2UpdatePrice.length; i++) {
    //         uint auctionId = dutchAuctions2UpdatePrice[i];
    //         Auction storage auction = auctions[auctionId];

    //         // 降价
    //         auction.dutchAuction.currentPrice -= auction.dutchAuction.priceDecrement;
    //         auction.dutchAuction.lastUpdateTime = block.timestamp;  // 更新最后更新时间
    //     }
    // }

    function getCurrentPrice(uint256 auctionId) public view returns (uint256) {
        Auction storage auction = auctions[auctionId];
        require(auction.auctionType == AuctionType.DutchAuction, "Not a Dutch auction");
        
        if (block.timestamp >= auction.dutchAuction.auctionEndTime) {
            return auction.dutchAuction.endPrice;
        }
        
        uint256 elapsed = block.timestamp - auction.dutchAuction.lastUpdateTime;
        uint256 intervals = elapsed / auction.dutchAuction.decrementInterval;
        uint256 totalDecrement = intervals * auction.dutchAuction.priceDecrement;
        
        if (auction.dutchAuction.startingPrice - totalDecrement < auction.dutchAuction.endPrice) {
            return auction.dutchAuction.endPrice;
        }
        
        return auction.dutchAuction.startingPrice - totalDecrement;
    }

}
