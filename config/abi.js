
const UNIV3_POOL_ABI = [{
    "inputs":[],
    "name":"slot0",
    "outputs":[{
        "internalType":"uint160",
        "name":"sqrtPriceX96",
        "type":"uint160"
      },
      {
        "internalType":"int24",
        "name":"tick",
        "type":"int24"
      },
      {
        "internalType":"uint16",
        "name":"observationIndex",
        "type":"uint16"
      },
      {
        "internalType":"uint16",
        "name":"observationCardinality",
        "type":"uint16"
      },
      {
        "internalType":"uint16",
        "name":"observationCardinalityNext",
        "type":"uint16"
      },
      {
        "internalType":"uint8",
        "name":"feeProtocol",
        "type":"uint8"
      },
      {
        "internalType":"bool",
        "name":"unlocked",
        "type":"bool"
      }],
    "stateMutability":"view",
    "type":"function"
    },
    {
      "inputs":[],
      "name":"tickSpacing",
      "outputs":[{
        "internalType":"int24",
        "name":"",
        "type":"int24"
      }],
      "stateMutability":"view",
      "type":"function"
    },
    {
      "inputs":[],
      "name":"fee",
      "outputs":[{
        "internalType":"uint24",
        "name":"",
        "type":"uint24"
      }],
      "stateMutability":"view",
      "type":"function"
      },
      {
        "inputs": [],
        "name": "liquidity",
        "outputs": [
          {
            "internalType": "uint128",
            "name": "",
            "type": "uint128"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }]

const DEFIEDGE_STRATEGY_ABI = [{
  "inputs": [
    {
      "internalType": "bytes",
      "name": "_swapData",
      "type": "bytes"
    },
    {
      "components": [
        {
          "internalType": "uint256",
          "name": "index",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "burn",
          "type": "bool"
        },
        {
          "internalType": "uint256",
          "name": "amount0",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "amount1",
          "type": "uint256"
        }
      ],
      "internalType": "struct DefiEdgeStrategy.PartialTick[]",
      "name": "_existingTicks",
      "type": "tuple[]"
    },
    {
      "components": [
        {
          "internalType": "int24",
          "name": "tickLower",
          "type": "int24"
        },
        {
          "internalType": "int24",
          "name": "tickUpper",
          "type": "int24"
        },
        {
          "internalType": "uint256",
          "name": "amount0",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "amount1",
          "type": "uint256"
        }
      ],
      "internalType": "struct DefiEdgeStrategy.NewTick[]",
      "name": "_newTicks",
      "type": "tuple[]"
    },
    {
      "internalType": "bool",
      "name": "_burnAll",
      "type": "bool"
    }
  ],
  "name": "rebalance",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "inputs": [],
  "name": "getTicks",
  "outputs": [
    {
      "components": [
        {
          "internalType": "int24",
          "name": "tickLower",
          "type": "int24"
        },
        {
          "internalType": "int24",
          "name": "tickUpper",
          "type": "int24"
        }
      ],
      "internalType": "struct IStrategyBase.Tick[]",
      "name": "",
      "type": "tuple[]"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
]

module.exports = {
    UNIV3_POOL_ABI,
    DEFIEDGE_STRATEGY_ABI,
}