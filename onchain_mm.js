
var Web3 = require('web3');
const CONFIG = require("./config/config")
require('dotenv').config()
var fs = require("fs");
const web3Lib = require('./utils/web3');
// uniswapv3 pool address
const UNISWAP_POOL_ADDRESS = "0x508acf810857fefa86281499068ad5d19ebce325";

// defiedge strategy adress accociated with same pool address
const DEFIEDGE_STRATEGY_ADDRESS = "0x3a4ea286af31ca181f1757cf7edbd4355f0360b5";


// Pool params
const SPACING = 200;
const DEC_DELTA = 0; // this is directional if x is gov token then standard else negative of this

// Strat params
const SPACING_MULT = 1; // width of liquidity is SPACING * SPACING_MULT
const LOWER_TRIG = 0.2; // trigger rebalance when 80% of liquidity is eaten
const UPPER_TRIG = 0.2;
const UPPER_THETA = 1 / .99; // liquidity increases by 10% to the right
const LOWER_THETA = 1.0 / UPPER_THETA; // THIS IS TO AVOID FRONTING
const LIQ = 10; // liquidity at the price below 
const BASE_SQRT_PRICE = (207670616831749341164212298.0 / (2 ** 96)); //current sqrt price (set at the beginning/not to be queried)

// configuration of strategy ranges (will need to be queried at the start, if ranges are set)
// var ranges = null;
var ranges = {
    current_ranges: [
        [ -119200, -119000, LIQ * LOWER_THETA ],
        [ -119000, -118800, LIQ ],
        [ -118800, -118600, LIQ * UPPER_THETA ]
      ],
      lower_trigger: -119159,
      upper_trigger: -118641
}

var web3 = new Web3(new Web3.providers.HttpProvider(CONFIG.NETWORK_RPC_BSC));

const uniswapV3Pool = new web3.eth.Contract(CONFIG.UNIV3_POOL_ABI, UNISWAP_POOL_ADDRESS);
const defiedgeStrategyInstance = new web3.eth.Contract(CONFIG.DEFIEDGE_STRATEGY_ABI, DEFIEDGE_STRATEGY_ADDRESS);

//works if x is gov token and y is base token
class LiquidityHandler {
    constructor() {
        this.S = SPACING * SPACING_MULT;
        this.O = DEC_DELTA / Math.log10(1.0001);
        this._base_tick = this.get_tick_from_sqrtP(BASE_SQRT_PRICE);
        this.base_delta = 1.0001 ** (this.S / 2) - 1.0;
    }

    // get strategy tick from price
    get_tick_from_sqrtP(sqrtP) {
        return Math.floor((2 * Math.log(sqrtP) / Math.log(1.0001) - this.O) / this.S);
    }

    // get pool tick from price
    get_tick_from_sqrtP_pool(sqrtP) {
        return Math.round((2 * Math.log(sqrtP) / Math.log(1.0001) - this.O));
    }

    // Add a range on the left and remove the range on the right
    move_lower() {
        let lower_tick = Math.floor((ranges.current_ranges[0][0] + ranges.current_ranges[0][1]) / 2.0 / this.S);
        var liq = ranges.current_ranges[0][2];

        var add_range = [(lower_tick - 1) * this.S, lower_tick * this.S, liq * LOWER_THETA];
        var remove_range = ranges.current_ranges[2];
        ranges.current_ranges = [
            add_range,
            ranges.current_ranges[0],
            ranges.current_ranges[1]
        ];
        ranges.lower_trigger = Math.ceil((lower_tick - 1 + LOWER_TRIG) * this.S);
        ranges.upper_trigger = Math.floor((lower_tick + 2 - UPPER_TRIG) * this.S);
        ranges.actions = { add: [add_range], remove: [remove_range] };
    }

    move_higher() {
        let upper_tick = Math.floor((ranges.current_ranges[2][0] + ranges.current_ranges[2][1]) / 2.0 / this.S);
        var liq = ranges.current_ranges[2][2];

        var add_range = [(upper_tick + 1) * this.S, (upper_tick + 2) * this.S, liq * UPPER_THETA];
        var remove_range = ranges.current_ranges[0];
        ranges.current_ranges = [
            ranges.current_ranges[1],
            ranges.current_ranges[2],
            add_range
        ];
        ranges.lower_trigger = Math.ceil((upper_tick - 1 + LOWER_TRIG) * this.S);
        ranges.upper_trigger = Math.floor((upper_tick + 2 - UPPER_TRIG) * this.S);
        ranges.actions = { add: [add_range], remove: [remove_range] };
    }

