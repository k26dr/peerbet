var docReady = $.Deferred();
$(docReady.resolve);

var walletPromise = new Promise(function (resolve, reject) {
    mist.requestAccount(function (err, walletAddress) {
        if (err) reject(err);
        else resolve(walletAddress);
    })
})
var abiPromise = $.get("abi.json");
var contractAddressPromise = $.get("contract_address");

$.when(contractAddressPromise, abiPromise, walletPromise, docReady).always(function (contractAddress, abiJSON, walletAddress) {
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    var walletAddress = walletAddress[0];
    console.log(contractAddress, walletAddress);
    contract = web3.eth.contract(abi).at(contractAddress)

    contract.GameCreated().watch(console.log);
    contract.BetPlaced().watch(console.log);
    contract.BidPlaced().watch(console.log);

    var tx = {
        from: walletAddress, 
        to: contract.address,
        gas: 4700000
    }

    var logs = web3.eth.filter({
        fromBlock: 1,
        toBlock: 'latest', 
        address: contractAddress
    });
    logs = contract.allEvents({ fromBlock: 1, toBlock: 'latest' });
    logs.get(function (err, logs) {
        console.log(logs);
        logs.forEach(function (log) {
            var game = log.args;
            var gametime = new Date(parseInt(game.locktime)).toString();
            var row = `<tr class="game">
                <td>${game.home}</td>
                <td>${game.away}</td>
                <td>${game.category}</td>
                <td>${gametime}</td>
            </tr>`
            $("#games").append(row);
            debugger;
        })
    });

    // contract.createGame.sendTransaction("patriots", "ravens", 0, 100, tx, console.log);
})

    
function route(page, params) {
    $('.page').hide();
    $('#' + page').show();
}
