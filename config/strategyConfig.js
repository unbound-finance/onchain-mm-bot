var Web3 = require('web3');
require('dotenv').config();
const ABI = require("./abi");

const BSC_NETWORK_DETAILS = {
    networkName: "BSC",
    networkRPC: "https://bsc-dataseed1.binance.org",
    chainId: 56,
    web3Object: undefined
};

const ARBITRUM_NETWORK_DETAILS = {
    networkName: "Arbitrum",
    networkRPC: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    web3Object: undefined
};

// config for strategy 0
const STRATEGY_0 = {
    description: "UNB/BNB Strategy",
    strategyAddress: "0x3A4Ea286af31CA181F1757Cf7eDbD4355f0360b5",
    poolAddress: "0x508aCF810857FeFa86281499068AD5D19ebcE325",
    networkDetails: BSC_NETWORK_DETAILS,
    strategyInstance: undefined, // will be initialized later
    poolInstance: undefined,  // will be initialized later
    account: process.env.STRATEGY_0_ADDRESS, // read from .env file
    pKey: Buffer.from(process.env.STRATEGY_0_KEY, 'hex'), // read from .env file
    strategyParams: {
        // Pool params
        SPACING: 200,
        DEC_DELTA: 0, // this is directional if x is gov token then standard else negative of this
        // For amount0, amount1 conversion
        DEC_STR0: "1000000000000000000", // 18 decimals - UNB
        DEC_STR1: "1000000000000000000", // 18 decimals - WBNB

        // Strategy params
        SPACING_MULT: 1, // width of liquidity is SPACING * SPACING_MULT
        LOWER_TRIG: 0.2, // trigger rebalance when 80% of liquidity is eaten
        UPPER_TRIG: 0.2,
        UPPER_THETA: 1.05, // liquidity increases by 10% to the right
        // const LOWER_THETA = 1.0 / UPPER_THETA; // THIS IS TO AVOID FRONTING
        LOWER_THETA: 0.9,
        LIQ: 33852, // liquidity at the price below 
        BASE_SQRT_PRICE: (181456988882692797038668774.0 / (2 ** 96)), //current sqrt price (set at the beginning/not to be queried)
        MIN_SUPPORTED_SQRT_PRICE: Math.sqrt(0.002 / 320), // min supported price (can be > current_price, in which can only upward moves supported until this level is reached)
        MAX_SUPPORTED_SQRT_PRICE: Math.sqrt(0.003 / 320) // see above
    },
    priceFunction: function (sqrtPriceX96) { return sqrtPriceX96 / (2 ** 96); }
}

// config for strategy 1
const STRATEGY_1 = {
    description: "SIS/USDC Strategy",
    strategyAddress: "0xbf8A5E9A79ABD1Cf0B7C95A78361e46D26690382",
    poolAddress: "0x951D46725B8d31DebE5e1BDafcc02d64B7FB6774",
    networkDetails: ARBITRUM_NETWORK_DETAILS,
    strategyInstance: undefined,
    poolInstance: undefined,
    account: process.env.STRATEGY_1_ADDRESS, // account address of the manager who can rebalance in this strategy -  read from .env file
    pKey: Buffer.from(process.env.STRATEGY_1_KEY, 'hex'), // privatekey of above account - read from .env file
    strategyParams: {
        //Pool params
        SPACING: 200,
        DEC_DELTA: 12,
        DEC_STR0: "1000000000000000000",
        DEC_STR1: "1000000",

        // Strat params
        SPACING_MULT: 1,
        LOWER_TRIG: 0.2,
        UPPER_TRIG: 0.2,
        UPPER_THETA: 1.1347,
        LOWER_THETA: 1 / 1.1347,
        LIQ: 806.384,
        BASE_SQRT_PRICE: 33979032160979408925259.0 * (10 ** 6) / 2 ** 96,
        MIN_SUPPORTED_SQRT_PRICE: Math.sqrt(0.20),
        MAX_SUPPORTED_SQRT_PRICE: Math.sqrt(0.26)
    },
    priceFunction: function (sqrtPriceX96) { return sqrtPriceX96 * (10 ** 6) / (2 ** 96); }
}

// init web3 object
BSC_NETWORK_DETAILS.web3Object = new Web3(new Web3.providers.HttpProvider(BSC_NETWORK_DETAILS.networkRPC));
ARBITRUM_NETWORK_DETAILS.web3Object = new Web3(new Web3.providers.HttpProvider(ARBITRUM_NETWORK_DETAILS.networkRPC));

// init strategy and pool instance for strategy 0
STRATEGY_0.strategyInstance = new STRATEGY_0.networkDetails.web3Object.eth.Contract(ABI.DEFIEDGE_STRATEGY_ABI, STRATEGY_0.strategyAddress)
STRATEGY_0.poolInstance = new STRATEGY_0.networkDetails.web3Object.eth.Contract(ABI.UNIV3_POOL_ABI, STRATEGY_0.poolAddress)

// init strategy and pool instance for strategy 1
STRATEGY_1.strategyInstance = new STRATEGY_1.networkDetails.web3Object.eth.Contract(ABI.DEFIEDGE_STRATEGY_ABI, STRATEGY_1.strategyAddress)
STRATEGY_1.poolInstance = new STRATEGY_1.networkDetails.web3Object.eth.Contract(ABI.UNIV3_POOL_ABI, STRATEGY_1.poolAddress)

module.exports = {
    STRATEGIES: [STRATEGY_0, STRATEGY_1]
}