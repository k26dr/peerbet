var docReady = $.Deferred();
$(docReady.resolve);

//var walletPromise = new Promise(function (resolve, reject) {
//    mist.requestAccount(function (err, walletAddress) {
//        if (err) reject(err);
//        else resolve(walletAddress);
//    })
//})
var abiPromise = $.get("abi.json");
var contractAddressPromise = $.get("contract_address");
var dictionaryPromise = $.get("data_dictionary.json");

$.when(contractAddressPromise, abiPromise, dictionaryPromise, docReady).always(function (contractAddress, abiJSON, dictionary) {
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    var dictionary = dictionary[0];
    contract = web3.eth.contract(abi).at(contractAddress)

    logs = contract.GameCreated({}, { fromBlock: 1, toBlock: 'latest' });
    logs.get(function (err, logs) {
        console.log(logs);
        logs.forEach(log => addGameFromLog(log, dictionary.categories))
    });

});

function addGameFromLog (log, categories) {
    var game = log.args;
    var category = categories[parseInt(game.category)];
    var gametime = new Date(parseInt(game.locktime) * 1000);
    var date = gametime.toISOString().slice(0,10);
    var time = gametime.toTimeString().slice(0,8);

    var row = `<tr class="game">
        <td>${game.home}</td>
        <td>${game.away}</td>
        <td>${category}</td>
        <td>${date}</td>
        <td>${time}</td>
    </tr>`
    $("#games-table").append(row);
}
    
function route(page, params) {
    $('.page').hide();
    $('#' + page).show();
}
