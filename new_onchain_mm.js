const LiquidityHandler = require("./utils/liquidityHandler");
const { STRATEGIES } = require("./config/strategyConfig");
const web3Lib = require('./utils/web3');
var fs = require("fs");

var liquidityHandlers = new Array();

init();
async function init() {
    
    for (let strategy of STRATEGIES) {
        liquidityHandlers.push(new LiquidityHandler(strategy))
    }

    try {
        for (let liquidityHandler of liquidityHandlers) {
            var strategyTicks = await liquidityHandler.strategy.methods.getTicks().call();
    
            if (strategyTicks.length > 0) {
                strategyTicks = strategyTicks.map(ticks => [Number(ticks.tickLower), Number(ticks.tickUpper)]);
                liquidityHandler.set_ranges(liquidityHandler.init_ranges(strategyTicks));
            }
        }
    } catch (e) {
        console.log("error while initialization", e.toString());
        fs.appendFile('./logs/dexerrors.txt', Date.now() + " - error while initialization: " + e.toString() + "\n", (err) => { });
        throw e.toString();
    }

    // run every 120 seconds
    setInterval(run, 120000);
}

async function run(){
    for (let liquidityHandler of liquidityHandlers) {
        try {
            // query sqrtP from the pool
            var { sqrtPriceX96 } = await liquidityHandler.pool.methods.slot0().call();
            var sqrtP = liquidityHandler.price_func(sqrtPriceX96);

            var new_ranges = liquidityHandler.set_liquidity_config_at_sqrtP(sqrtP, liquidityHandler.ranges);

            var strategyTicks = await liquidityHandler.strategy.methods.getTicks().call();
            var partialTicks = liquidityHandler.get_partialTicks(new_ranges.actions.remove, strategyTicks);
            var newTicks = liquidityHandler.get_newTicks(new_ranges.actions.add, sqrtP);

            if (newTicks.length > 0 || partialTicks.length > 0) {
                // execute rebalance transaction
                let rebalanceTxHash = await web3Lib.rebalance(
                    liquidityHandler.web3Object,
                    liquidityHandler.strategy,
                    liquidityHandler.chainId,
                    partialTicks,
                    newTicks,
                    liquidityHandler.account,
                    liquidityHandler.pKey,
                );

                // wait for transaction confirmation
                let txStatus = await web3Lib.waitForConfirmation(liquidityHandler.web3Object, rebalanceTxHash);

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
            }

        } catch (e) {
            console.log("error while run", e.toString());
            let info_str;
            try { info_str = JSON.stringify({ "strategy": liquidityHandler.description, "ranges": liquidityHandler.ranges.current_ranges }); }
            catch { info_str = ""; }
            fs.appendFile('./logs/dexerrors.txt', Date.now() + " - error while run: " + e.toString() + ",\n" + info_str + "\n", (err) => { });
        }
        
    }
}