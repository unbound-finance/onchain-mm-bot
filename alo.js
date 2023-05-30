var Web3 = require('web3');
const axios = require("axios")
var bn = require('bignumber.js')
var fs = require("fs");
const ABI = require("./config/abi");
const web3Lib = require('./utils/web3');
require('dotenv').config();

const OPTIMISM_NETWORK_DETAILS = {
    networkName: "optimism",
    networkRPC: "https://1rpc.io/op",
    chainId: 10,
    web3Object: undefined
};

const ARBITRUM_NETWORK_DETAILS = {
    networkName: "arbitrum",
    networkRPC: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    web3Object: undefined
};

const POLYGON_NETWORK_DETAILS = {
    networkName: "Polygon",
    networkRPC: "https://polygon-rpc.com", 
    chainId: 137, 
    web3Object: undefined
}


OPTIMISM_NETWORK_DETAILS.web3Object = new Web3(new Web3.providers.HttpProvider(OPTIMISM_NETWORK_DETAILS.networkRPC));
ARBITRUM_NETWORK_DETAILS.web3Object = new Web3(new Web3.providers.HttpProvider(ARBITRUM_NETWORK_DETAILS.networkRPC));
POLYGON_NETWORK_DETAILS.web3Object = new Web3(new Web3.providers.HttpProvider(POLYGON_NETWORK_DETAILS.networkRPC))

const ETHSNX = {
    id: "0x9a42f5bd1397b142e3ebc0d29ef50ac7ec22b8f0",
    poolAddress: "0x0392b358CE4547601BEFa962680BedE836606ae2",
    liquidation_date: '2023-09-15',
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
    networkDetails: OPTIMISM_NETWORK_DETAILS,
    account: process.env.ALO_ADDR_1, // strategy manager address
    pkey: Buffer.from(process.env.ALO_PKEY_1, 'hex') // strategy manager address key
}

const ETHVSTA = {
    id: "0xd5ab558dc523d5cebea69164aa555455da5e73b6",
    poolAddress: "0x3C711D3B25aE5C37eE38afc10B589C3bC6419EdF",
    liquidation_date: '2023-09-15',
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
    networkDetails: ARBITRUM_NETWORK_DETAILS,
    account: process.env.ALO_ADDR_2, // strategy manager address
    pkey: Buffer.from(process.env.ALO_PKEY_2, 'hex') // strategy manager address key
} 

const ETHUSDCARB = {
    id: "0xca57b794942de3dfb975f689b8108d326b503e24", 
    poolAddress: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
    liquidation_date: null,
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000", // 6
    networkDetails: ARBITRUM_NETWORK_DETAILS, 
    account: process.env.BCALO_ETH_USDC_ARB_ADDR,
    pkey: Buffer.from(process.env.BCALO_ETH_USDC_ARB_PKEY, 'hex')
}

const MATICETHPOLY = {
    id: "0xb3cbbd72117722bfac2506c1af8d61f24e7c5826", 
    poolAddress: "0x86f1d8390222a3691c28938ec7404a1661e618e0",
    liquidation_date: null,
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
    networkDetails: POLYGON_NETWORK_DETAILS,
    account: process.env.BCALO_MATIC_ETH_POLY_ADDR,
    pkey: Buffer.from(process.env.BCALO_MATIC_ETH_POLY_PKEY, 'hex')
}

const LINKETHPOLY = {
    id: "0xc79f5e8804b57eff9b26c5ad2c40cd837d53dad6", 
    poolAddress: "0x3e31ab7f37c048fc6574189135d108df80f0ea26", 
    liquidation_date: null, 
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
    networkDetails: POLYGON_NETWORK_DETAILS,
    account: process.env.BCALO_LINK_ETH_POLY_ADDR,
    pkey: Buffer.from(process.env.BCALO_LINK_ETH_POLY_PKEY, 'hex')
}

var strategies = [
    ETHSNX, 
    ETHVSTA,
    ETHUSDCARB, 
    MATICETHPOLY, 
    LINKETHPOLY
]

function get_new_ticks(ranges, DEC_STR0, DEC_STR1) {
    var newTicks = new Array();

    for (let i = 0; i < ranges.length; i++) {
        let range_this = ranges[i];
        let newTick = {
            tickLower: range_this.tickLower,
            tickUpper: range_this.tickUpper,
            amount0: new bn(range_this.amount0).multipliedBy(DEC_STR0).toFixed(0), // token0 decimals
            amount1: new bn(range_this.amount1).multipliedBy(DEC_STR1).toFixed(0) // token1 decimals
        };
        newTicks.push(newTick);
    }
    return newTicks;
}

function get_partial_ticks(ranges, strategyTicks) {
    var partialTicks = new Array();
    for (let i = 0; i < ranges.length; i++) {
        let range_this = ranges[i];

        let indexInStrategyTicks = strategyTicks.findIndex((x) => parseInt(x.tickLower) == parseInt(range_this.tickLower) && parseInt(x.tickUpper) == parseInt(range_this.tickUpper));
        if (indexInStrategyTicks < 0) {
            continue;
        }
        let pTick = {
            index: indexInStrategyTicks, // to be calculated
            burn: true,
            amount0: 0, // to be calculated,
            amount1: 0 // to be calculated
        };
        partialTicks.push(pTick);
    }

    // sort array in decending way
    return partialTicks.sort((a, b) => b.index - a.index);
}

