import { HardhatUserConfig } from "hardhat/types";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INFURA_API_KEY = process.env.INFURA_API_KEY;

const config: HardhatUserConfig = {
  solidity: {
      compilers: [
        {
          version: "0.8.22",
          settings: {
            optimizer: {
              enabled: true,
              runs: 200,
            },
            viaIR: true,
          },
        },
      ],
    },
  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    }
  }
};

export default config;
