// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/automation/KeeperCompatible.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AuctionManager is KeeperCompatibleInterface, Initializable, UUPSUpgradeable, AccessControlUpgradeable {

    // 定义拍卖类型
    enum AuctionType { DutchAuction, EnglishAuction }

    // 定义拍卖状态
    enum AuctionStatus { Registration, Ongoing, Ended }

    uint[] private auctions2End;
    uint[] private dutchAuctions2UpdatePrice;

    // 拍卖事件
    event AuctionStarted(uint auctionId, uint endTime);
    event AuctionEnded(uint auctionId, address winner, uint finalPrice);
    event DepositPaid(address participant, uint auctionId);
    event DepositRefunded(address participant, uint auctionId);
    event AuctionCreated(address creator, uint auctionId);
    event BidPlaced(uint auctionId, address bidder, uint currentPrice);
    event AuctionFailed(uint indexed auctionId);
    event PaymentTransferred(uint auctionId);
    event NFTTransferred(uint auctionId);

    IERC20 public myERC20Token;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

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

    function initialize(address initialAdmin, IERC20 _myERC20Token) public initializer {
        __AccessControl_init();
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ADMIN_ROLE, initialAdmin);
        myERC20Token = _myERC20Token;
    }

    // 创建英式拍卖
    function createEnglishAuction(
        uint _startingPrice,
        uint _reservePrice,
        uint _duration,
        uint _depositAmount,
        address _nftContract,
        uint _tokenId
    ) public {
        auctionCount++;
        uint auctionId = auctionCount;

        // 初始化英式拍卖
        Auction storage newAuction = auctions[auctionId];
        newAuction.seller = msg.sender;
        newAuction.nftContract = _nftContract;
        newAuction.tokenId = _tokenId;
        newAuction.auctionStatus = AuctionStatus.Registration;
        newAuction.depositAmount = _depositAmount;
        newAuction.auctionType = AuctionType.EnglishAuction;
        newAuction.duration = _duration;

        // 设置英式拍卖特有的字段
        newAuction.englishAuction.startingPrice = _startingPrice;
        newAuction.englishAuction.reservePrice = _reservePrice;
        newAuction.englishAuction.currentBid = 0; // 初始时没有出价

        emit AuctionCreated(msg.sender, auctionId);
    }

    // 创建荷兰拍卖, 前端授权
    function createDutchAuction(
        uint _startingPrice,
        uint _endPrice,
        uint _duration,
        uint _priceDecrement,
        uint _decrementInterval,
        uint _depositAmount,
        address _nftContract,
        uint _tokenId
    ) public {
        auctionCount++;
        uint auctionId = auctionCount;

        _auctionIdExist[auctionId] = true;
        // 初始化荷兰拍卖
        Auction storage newAuction = auctions[auctionId];
        newAuction.seller = msg.sender;
        newAuction.nftContract = _nftContract;
        newAuction.tokenId = _tokenId;
        newAuction.auctionStatus = AuctionStatus.Registration;
        newAuction.depositAmount = _depositAmount;
        newAuction.auctionType = AuctionType.DutchAuction;
        newAuction.duration = _duration;

        // 设置荷兰拍卖特有的字段
        newAuction.dutchAuction.startingPrice = _startingPrice;
        newAuction.dutchAuction.endPrice = _endPrice;
        newAuction.dutchAuction.currentPrice = _startingPrice;
        newAuction.dutchAuction.priceDecrement = _priceDecrement;
        newAuction.dutchAuction.decrementInterval = _decrementInterval;

        emit AuctionCreated(msg.sender, auctionId);
    }

    function startAuction(uint auctionId) public {
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        Auction storage auction = auctions[auctionId];
        require(msg.sender == auction.seller, "Only seller can start.");

        AuctionStatus auctionStatus = auction.auctionStatus;
        require(auctionStatus == AuctionStatus.Registration, "Auction already started.");

        AuctionType auctionType = auction.auctionType;
        uint _duration = auction.duration;

        auction.auctionStatus = AuctionStatus.Ongoing;
        uint _endTime = block.timestamp + _duration;

        if (auctionType == AuctionType.DutchAuction) {
            auction.dutchAuction.auctionEndTime = _endTime;
        } else  {
            auction.englishAuction.auctionEndTime = _endTime;
        }

        emit AuctionStarted(auctionId, _endTime);
    }

    // 竞标
    function bid(uint auctionId, uint amount) public {
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");

        Auction storage auction = auctions[auctionId];
        AuctionStatus auctionStatus = auction.auctionStatus;
        require(auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(auction.hasDeposited[msg.sender], "Deposit not paid");

        AuctionType auctionType = auction.auctionType;

        if (auctionType == AuctionType.DutchAuction) {
            // 荷兰拍卖
            auction.highestBidder = msg.sender;
            emit BidPlaced(auctionId, msg.sender, auction.dutchAuction.currentPrice);

        } else {
            // 英式拍卖
            require(amount > auction.englishAuction.currentBid, "Bid must be higher than the current bid");
            auction.englishAuction.currentBid = amount;
            auction.highestBidder = msg.sender;
            emit BidPlaced(auctionId, msg.sender, amount);
        }
    }

    // 缴纳押金, 前端需要帮助 授权
    function deposit(uint auctionId) public {
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");

        Auction storage auction = auctions[auctionId];
        AuctionStatus auctionStatus = auction.auctionStatus;
        require(auctionStatus == AuctionStatus.Registration, "Auction already started");

        uint amount = auction.depositAmount;
        // 转账押金
        require(myERC20Token.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // 记录押金
        auction.hasDeposited[msg.sender] = true;

        emit DepositPaid(msg.sender, auctionId);
    }

    // 结束拍卖
    function endAuction(uint auctionId) public {
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");

        address highestBidder = auction.highestBidder;
        if (highestBidder == address(0)) {
            emit  AuctionFailed(auctionId);
            return;
        }

        if (auction.auctionType == AuctionType.EnglishAuction) {
            auction.finalPrice = auction.englishAuction.currentBid;
        } else {
            auction.finalPrice = auction.dutchAuction.currentPrice;
        }

        require(auction.isPaymentTransferred == false, "Payment already Transfered.");
        require(auction.isNFTTransferred == false, "NFT already transfered.");
        auction.isPaymentTransferred = true;
        auction.isNFTTransferred = true;
        emit AuctionEnded(auctionId, auction.highestBidder, auction.finalPrice);


        // 将拍卖款项转给卖家
        require(myERC20Token.transfer(auction.seller, auction.finalPrice), "Transfer failed");
        // 转移NFT
        IERC721(auction.nftContract).safeTransferFrom(auction.seller, auction.highestBidder, auction.tokenId);

        emit PaymentTransferred(auctionId);
        emit NFTTransferred(auctionId);
        // 更新拍卖状态
        auction.auctionStatus = AuctionStatus.Ended;
    }

    function refundDeposit(uint auctionId) public {
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ended, "Auction not ended");
        require(auction.hasDeposited[msg.sender], "No deposit found");

        // 确保该用户没有成为赢家
        require(msg.sender != auction.highestBidder, "Winner cannot refund deposit");

        uint depositAmount = auction.depositAmount;
        auction.hasDeposited[msg.sender] = false;  // 标记押金已退还

        // 退还押金
        require(myERC20Token.transfer(msg.sender, depositAmount), "Refund failed");

        emit DepositRefunded(msg.sender, auctionId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}

    function checkUpkeep(bytes calldata /* checkData */) external override returns (bool upkeepNeeded, bytes memory /* performData */) {
        delete auctions2End;
        delete dutchAuctions2UpdatePrice;

        upkeepNeeded = false;

        for (uint i = 1; i <= auctionCount; i++) {
            Auction storage auction = auctions[i];

            if (auction.auctionStatus == AuctionStatus.Ongoing) {
                // 英式拍卖到达结束时间
                if (auction.auctionType == AuctionType.EnglishAuction &&
                    auction.englishAuction.auctionEndTime <= block.timestamp) {
                    upkeepNeeded = true;
                    auctions2End.push(i);  // 将需要结束的拍卖加入列表
                }

                // 荷兰拍卖需要更新价格，且未结束且有出价者
                if (auction.auctionType == AuctionType.DutchAuction) {
                    // 检查是否有最高出价者，若有，则认为拍卖结束
                    if (auction.highestBidder != address(0)) {
                        upkeepNeeded = true;
                        auctions2End.push(i);  // 如果有出价者，结束拍卖
                    }
                    // 如果拍卖未结束且价格可以更新，执行价格递减
                    else if (block.timestamp >= auction.dutchAuction.lastUpdateTime + auction.dutchAuction.decrementInterval &&
                        auction.dutchAuction.currentPrice > auction.dutchAuction.endPrice) {
                        upkeepNeeded = true;
                        dutchAuctions2UpdatePrice.push(i);  // 将需要更新价格的拍卖加入列表
                    }
                }
            }
        }
    }

    function performUpkeep(bytes calldata /* performData */) external override {
        // 结束所有符合条件的英式拍卖或荷兰拍卖（有出价者）
        for (uint i = 0; i < auctions2End.length; i++) {
            uint auctionId = auctions2End[i];
            endAuction(auctionId);  // 调用 endAuction 结束拍卖
        }

        // 更新所有符合条件的荷兰拍卖价格
        for (uint i = 0; i < dutchAuctions2UpdatePrice.length; i++) {
            uint auctionId = dutchAuctions2UpdatePrice[i];
            Auction storage auction = auctions[auctionId];

            // 降价
            auction.dutchAuction.currentPrice -= auction.dutchAuction.priceDecrement;
            auction.dutchAuction.lastUpdateTime = block.timestamp;  // 更新最后更新时间
        }
    }

}
