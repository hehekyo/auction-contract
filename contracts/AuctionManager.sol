// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@chainlink/contracts/src/v0.8/automation/KeeperCompatible.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

/*
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract PriceConsumer {
    AggregatorV3Interface internal priceFeed;

    // 初始化时传入预言机地址
    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    // 获取价格
    function getLatestPrice() public view returns (int) {
        (, int price, , , ) = priceFeed.latestRoundData();
        return price;
    }
}
*/

//0xb41b78Ce3D1BDEDE48A3d303eD2564F6d1F6fff0

//0x1238536071E1c677A632429e3655c799b22cDA52 NFT 代币ID: 25405

//const routerAddress = "0xb41b78Ce3D1BDEDE48A3d303eD2564F6d1F6fff0";  // 你要测试的路由合约地址
//const token0Address = "0xe7be684EfF97FcEe715Ab2a8B8FA52f261e72800";  // 你池子中的 token0 地址
//const token1Address = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";  // 你池子中的 token1 地址

contract AuctionManager is KeeperCompatibleInterface, Initializable, UUPSUpgradeable, AccessControlUpgradeable {

    //ISwapRouter public swapRouter; 
    //address public myERC20;
    //address public ETHToken;

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
        //swapRouter = ISwapRouter(0xb41b78Ce3D1BDEDE48A3d303eD2564F6d1F6fff0);
        //myERC20 = 0xe7be684EfF97FcEe715Ab2a8B8FA52f261e72800; // myERC20代币地址（硬编码）
        //ETHToken = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14; // ETH地址（硬编码）
    }

    /*
    // 更新 swapRouter 地址
    function setSwapRouter(address _swapRouter) external onlyRole(ADMIN_ROLE) {
        swapRouter = ISwapRouter(_swapRouter);
    }

    // 更新 myERC20 地址
    function setMyERC20(address _myERC20) external onlyRole(ADMIN_ROLE) {
        myERC20 = _myERC20;
    }

    // 更新 ETH 地址
    function setETH(address _ETH) external onlyRole(ADMIN_ROLE) {
        ETHToken = _ETH;
    }

    // 执行代币交换的方法
    function swapExactInputSingle(uint256 amountIn) external returns (uint256 amountOut) {
        // 1. 从用户钱包转移 `token0` 到合约
        IERC20(ETHToken).transferFrom(msg.sender, address(this), amountIn);

        // 2. 授权 SwapRouter 使用 `token0`
        IERC20(ETHToken).approve(address(swapRouter), amountIn);

        // 3. 设置 Uniswap V3 交换参数
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: ETHToken,
            tokenOut: myERC20,
            fee: 3000, // 这里使用 0.3% 的手续费等级，常见的有 500 (0.05%), 3000 (0.3%), 10000 (1%)
            recipient: msg.sender,
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: 0, // 最小接受数量（可设置为 0 表示接受任意数量）
            sqrtPriceLimitX96: 0 // 价格限制，0 表示没有限制
        });

        // 4. 调用 SwapRouter 的 swap 方法
        amountOut = swapRouter.exactInputSingle(params);
    }
    */

    // 创建英式拍卖
    function createEnglishAuction(
        uint _startingPrice,
        uint _reservePrice,
        uint _duration,
        //uint _depositAmount,
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
        newAuction.depositAmount = 100; //_depositAmount;
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
        //uint _depositAmount,
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
        newAuction.depositAmount = 100; //_depositAmount;
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

        require(auction.auctionStatus == AuctionStatus.Registration, "Auction already started.");

        auction.auctionStatus = AuctionStatus.Ongoing;
        
        uint _endTime = block.timestamp + auction.duration;

        if (auction.auctionType == AuctionType.DutchAuction) {
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

        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(auction.hasDeposited[msg.sender], "Deposit not paid");

        if (auction.auctionType == AuctionType.DutchAuction) {
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

        require(auction.auctionStatus == AuctionStatus.Registration || auction.auctionStatus == AuctionStatus.Ongoing, "Auction already started"); // 准备阶段 和 开始阶段都可以交押金

        // 转账押金
        require(myERC20Token.transferFrom(msg.sender, address(this), auction.depositAmount), "Transfer failed");

        // 记录押金
        auction.hasDeposited[msg.sender] = true;

        emit DepositPaid(msg.sender, auctionId);
    }

    // 结束拍卖
    function endAuction(uint auctionId) public {
        require(_auctionIdExist[auctionId] == true, "Auction does not exist");
        Auction storage auction = auctions[auctionId];
        require(auction.auctionStatus == AuctionStatus.Ongoing, "Auction is not ongoing");

        if (auction.highestBidder == address(0)) {
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

        auction.hasDeposited[msg.sender] = false;  // 标记押金已退还

        // 退还押金
        require(myERC20Token.transfer(msg.sender, auction.depositAmount), "Refund failed");

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
            endAuction(auctions2End[i]);  // 调用 endAuction 结束拍卖
        }

        // 更新所有符合条件的荷兰拍卖价格
        for (uint i = 0; i < dutchAuctions2UpdatePrice.length; i++) {
            Auction storage auction = auctions[dutchAuctions2UpdatePrice[i]];

            // 降价
            auction.dutchAuction.currentPrice -= auction.dutchAuction.priceDecrement;
            auction.dutchAuction.lastUpdateTime = block.timestamp;  // 更新最后更新时间
        }
    }

    function addAdmin(address newAdmin) public onlyRole(ADMIN_ROLE) {
        grantRole(ADMIN_ROLE, newAdmin);
    }
    function removeAdmin(address admin) public onlyRole(ADMIN_ROLE) {
        revokeRole(ADMIN_ROLE, admin);
    }

}