init()
async function init(){

    for (let strategy of strategies) {
        strategy['poolInstance'] = new strategy.networkDetails.web3Object.eth.Contract(ABI.UNIV3_POOL_ABI, strategy.poolAddress)
        strategy['strategyInstance'] = new strategy.networkDetails.web3Object.eth.Contract(ABI.DEFIEDGE_STRATEGY_ABI, strategy.id)
    }

    // run every 5 minutes
    setInterval(run, 300000);
}

// run every 10-15 minutes
async function run() {
    for (let strategy of strategies) {

        try {
            let liquidity = await axios.get(`https://api.defiedge.io/${strategy.networkDetails.networkName}/${strategy.id}/liquidity`);
            let rangesData = await axios.get(`https://api.defiedge.io/${strategy.networkDetails.networkName}/${strategy.id}/ranges`);

            let strategyTicks = rangesData.data.orders.map(ticks => ({ 
                tickLower: Number(ticks.tickLower),
                tickUpper: Number(ticks.tickUpper),
                amount0: new bn(ticks.amount0.hex).dividedBy(strategy.DEC_STR0).toNumber(0),
                amount1: new bn(ticks.amount1.hex).dividedBy(strategy.DEC_STR1).toNumber(0)
            }));

            let query = {
                "type": "query",
                "strategy_id": strategy.id,
                "amount0": liquidity.data.amount0Total, // total token 0
                "amount1": liquidity.data.amount1Total, // total token 1
                "liquidation_date": strategy.liquidation_date,
                "tick": rangesData.data.currentPrice.tick, //current tick
                "ranges": strategyTicks
            }
            // console.log(query)

            // make json query to strategyAPI at http://178.128.114.22 OR http://178.128.114.22:8052
            response = await axios.request({
                method: 'get',
                url: 'http://178.128.114.22/alo/',
                headers: { 
                'Content-Type': 'application/json'
                },
                data : JSON.stringify(query)
            });
            console.log(response.data)

            var new_ticks = get_new_ticks(response.data[0].output['adds'], strategy.DEC_STR0, strategy.DEC_STR1)
            var partial_ticks = get_partial_ticks(response.data[0].output['removes'], strategyTicks)
            console.log({new_ticks})
            console.log({partial_ticks})

            if(new_ticks.length > 0 || partial_ticks.length > 0){
                // do rebalance
                let rebalanceTxHash = await web3Lib.rebalance(
                    strategy.networkDetails.web3Object,
                    strategy.strategyInstance,
                    strategy.networkDetails.chainId,
                    partial_ticks,
                    new_ticks,
                    strategy.account,
                    strategy.pkey,
                );
                console.log({rebalanceTxHash})
                // wait for transaction confirmation
                await web3Lib.waitForConfirmation(strategy.networkDetails.web3Object, rebalanceTxHash);

                // remake query with new ranges and set type of "ack"
                liquidity = await axios.get(`https://api.defiedge.io/${strategy.networkDetails.networkName}/${strategy.id}/liquidity`);
                rangesData = await axios.get(`https://api.defiedge.io/${strategy.networkDetails.networkName}/${strategy.id}/ranges`);
        
                strategyTicks = rangesData.data.orders.map(ticks => ({ 
                    tickLower: Number(ticks.tickLower),
                    tickUpper: Number(ticks.tickUpper),
                    amount0: new bn(ticks.amount0.hex).dividedBy(strategy.DEC_STR0).toNumber(0),
                    amount1: new bn(ticks.amount1.hex).dividedBy(strategy.DEC_STR1).toNumber(0)
                }));
        
                query = {
                    "type": "ack",
                    "strategy_id": strategy.id,
                    "amount0": liquidity.data.amount0Total, // total token 0
                    "amount1": liquidity.data.amount1Total, // total token 1
                    "liquidation_date": strategy.liquidation_date,
                    "tick": rangesData.data.currentPrice.tick, //current tick
                    "ranges": strategyTicks
                }
                console.log({query})
                response = await axios.request({
                    method: 'get',
                    url: 'http://178.128.114.22/alo/',
                    headers: { 
                    'Content-Type': 'application/json'
                    },
                    data : JSON.stringify(query)
                });
                console.log(JSON.stringify(response.data[0], null, 4))
                // log response
                fs.appendFile('./logs/alologs.txt', JSON.stringify(response.data[0], null, 4) + ",\n\n", (err) => { });
            }
        } catch(e){
            console.log("error while run", e.toString());
            let info_str;
            try { info_str = JSON.stringify({ "strategy": strategy.id }); }
            catch { info_str = ""; }
            fs.appendFile('./logs/aloerrors.txt', Date.now() + " - error while run: " + e.toString() + ",\n" + info_str + "\n", (err) => { });
        }
        
    }
}
