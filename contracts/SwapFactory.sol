// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.22;

import {ISwapFactory} from "./interfaces/ISwapFactory.sol";
import {ISwapPair} from "./interfaces/ISwapPair.sol";
import {SwapPair} from "./SwapPair.sol";

contract SwapFactory is ISwapFactory {
    bytes32 public constant PAIR_HASH =
        keccak256(type(SwapPair).creationCode);

    address public override feeTo;
    address public override feeToSetter;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function createPair(
        address tokenA,
        address tokenB
    ) external override returns (address pair) {
        require(tokenA != tokenB, "Swap: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "Swap: ZERO_ADDRESS");
        require(
            getPair[token0][token1] == address(0),
            "Swap: PAIR_EXISTS"
        ); // single check is sufficient

        pair = address(
            new SwapPair{
                salt: keccak256(abi.encodePacked(token0, token1))
            }()
        );
        ISwapPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "Swap: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "Swap: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}