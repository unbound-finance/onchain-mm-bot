const ETHSNX = {
    id: "0x9a42f5bd1397b142e3ebc0d29ef50ac7ec22b8f0",
    liquidation_date: '2023-09-15',
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
}

const ETHVSTA = {
    id: "0xd5ab558dc523d5cebea69164aa555455da5e73b6",
    liquidation_date: '2023-09-15',
    DEC_STR0: "1000000000000000000", // 18
    DEC_STR1: "1000000000000000000", // 18
} 

var strategies = [
    ETHSNX, 
    ETHVSTA
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

function get_partial_ticks(ranges) {
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

// run every 10-15 minutes
async function run() {
    for (let strategy of strategies) {
        query = {
            "type": "query",
            "strategy_id": strategy.id,
            "amount0": null, // total token 0
            "amount1": null, // total token 1
            "liquidation_date": strategy.liquidation_date,
            "tick": null, //current tick
            "ranges": [{
                "tickLower": null,
                "tickUpper": null,
                "amount0": null,
                "amount1": null
            }]
        }

        // make json query to strategyAPI at http://178.128.114.22
        response = make_query(query)
        var new_ticks = get_new_ticks(responese['adds'], strategy.DEC_STR0, strategy.DEC_STR1)
        var partial_ticks = get_partial_ticks(response['removes'])

        // do rebalance
        // wait for tx to finish

        // remake query with new ranges and set type of "ack"
        query = {
            "type": "ack",
            "strategy_id": strategy.id,
            "amount0": null, // total token 0
            "amount1": null, // total token 1
            "liquidation_date": strategy.liquidation_date,
            "tick": null, //current tick
            "ranges": [{
                "tickLower": null,
                "tickUpper": null,
                "amount0": null,
                "amount1": null
            }]
        }
        response = make_query(make_query)
        // log response
    }
}