import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

import * as dotenv from "dotenv";
dotenv.config();

// tasks
import "./src/tasks/accounts";

const config: HardhatUserConfig = {
  networks: {
    hardhat:{
      chainId:1337
    },
    ganache: {
      url: "http://127.0.0.1:8545",
      accounts: [
        "0x094725e32b07849e90451a28eea107eba50d9f4ab43995ba2d41d12aacd55744",
      ],
    },
  },
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 9999,
      },
      metadata: {
        bytecodeHash: "none",
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  paths: {
    tests: "./src/test",
  },
};

export default config;