    lower_liqudity_to_amt(range, sqrtP) {
        let liq = range[2];
        let lower_tick = range[0];
        let current_tick = this.get_tick_from_sqrtP_pool(sqrtP);
        if (range[1] < current_tick) {
            return liq * (10 ** (DEC_DELTA / 2.0)) * (1.0001 ** (lower_tick / 2.0)) * this.base_delta;
        } else { return null; }
    }

    upper_liqudity_to_amt(range) {
        let liq = range[2];
        let upper_tick = range[1];
        let current_tick = this.get_tick_from_sqrtP_pool(sqrtP);
        if (range[0] > current_tick) {
            return liq * (10 ** (-DEC_DELTA / 2.0)) * (1.0001 ** (-upper_tick / 2.0)) * this.base_delta;
        } else { return null; }
    }

    get_amt_for_range(range, sqrtP) {
        let lower_sqrtP = 1.0001 ** (range[0] / 2.0), upper_sqrtP = 1.0001 ** (range[1] / 2.0);
        var amount0 = 0, amount1 = 0;
        if (lower_sqrtP >= sqrtP) {
            amount0 = range[2] * (1.0001 ** (-range[0] / 2.0) - 1.0001 ** (-range[1] / 2.0));
        } else if (sqrtP >= upper_sqrtP) {
            amount1 = range[2] * (1.0001 ** (range[1] / 2.0) - 1.0001 ** (range[0] / 2.0));
        } else {
            amount0 = range[2] * (1 / sqrtP - 1.0001 ** (-range[1] / 2.0));
            amount1 = range[2] * (sqrtP - 1.0001 ** (range[0] / 2.0));
        }
        return {
            amount0: amount0,
            amount1: amount1
        };
    }

    // This is the main function, it will set the ranges variable if you give it current sqrt price

    // ranges.current_ranges are the current ranges (list of 3 lists)
    // each element contains [lower_tick, upper_tick, liquidity]

    // ranges.lower_trigger is the tick at which the lower rebalance is triggered
    // ranges.upper_trigger is the tick at which the upper rebalance is triggered

    //ranges.actions.add & ranges.actions.remove are lists of lists that tell you the current actions
    //each element is in the form [lower_tick, upper_tick, liquidity] (L value)
    //ultimately the run() function should loop over these (can disregard other stuff)
    set_liquidity_config_at_sqrtP(sqrtP) {
        if (ranges == null) {
            // if no ranges are set, set them around the current range
            var current_tick = this.get_tick_from_sqrtP(sqrtP);
            let diff = current_tick - this._base_tick;
            var liq;
            if (diff >= 0) { liq = LIQ * (UPPER_THETA ** diff); }
            else { liq = liq = LIQ * (LOWER_THETA ** -diff); }

            var new_ranges = [
                [(current_tick - 1) * this.S, current_tick * this.S, liq * LOWER_THETA],
                [current_tick * this.S, (current_tick + 1) * this.S, liq],
                [(current_tick + 1) * this.S, (current_tick + 2) * this.S, liq * UPPER_THETA]
            ];

            ranges = {
                current_ranges: new_ranges,
                lower_trigger: Math.ceil((current_tick - 1 + LOWER_TRIG) * this.S),
                upper_trigger: Math.floor((current_tick + 2 - UPPER_TRIG) * this.S),
                actions: {
                    add: new_ranges,
                    remove: [],
                    event: "new_ranges"
                }
            };

        } else {
            //ranges are set; get actual pool tick
            let pool_tick = this.get_tick_from_sqrtP_pool(sqrtP);

            //if no rebalance required, change nothing
            if (pool_tick > ranges.lower_trigger && pool_tick < ranges.upper_trigger) { ranges.actions = { add: [], remove: [] }; }
            //rebalance on the lower side, add range to the left and remove from right
            else if (pool_tick <= ranges.lower_trigger) {
                var adds = [], removes = [];

                //while this is true, move ranges lower, keeping track of adds and removes
                // at each move
                while (pool_tick <= ranges.lower_trigger) {
                    this.move_lower();
                    adds = adds.concat(ranges.actions.add);
                    removes = removes.concat(ranges.actions.remove);
                }
                //set adds and removes (at most 3 elements)
                ranges.actions.add = adds.slice(-3);
                ranges.actions.remove = removes.slice(0, 3);
                ranges.actions.event = "lower_trigger";

            } else {
                // rebalance on the upper side, Add range to the right and remove from the left
                var adds = [], removes = [];

                //while this is true, move ranges higher, keeping track of adds and removes
                while (pool_tick >= ranges.upper_trigger) {
                    this.move_higher();
                    adds = adds.concat(ranges.actions.add);
                    removes = removes.concat(ranges.actions.remove);
                }

                //set adds and removes (at most 3 elements)
                ranges.actions.add = adds.slice(-3);
                ranges.actions.remove = removes.slice(0, 3);
                ranges.actions.event = "upper_trigger";
            }
        }
    }
}

