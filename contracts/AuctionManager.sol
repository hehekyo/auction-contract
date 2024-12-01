// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@chainlink/contracts/src/v0.8/automation/KeeperCompatible.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

contract AuctionManager is Initializable, UUPSUpgradeable, AccessControlUpgradeable, OwnableUpgradeable {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    function initialize(
        address initialAdmin, 
        IERC20 _daToken
    ) public initializer {
        __AccessControl_init();
        __Ownable_init(initialAdmin);
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE, initialAdmin);
        daToken = _daToken;
        feeRate = 500;
    }

    // 定义拍卖类型
    enum AuctionType { EnglishAuction,DutchAuction}
    // 定义拍卖状态
    enum AuctionStatus { 
        Ongoing,      // 进行中
        Succeeded,    // 成功结束（有人中标）
        Failed,       // 失败结束（无人中标或未达到保留价）
        Cancelled     // 取消结束
    }

    uint[] private auctions2End;
    uint[] private dutchAuctions2UpdatePrice;

    

    IERC20 public daToken;

    struct Auction {
        // 基本信息
        AuctionType auctionType;
        AuctionStatus auctionStatus;
        address seller;
        address winner;
        
        // NFT 信息
        address nftContract;
        uint tokenId;
        string tokenURI;
        
        // 时间相关
        uint startTime;
        uint endTime;
        uint duration;
        
        // 通用价格信息
        uint startingPrice;
        uint currentPrice;
        uint finalPrice;
        uint depositAmount;
        
        // 英式拍卖特有
        uint currentBid;
        uint reservePrice;
        
        // 荷兰拍卖特有
        uint minimumPrice;
        uint priceDecrement;
        uint decrementInterval;
        uint lastUpdateTime;
        
        // 状态标记
        mapping(address => bool) hasDeposited;
        bool isPaymentTransferred;
        bool isNFTTransferred;
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

// 拍卖事件
    event AuctionStarted(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        string tokenURI,
        AuctionType auctionType,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 duration,
        uint256 depositAmount,
        uint256 startTime,
        uint256 endTime
    );

    event AuctionEnded(
        uint indexed auctionId,
        address winner,
        uint finalPrice,
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


    event NFTTransferred(
        uint indexed auctionId,
        address indexed from,
        address indexed to,
        address nftContract,
        uint256 tokenId,
        uint256 timestamp
    );

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
            require(reservePrice <= startingPrice, "Reserve price must be <= starting price");
        } else if (auctionType == AuctionType.DutchAuction) {
            require(priceDecrement > 0, "Dutch auction must have price decrement");
            require(decrementInterval > 0, "Dutch auction must have decrement interval");
            require(duration >= decrementInterval, "Duration too short for price decrements");
            require(startingPrice > reservePrice, "Starting price must be greater than minimum price");
        }

        auctionCount++;
        uint auctionId = auctionCount;
        _auctionIdExist[auctionId] = true;

        Auction storage newAuction = auctions[auctionId];
        
        // 基本信息
        newAuction.auctionType = auctionType;
        newAuction.auctionStatus = AuctionStatus.Ongoing;
        newAuction.seller = msg.sender;
        newAuction.winner = address(0);
        
        // NFT 信息
        newAuction.nftContract = nftContract;
        newAuction.tokenId = tokenId;
        
        // 时间相关
        newAuction.startTime = block.timestamp;
        newAuction.endTime = block.timestamp + duration;
        newAuction.duration = duration;
        
        // 通用价格信息
        newAuction.startingPrice = startingPrice;
        newAuction.currentPrice = startingPrice;
        newAuction.depositAmount = depositAmount;

        if (auctionType == AuctionType.EnglishAuction) {
            // 英式拍卖特有
            newAuction.currentBid = 0;
            newAuction.reservePrice = reservePrice;
        } else {
            // 荷兰拍卖特有
            newAuction.minimumPrice = reservePrice;
            newAuction.priceDecrement = priceDecrement;
            newAuction.decrementInterval = decrementInterval;
            newAuction.lastUpdateTime = block.timestamp;
        }

        // 获取 NFT 的 tokenURI
        string memory tokenURI = IERC721Metadata(nftContract).tokenURI(tokenId);
        newAuction.tokenURI = tokenURI;    // 存储 tokenURI

        // 转移 NFT 到合约
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit AuctionStarted(
            auctionId,
            msg.sender,
            nftContract,
            tokenId,
            tokenURI,
            auctionType,
            startingPrice,
            reservePrice,
            duration,
            depositAmount,
            block.timestamp,
            newAuction.endTime
        );
    }

    // 竞标
    function bid(uint auctionId, uint amount) public {
        // 基本检查
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        require(msg.sender != address(0), "Invalid bidder address");

        Auction storage auction = auctions[auctionId];
        
        // 状态检查
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction not ongoing");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(auction.hasDeposited[msg.sender], "Deposit not paid");

        // 时间检查
        if (auction.auctionType == AuctionType.EnglishAuction) {
            require(block.timestamp < auction.endTime, "Auction has ended");
        } else {
            require(block.timestamp < auction.endTime, "Auction has ended");
        }

        // 拍卖类型特定检查
        if (auction.auctionType == AuctionType.DutchAuction) {
            // 荷兰拍卖检查
            require(auction.winner == address(0), "Dutch auction already has a bidder");
            require(amount == auction.currentPrice, "Bid must equal current price");
            
            // 检查用户是否有足够的代币余额
            require(daToken.balanceOf(msg.sender) >= amount, "Insufficient token balance");
            // 检查用户是否已经授权合约使用足够的代币
            require(daToken.allowance(msg.sender, address(this)) >= amount, "Insufficient token allowance");

            // 更新拍卖状态
            auction.winner = msg.sender;
            auction.finalPrice = amount;
            
            emit BidPlaced(auctionId, msg.sender, amount, block.timestamp);

        } else {
            // 英式拍卖检查
            require(amount > auction.currentBid, "Bid must be higher than current bid");
            require(amount >= auction.startingPrice, "Bid must be at least starting price");
            
            // 如果不是第一个出价，要求新出价须高于当前出价一定比例（例如1%）
            if (auction.currentBid > 0) {
                require(amount >= auction.currentBid + (auction.currentBid / 100), 
                    "Bid increment too small");
            }

            // 检查用户是否有足够的代币余额
            require(daToken.balanceOf(msg.sender) >= amount, "Insufficient token balance");
            // 检查用户是否已经授权合约使用足够的代币
            require(daToken.allowance(msg.sender, address(this)) >= amount, "Insufficient token allowance");

            // 更新拍卖状态
            if (auction.winner != address(0)) {
                // 如果存在之前的最高出价者，退还其出价
                require(daToken.transfer(auction.winner, auction.currentBid), 
                    "Failed to refund previous bidder");
            }

            auction.currentBid = amount;
            auction.winner = msg.sender;
            
            emit BidPlaced(auctionId, msg.sender, amount, block.timestamp);
        }

        // 转移竞标金额到合约
        require(daToken.transferFrom(msg.sender, address(this), amount), 
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
        require(block.timestamp < auction.endTime, "Auction has ended");

        // 荷兰拍卖特殊检查
        if (auction.auctionType == AuctionType.DutchAuction) {
            require(auction.winner == address(0), "Dutch auction already has a winner");
        }

        // 代币相关检查
        require(address(daToken) != address(0), "Token not initialized");
        uint depositAmount = auction.depositAmount;

        // 余额检查
        uint userBalance = daToken.balanceOf(msg.sender);
        require(userBalance >= depositAmount, "Insufficient token balance");
        
        // 授权检
        uint allowance = daToken.allowance(msg.sender, address(this));
        require(allowance >= depositAmount, "Insufficient token allowance");

        // 安全转账
        require(daToken.transferFrom(msg.sender, address(this), depositAmount), 
            "Deposit transfer failed");

        // 更新状态
        auction.hasDeposited[msg.sender] = true;

        // 触发事件
        emit DepositHandled(auctionId, msg.sender, depositAmount, true, block.timestamp);
    }

    // 结束拍卖
    function endAuction(uint auctionId) public {
        Auction storage auction = auctions[auctionId];
        require(auction.endTime <= block.timestamp, "Auction not ended");
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction not ongoing");

        if (auction.auctionType == AuctionType.EnglishAuction) {
            if (auction.currentBid < auction.reservePrice) {
                // 未达到最低成交价，拍卖失败
                auction.auctionStatus = AuctionStatus.Failed;
                // 退还最高出价者的保证金和出价
                if (auction.winner != address(0)) {
                    require(daToken.transfer(auction.winner, auction.currentBid), 
                        "Failed to refund winner");
                }
                // 退还卖家的 NFT
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.seller,
                    auction.tokenId
                );
                emit AuctionEnded(
                    auctionId,
                    auction.winner,
                    auction.finalPrice,
                    block.timestamp    // 使用当前时间戳
                );
            } else {
                // 达到最低成交价，完成拍卖
                _completeAuction(auctionId);
            }
        } else if (auction.auctionType == AuctionType.DutchAuction) {
            // 荷兰拍卖检查最低价格
            uint currentPrice = getCurrentPrice(auctionId);
            require(currentPrice >= auction.minimumPrice, "Price below minimum");
            
            if (auction.winner == address(0)) {
                // 无人购买，拍卖失败
                auction.auctionStatus = AuctionStatus.Failed;
                // 退还卖家的 NFT
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.seller,
                    auction.tokenId
                );
                emit AuctionEnded(
                    auctionId,
                    auction.winner,
                    auction.finalPrice,
                    block.timestamp    // 使用当前时间戳
                );
            } else {
                // 有人购买完成拍卖
                _completeAuction(auctionId);
            }
        }
    }

    // 获取荷兰拍卖当前价格
    function getCurrentPrice(uint auctionId) public view returns (uint) {
        Auction storage auction = auctions[auctionId];
        require(auction.auctionType == AuctionType.DutchAuction, "Not Dutch auction");
        
        if (block.timestamp >= auction.endTime) {
            return auction.currentPrice;
        }
        
        uint256 elapsed = block.timestamp - auction.lastUpdateTime;
        uint256 intervals = elapsed / auction.decrementInterval;
        uint256 totalDecrement = intervals * auction.priceDecrement;
        
        if (auction.startingPrice - totalDecrement < auction.minimumPrice) {
            return auction.minimumPrice;
        }
        
        return auction.startingPrice - totalDecrement;
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
        
        auction.auctionStatus = AuctionStatus.Cancelled;
        
        // 如果有出价，退还出价
        if (auction.winner != address(0)) {
            if (auction.auctionType == AuctionType.EnglishAuction) {
                require(daToken.transfer(auction.winner, 
                    auction.currentBid), "Refund failed");
            } else {
                require(daToken.transfer(auction.winner, 
                    auction.currentPrice), "Refund failed");
            }
        }
        
        emit AuctionCancelled(auctionId, msg.sender, "Emergency cancellation", block.timestamp);
    }

    function refundDeposit(uint auctionId) public nonReentrant {
        // 基本检查
        require(_auctionIdExist[auctionId], "Auction does not exist");
        require(msg.sender != address(0), "Invalid address");

        Auction storage auction = auctions[auctionId];
        
        // 状态检查
        // 检查拍卖是否已结束（成功或失败）
        require(
            auction.auctionStatus == AuctionStatus.Succeeded || 
            auction.auctionStatus == AuctionStatus.Failed ||
            auction.auctionStatus == AuctionStatus.Cancelled,
            "Auction still ongoing"
        );
        require(auction.hasDeposited[msg.sender], "No deposit found");

        // 确保该用户没有成为赢家
        require(msg.sender != auction.winner, "Winner cannot refund deposit");

        // 检查是否已经退还过
        require(auction.hasDeposited[msg.sender], "Deposit already refunded");

        // 获取押金金额
        uint depositAmount = auction.depositAmount;
        require(depositAmount > 0, "Invalid deposit amount");

        // 检查合约余额
        require(daToken.balanceOf(address(this)) >= depositAmount, 
            "Insufficient contract balance");

        // 先修改状态再转账（防止重入攻击）
        auction.hasDeposited[msg.sender] = false;

        // 安全转账
        bool success = daToken.transfer(msg.sender, depositAmount);
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
         // 检查拍卖是否已结束（成功或失败）
        require(
            auction.auctionStatus == AuctionStatus.Succeeded || 
            auction.auctionStatus == AuctionStatus.Failed ||
            auction.auctionStatus == AuctionStatus.Cancelled,
            "Auction still ongoing"
        );


        for (uint i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            if (depositor != address(0) && 
                auction.hasDeposited[depositor] && 
                depositor != auction.winner) {
                
                uint depositAmount = auction.depositAmount;
                auction.hasDeposited[depositor] = false;
                
                bool success = daToken.transfer(depositor, depositAmount);
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
        
        if (token == address(daToken)) {
            require(daToken.transfer(to, amount), "Transfer failed");
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
    //                 if (auction.winner != address(0)) {
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

    // ��部函数：完��拍卖
    function _completeAuction(uint auctionId) internal {
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction not ongoing");
        
        if (auction.auctionType == AuctionType.EnglishAuction) {
            if (auction.currentBid >= auction.reservePrice) {
                // 达到保留价，拍卖成功
                auction.auctionStatus = AuctionStatus.Succeeded;
                auction.finalPrice = auction.currentBid;  // 设置最终价格
                
                // 计算手续费
                uint feeAmount = calculateFee(auction.finalPrice);
                uint sellerAmount = auction.finalPrice - feeAmount;
                
                // 转移 NFT 给最高出价者
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.winner,
                    auction.tokenId
                );
                auction.isNFTTransferred = true;

                // 转移代币给卖家（扣除手续费）
                daToken.transfer(auction.seller, sellerAmount);
                // 转移手续费给管理员
                daToken.transfer(owner(), feeAmount);
                
                auction.isPaymentTransferred = true;

                emit AuctionEnded(
                    auctionId,
                    auction.winner,
                    auction.finalPrice,
                    block.timestamp
                );
                emit FeeCollected(auctionId, feeAmount);
            } else {
                // 未达到保留价，拍卖失败
                auction.auctionStatus = AuctionStatus.Failed;
                
                // 退还 NFT 给卖家
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.seller,
                    auction.tokenId
                );
                auction.isNFTTransferred = true;

                emit AuctionEnded(
                    auctionId,
                    address(0),
                    0,
                    block.timestamp
                );
            }
        } else if (auction.auctionType == AuctionType.DutchAuction) {
            if (auction.winner != address(0) && auction.currentPrice >= auction.minimumPrice) {
                // 有人购买且价格合适，拍卖成功
                auction.auctionStatus = AuctionStatus.Succeeded;
                auction.finalPrice = auction.currentPrice;  // 设置最终价格
                
                // 计算手续费
                uint feeAmount = calculateFee(auction.finalPrice);
                uint sellerAmount = auction.finalPrice - feeAmount;
                
                // 转移 NFT 给购买者
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.winner,
                    auction.tokenId
                );
                auction.isNFTTransferred = true;

                // 转移代币给卖家（扣除手续费）
                daToken.transfer(auction.seller, sellerAmount);
                // 转移手续费给管理员
                daToken.transfer(owner(), feeAmount);
                
                auction.isPaymentTransferred = true;

                emit AuctionEnded(
                    auctionId,
                    auction.winner,
                    auction.finalPrice,
                    block.timestamp
                );
                emit FeeCollected(auctionId, feeAmount);
            } else {
                // 无人购买或价格过低，拍卖失败
                auction.auctionStatus = AuctionStatus.Failed;
                
                // 退还 NFT 给卖家
                IERC721(auction.nftContract).transferFrom(
                    address(this),
                    auction.seller,
                    auction.tokenId
                );
                auction.isNFTTransferred = true;

                emit AuctionEnded(
                    auctionId,
                    address(0),
                    0,
                    block.timestamp
                );
            }
        }
    }


    // 手续费相关
    uint public feeRate; // 移除初始值
    uint public constant MAX_FEE_RATE = 2000; // 最大 20%

    event FeeRateUpdated(uint oldFeeRate, uint newFeeRate);
    event FeeCollected(uint auctionId, uint amount);

    function setFeeRate(uint newFeeRate) external onlyRole(ADMIN_ROLE) {
        require(newFeeRate <= MAX_FEE_RATE, "Fee rate too high");
        uint oldFeeRate = feeRate;
        feeRate = newFeeRate;
        emit FeeRateUpdated(oldFeeRate, newFeeRate);
    }

    // 计算手续费
    function calculateFee(uint amount) public view returns (uint) {
        return amount * feeRate / 10000;
    }

    function withdrawDeposit(uint auctionId) public nonReentrant {
        Auction storage auction = auctions[auctionId];
        // 检查拍卖是否已结束（成功或失败）
        require(
            auction.auctionStatus == AuctionStatus.Succeeded || 
            auction.auctionStatus == AuctionStatus.Failed ||
            auction.auctionStatus == AuctionStatus.Cancelled,
            "Auction still ongoing"
        );
        require(auction.hasDeposited[msg.sender], "No deposit found");
        require(msg.sender != auction.winner, "Winner cannot withdraw deposit");

        // 退还保证金
        auction.hasDeposited[msg.sender] = false;
        require(daToken.transfer(msg.sender, auction.depositAmount), "Transfer failed");

        emit DepositHandled(
            auctionId,
            msg.sender,
            auction.depositAmount,
            false,  // false 表示退还
            block.timestamp
        );
    }

}
