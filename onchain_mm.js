
var Web3 = require('web3');
const CONFIG = require("./config/config");
require('dotenv').config();
var fs = require("fs");
const web3Lib = require('./utils/web3');
var bn = require('bignumber.js');

//works if x is gov token and y is base token
class LiquidityHandler {
    constructor(description, strategy, pool, chain, params, price_func) {
        this.description = description;
        this.params = params;
        this.pool = pool;
        this.chain = chain;
        this.strategy = strategy;
        this.S = params.SPACING * params.SPACING_MULT;
        this.O = params.DEC_DELTA / Math.log10(1.0001);
        this._base_tick = this.get_tick_from_sqrtP(params.BASE_SQRT_PRICE);
        this.base_delta = 1.0001 ** (this.S / 2) - 1.0;
        this.min_supported_tick = (params.MIN_SUPPORTED_SQRT_PRICE == Infinity) ? Infinity : this.get_tick_from_sqrtP_pool(params.MIN_SUPPORTED_SQRT_PRICE);
        this.max_supported_tick = (params.MAX_SUPPORTED_SQRT_PRICE == Infinity) ? Infinity : this.get_tick_from_sqrtP_pool(params.MAX_SUPPORTED_SQRT_PRICE);
        this.ranges = null;
        this.price_func = price_func;
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
    move_lower(ranges) {
        let lower_tick = Math.floor((ranges.current_ranges[0][0] + ranges.current_ranges[0][1]) / 2.0 / this.S);
        var liq = ranges.current_ranges[0][2];

        var add_range = [(lower_tick - 1) * this.S, lower_tick * this.S, liq * this.params.LOWER_THETA];
        var remove_range = ranges.current_ranges[2];
        ranges.current_ranges = [
            add_range,
            ranges.current_ranges[0],
            ranges.current_ranges[1]
        ];
        ranges.lower_trigger = Math.ceil((lower_tick - 1 + this.params.LOWER_TRIG) * this.S);
        ranges.upper_trigger = Math.floor((lower_tick + 2 - this.params.UPPER_TRIG) * this.S);
        ranges.actions = { add: [add_range], remove: [remove_range] };
        return ranges;
    }

    move_higher(ranges) {
        let upper_tick = Math.floor((ranges.current_ranges[2][0] + ranges.current_ranges[2][1]) / 2.0 / this.S);
        var liq = ranges.current_ranges[2][2];

        var add_range = [(upper_tick + 1) * this.S, (upper_tick + 2) * this.S, liq * this.params.UPPER_THETA];
        var remove_range = ranges.current_ranges[0];
        ranges.current_ranges = [
            ranges.current_ranges[1],
            ranges.current_ranges[2],
            add_range
        ];
        ranges.lower_trigger = Math.ceil((upper_tick - 1 + this.params.LOWER_TRIG) * this.S);
        ranges.upper_trigger = Math.floor((upper_tick + 2 - this.params.UPPER_TRIG) * this.S);
        ranges.actions = { add: [add_range], remove: [remove_range] };
        return ranges;
    }

    // lower_liqudity_to_amt(range, sqrtP) {
    //     let liq = range[2];
    //     let lower_tick = range[0];
    //     let current_tick = this.get_tick_from_sqrtP_pool(sqrtP);
    //     if (range[1] < current_tick) {
    //         return liq * (10 ** (this.params.DEC_DELTA / 2.0)) * (1.0001 ** (lower_tick / 2.0)) * this.base_delta;
    //     } else { return null; }
    // }

    // upper_liqudity_to_amt(range) {
    //     let liq = range[2];
    //     let upper_tick = range[1];
    //     let current_tick = this.get_tick_from_sqrtP_pool(sqrtP);
    //     if (range[0] > current_tick) {
    //         return liq * (10 ** (-this.params.DEC_DELTA / 2.0)) * (1.0001 ** (-upper_tick / 2.0)) * this.base_delta;
    //     } else { return null; }
    // }

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
    set_liquidity_config_at_sqrtP(sqrtP, old_ranges) {
        new_ranges = JSON.parse(JSON.stringify(old_ranges));
        if (old_ranges == null) {
            // if no ranges are set, set them around the current range
            var current_tick = this.get_tick_from_sqrtP(sqrtP);
            let diff = current_tick - this._base_tick;
            var liq;
            if (diff >= 0) { liq = this.params.LIQ * (this.params.UPPER_THETA ** diff); }
            else { liq = liq = this.params.LIQ * (this.params.LOWER_THETA ** -diff); }

            var new_ranges = [
                [(current_tick - 1) * this.S, current_tick * this.S, liq * this.params.LOWER_THETA],
                [current_tick * this.S, (current_tick + 1) * this.S, liq],
                [(current_tick + 1) * this.S, (current_tick + 2) * this.S, liq * this.params.UPPER_THETA]
            ];

            new_ranges = {
                current_ranges: new_ranges,
                lower_trigger: Math.ceil((current_tick - 1 + this.params.LOWER_TRIG) * this.S),
                upper_trigger: Math.floor((current_tick + 2 - this.params.UPPER_TRIG) * this.S),
                actions: {
                    add: new_ranges,
                    remove: [],
                    event: "new_ranges"
                }
            };

        } else {
            //ranges are set; get actual pool tick
            let pool_tick = this.get_tick_from_sqrtP_pool(sqrtP);

            //rebalance on the lower side, add range to the left and remove from right
            if (pool_tick <= old_ranges.lower_trigger && old_ranges.current_ranges[0][0] > this.min_supported_tick) {
                var adds = [], removes = [];

                //while this is true, move ranges lower, keeping track of adds and removes
                // at each move
                while (pool_tick <= new_ranges.lower_trigger && new_ranges.current_ranges[0][0] > this.min_supported_tick) {
                    new_ranges = this.move_lower(new_ranges);
                    adds = adds.concat(new_ranges.actions.add);
                    removes = removes.concat(new_ranges.actions.remove);
                }
                //set adds and removes (at most 3 elements)
                new_ranges.actions.add = adds.slice(-3);
                new_ranges.actions.remove = removes.slice(0, 3);
                new_ranges.actions.event = "lower_trigger";

            } else if (pool_tick >= old_ranges.upper_trigger && old_ranges.current_ranges[2][1] < this.max_supported_tick) {
                // rebalance on the upper side, Add range to the right and remove from the left
                var adds = [], removes = [];

                //while this is true, move ranges higher, keeping track of adds and removes
                while (pool_tick >= new_ranges.upper_trigger && new_ranges.current_ranges[2][1] < this.max_supported_tick) {
                    new_ranges = this.move_higher(new_ranges);
                    adds = adds.concat(new_ranges.actions.add);
                    removes = removes.concat(new_ranges.actions.remove);
                }

                //set adds and removes (at most 3 elements)
                new_ranges.actions.add = adds.slice(-3);
                new_ranges.actions.remove = removes.slice(0, 3);
                new_ranges.actions.event = "upper_trigger";
            } else {
                //if no rebalance required, change nothing
                new_ranges.actions = { add: [], remove: [] };
            }
        }
        return new_ranges;
    }

    // IF LOWER_THETA * UPPER_THETA != 1.0 then the liquidity values might be approximate...
    // Should not create any issues, but will perform a memoryless reset of liquidity values
    init_ranges(current_ranges) {
        current_ranges.sort(function (a, b) { return a[0] - b[0]; });
        console.log(current_ranges);
        if (
            current_ranges[1][0] - current_ranges[0][0] != this.S || current_ranges[2][0] - current_ranges[1][0] != this.S
            || current_ranges[1][0] != current_ranges[0][1] || current_ranges[2][0] != current_ranges[1][1] || current_ranges.length != 3
        ) {
            throw "failed to verify current ranges";
        }
        var ranges = {};
        ranges.current_ranges = [];
        let diff = Math.round(current_ranges[0][0] / this.S) - this._base_tick;
        let liq;
        if (diff >= 0) { liq = this.params.LIQ * (this.params.UPPER_THETA ** diff); }
        else { liq = liq = this.params.LIQ * (this.params.LOWER_THETA ** -diff); }
        for (let r of current_ranges) {
            ranges.current_ranges.push([r[0], r[1], liq]);
            liq *= this.params.UPPER_THETA;
        }
        ranges.lower_trigger = Math.ceil(current_ranges[0][0] + this.params.LOWER_TRIG * this.S);
        ranges.upper_trigger = Math.floor(current_ranges[2][1] - this.params.UPPER_TRIG * this.S);
        return ranges;
    }

    set_ranges(ranges) {
        this.ranges = ranges;
    }

}

async function init() {
    for (let liquidityHandler of liquidityHandlers) {
        var strategyTicks = await liquidityHandler.strategy.methods.getTicks().call();

        if (strategyTicks.length > 0) {
            strategyTicks = strategyTicks.map(ticks => [Number(ticks.tickLower), Number(ticks.tickUpper)]);
            liquidityHandler.set_ranges(liquidityHandler.init_ranges(strategyTicks));
        }
    }
    // run every 30 seconds
    setInterval(run, 30000);
}

async function run() {

    for (let liquidityHandler of liquidityHandlers) {
        try {
            // query sqrtP from the pool
            var { sqrtPriceX96 } = await liquidityHandler.pool.methods.slot0().call();
            var sqrtP = liquidityHandler.price_func(sqrtPriceX96);

            var new_ranges = liquidityHandler.set_liquidity_config_at_sqrtP(sqrtP, ranges);
            // console.log(new_ranges, liquidityHandler.ranges)

            var partialTicks = new Array();
            var newTicks = new Array();

            var strategyTicks = await liquidityHandler.strategy.methods.getTicks().call();

            // loop over actions.remove and remove liquidity
            for (i = 0; i < new_ranges.actions.remove.length; i++) {
                range_this = new_ranges.actions.remove[i];
                liquidity = Math.floor(range_this[2]);

                let indexInStrategyTicks = strategyTicks.findIndex((x) => parseInt(x.tickLower) == parseInt(range_this[0]) && parseInt(x.tickUpper) == parseInt(range_this[1]));
                if (indexInStrategyTicks < 0) {
                    continue;
                }
                console.log({ indexInStrategyTicks });
                console.log("Remove liquidity from lowerTick=", range_this[0], " and upperTick = ", range_this[1], " with L = ", liquidity);
                let pTick = {
                    index: indexInStrategyTicks, // to be calculated
                    burn: true,
                    amount0: 0, // to be calculated,
                    amount1: 0 // to be calculated
                };
                partialTicks.push(pTick);
            }

            // sort array in decending way
            partialTicks.sort((a, b) => b.index - a.index);

            // loop over actions.add and add liquidity
            for (i = 0; i < new_ranges.actions.add.length; i++) {
                range_this = new_ranges.actions.add[i];
                liquidity = Math.floor(range_this[2]);
                let amount0 = null, amount1 = null;
                let amounts = liquidityHandler.get_amt_for_range(range_this, sqrtP);

                amount0 = amounts.amount0;
                amount1 = amounts.amount1;
                console.log("Add liquidity from lowerTick=", range_this[0], " and upperTick = ", range_this[1], " with L = ", liquidity, "& amounts = ", (amount0, amount1));
                let newTick = {
                    tickLower: range_this[0],
                    tickUpper: range_this[1],
                    amount0: new bn(amount0).multipliedBy(liquidityHandler.params.DEC_STR0).toFixed(0), // UNB,
                    amount1: new bn(amount1).multipliedBy(liquidityHandler.params.DEC_STR1).toFixed(0) // WBNB
                };
                newTicks.push(newTick);
            }

            if (newTicks.length > 0 || partialTicks.length > 0) {
                // console.log({partialTicks})
                // console.log({newTicks})

                // execute rebalance transaction
                let rebalanceTx = await web3Lib.rebalance(liquidityHandler.chain, defiedgeStrategyInstance, CONFIG.CHAIN_ID_BSC, partialTicks, newTicks);

                let txStatus = await web3Lib.waitForConfirmation(liquidityHandler.chain, rebalanceTx);

                // if transaction succeed then set new ranges and save logs
                if (txStatus) {
                    liquidityHandler.set_ranges(new_ranges);
                    let log = {
                        "strategy": liquidityHandler.description,
                        "removedRanges": JSON.stringify(new_ranges.actions.remove),
                        "addedRanges": JSON.stringify(new_ranges.actions.add),
                        "rebalanceTx": rebalanceTx,
                        "currentRanges": JSON.stringify(new_ranges.current_ranges),
                    };
                    console.log(log);
                    fs.appendFile('./logs/logs.txt', JSON.stringify(log) + ",\n", (err) => { });
                } else {
                    fs.appendFile('./logs/dexerrors.txt', Date.now() + " - tx failed: " + rebalanceTx + ",\n", (err) => { });
                }

            } else {
                // console.log("Nothing to do...")
            }

        } catch (e) {
            console.log("error while initialization", e.toString());
            let info_str;
            try { info_str = JSON.stringify({ "strategy": liquidityHandler.description, "ranges": liquidityHandler.ranges.current_ranges }); }
            catch { info_str = ""; }
            fs.appendFile('./logs/dexerrors.txt', Date.now() + " - error while initialization: " + e.toString() + ",\n" + info_str + "\n", (err) => { });
        }
    }
}

var web3_bsc = new Web3(new Web3.providers.HttpProvider(CONFIG.NETWORK_RPC_BSC));
var liquidityHandlers = [];

//UNB/BNB strategy
// uniswapv3 pool address
var UNISWAP_POOL_ADDRESS = "0x508acf810857fefa86281499068ad5d19ebce325";

// defiedge strategy adress accociated with same pool address
var DEFIEDGE_STRATEGY_ADDRESS = "0x3a4ea286af31ca181f1757cf7edbd4355f0360b5";

liquidityHandlers.concat(new LiquidityHandler(
    "UNB/BNB Strategy",
    new web3_bsc.eth.Contract(CONFIG.DEFIEDGE_STRATEGY_ABI, DEFIEDGE_STRATEGY_ADDRESS), //strategy
    new web3_bsc.eth.Contract(CONFIG.UNIV3_POOL_ABI, UNISWAP_POOL_ADDRESS), //pool
    web3_bsc, //chain
    // params 
    {
        // Pool params
        SPACING: 200,
        DEC_DELTA: 0, // this is directional if x is gov token then standard else negative of this
        // For amount0, amount1 conversion
        DEC_STR0: "1000000000000000000", // UNB
        DEC_STR1: "1000000000000000000", // WBNB

        // Strat params
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
    // price conversion function
    function (sqrtPriceX96) { return sqrtPriceX96 / (2 ** 96); }
));

init();
