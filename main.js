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
var contract;
var dictionary;

$.when(contractAddressPromise, abiPromise, dictionaryPromise, docReady).always(function (contractAddress, abiJSON, dictionary) {
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    window.dictionary = dictionary[0];
    contract = web3.eth.contract(abi).at(contractAddress);

    routeFromURL();

});

function routeFromURL() {
    var parts = window.location.hash.slice(1).split('_');
    route(parts[0], parts.slice(1))
}
window.addEventListener("hashchange", routeFromURL);

function route(page, params) {
    $('.page').hide();
    switch (page) {
        case 'spread':
            spreadShow(params[0]);
            $("#spread").show();
            break;
        case 'games':
            $("#games").show();
            gamesList();
            break;
        default:
            gamesList();
            $("#games").show();
    }
}

function getGames () {
    return new Promise(function (resolve, reject) {
        if (getGames.prototype.games)
            resolve(getGames.prototype.games);
        else {
            contract.GameCreated({}, { fromBlock: 1 })
                .get(function (err, logs) {
                    getGames.prototype.games = logs.map(log => log.args);
                    resolve(getGames.prototype.games);
                });
        }
    });
}

function gamesList () {
    getGames().then(function (games) {
        games.forEach(game => addGameFromLog(game, dictionary.categories));
    });
}

    
function addGameFromLog (game, categories) {
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
        <td><a href="#spread_${game.id}">Spread</a></td>
    </tr>`
    $("#games-table").append(row);
}


function spreadShow(id) {
    getGames().then(function (games) {
        var game = games.filter(g => g.id == id)[0];
        var category = dictionary.categories[game.category];
        $('.matchup').html(`${category} - ${game.home} vs ${game.away}`)
    });
    contract.BetPlaced({ game_id: id }, { fromBlock: 1 })
        .get(function (err, logs) {
            logs.forEach(log => addBetFromLog(log.args));
        });
    var hex = contract.getOpenBids(id);
    var bids = parseBids(hex);
    bids.forEach(bid => {
        if (bid.home) addBidToTable("#home-bids-table", bid);
        else addBidToTable("#away-bids-table", bid);
    });
}

function addBidToTable (table, bid) {
    var row = `<tr class="bid">
        <td>${bid.bidder}</td>
        <td>${bid.amount}</td>
        <td>${bid.line}</td>
    </tr>`;
    $(table).append(row);
}

function parseBid(hex) {
    return {
        bidder: '0x' + hex.slice(0,40),
        amount: parseInt(hex.slice(40,104), 16),
        home: parseInt(hex.slice(104,106)) == 1,
        line: ~~parseInt(hex.slice(106), 16)
    }
}

function parseBids(hex) {
    var bids = []
    if (hex.slice(0,2) == '0x')
        hex = hex.slice(2);
    for (var i=0; i < hex. length; i += 114)
        bids.push(parseBid(hex.substring(i, i+114)));

    return bids.filter(bid => bid.amount > 0);
}

function addBetFromLog(bet) {
    var row = `<tr class="bet">
        <td>${bet.line}</td>
        <td>${bet.amount}</td>
    </tr>`
    $("#bets-table").append(row);
}