var liquidityHandler = new LiquidityHandler();

run()
async function run() {

    try {

        // query sqrtP from the pool
        var { sqrtPriceX96 } = await uniswapV3Pool.methods.slot0().call();
        var sqrtP = (sqrtPriceX96 / (2 ** 96));
        // var sqrtP = BASE_SQRT_PRICE / 1.0001 ** (290);
        // console.log(sqrtP)

        liquidityHandler.set_liquidity_config_at_sqrtP(sqrtP);
        // console.log(ranges)

        var partialTicks = new Array();
        var newTicks = new Array();

        var strategyTicks = await defiedgeStrategyInstance.methods.getTicks().call();
        // console.log(strategyTicks)
        // console.log(strategyTicks[0])
        // console.log(strategyTicks[1])
        // console.log(strategyTicks[2])

        // ranges.actions.remove[0] = ['-119200', '-119000']
        // ranges.actions.remove[1] = ['-118800', '-118600']

        // loop over actions.remove and remove liquidity
        for (i = 0; i < ranges.actions.remove.length; i++) {
            range_this = ranges.actions.remove[i];
            liquidity = Math.floor(range_this[2]);

            let indexInStrategyTicks = strategyTicks.findIndex( (x) => parseInt(x.tickLower) == parseInt(range_this[0]) && parseInt(x.tickUpper) == parseInt(range_this[1]))
            console.log({indexInStrategyTicks})
            console.log("Remove liquidity from lowerTick=", range_this[0], " and upperTick = ", range_this[1], " with L = ", liquidity);
            let pTick = {
                index: indexInStrategyTicks, // to be calculated
                burn: true,
                amount0: 0, // to be calculated,
                amount1: 0 // to be calculated
            }
            partialTicks.push(pTick);
        }

        // loop over actions.add and add liquidity
        for (i = 0; i < ranges.actions.add.length; i++) {
            range_this = ranges.actions.add[i];
            liquidity = Math.floor(range_this[2])
            let amount0 = null, amount1 = null;
            let amounts = liquidityHandler.get_amt_for_range(r, sqrtP);

            amount0 = amounts.amount0;
            amount1 = amounts.amount1;
            console.log("Add liquidity from lowerTick=", range_this[0], " and upperTick = ", range_this[1], " with L = ", liquidity, "& amounts = ", (amount0, amount1));
            let newTick = {
                tickLower: range_this[0],
                tickUpper: range_this[1],
                amount0: amount0, // UNB,
                amount1: amount1 // WBNB
            };
            newTicks.push(newTick);
        }

        console.log({partialTicks})
        console.log({newTicks})

        if(newTicks.length > 0 || partialTicks.length > 0){
            // execute rebalance transaction
            let rebalanceTx = await web3Lib.rebalance(web3, defiedgeStrategyInstance, CONFIG.CHAIN_ID_BSC, [], newTicks);
            let log = {
                "removedRanges": JSON.stringify(ranges.actions.remove),
                "addedRanges": JSON.stringify(ranges.actions.add),
                "rebalanceTx": rebalanceTx
            };
            console.log(log);
            fs.appendFile('./logs/logs.txt', JSON.stringify(log) + ",\n", (err) => { });
        }

    } catch(e){
        console.log("error while initialization", e.toString());
        fs.appendFile('./logs/dexerrors.txt', Date.now() + " - error while initialization: " + e.toString() + ",\n", (err) => { });
    }

}