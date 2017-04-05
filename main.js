var docReady = $.Deferred();
$(docReady.resolve);

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

function getWalletAddress () {
    return new Promise(function (resolve, reject) {
        // get cached if available
        if (sessionStorage.walletAddress)
            resolve(sessionStorage.walletAddress);
        else {
            mist.requestAccount(function (err, walletAddress) {
                if (err) reject(err);
                else {
                    // cache then resolve
                    sessionStorage.walletAddress = walletAddress[0];
                    resolve(walletAddress[0]);
                }
            })
        }
    })
}

function getGames () {
    return new Promise(function (resolve, reject) {
        // get cached if available
        if (getGames.prototype.games)
            resolve(getGames.prototype.games);
        else {
            contract.GameCreated({}, { fromBlock: 1 })
                .get(function (err, logs) {
                    // cache then resolve
                    getGames.prototype.games = logs.map(log => log.args);
                    resolve(getGames.prototype.games);
                });
        }
    });
}

function getGame(id) {
    return getGames().then(function (games) {
        var game = games.filter(g => g.id == id)[0];
        return game;
    })
}

function gamesList () {
    $("#games-table tbody").empty();
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
    $("#games-table tbody").append(row);
}

function getETHtoUSDConversion () {
    return new Promise(function (resolve, reject) {
        if (sessionStorage.eth_usd)
            resolve(parseInt(sessionStorage.eth_usd));
        else {
            $.get("https://coinmarketcap-nexuist.rhcloud.com/api/eth")
            .then(function (data) {
                sessionStorage.eth_usd = data.price.usd;
                resolve(data.price.usd);
            });
        }
    });
}

function getBets(game_id) {
    return new Promise(function (resolve, reject) {
        // if cache is set and is for this game
        if (getBets.prototype.game_id == game_id)
            resolve(getBets.prototype.bets);
        else {
            contract.BetPlaced({ game_id: game_id }, { fromBlock: 1 })
                .get(function (err, logs) {
                    var bets = logs.map(log => log.args);
                    getBets.prototype.game_id = game_id;
                    getBets.prototype.bets = bets;
                    resolve(bets);
                });
        }
    });
}


function getOpenBids(game_id) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game
        if (getOpenBids.prototype.lastUpdate &&
            getOpenBids.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getOpenBids.prototype.game_id == game_id)
            resolve(getOpenBids.prototype.bids);
        contract.getOpenBids.call(game_id, function (err, hex) {
            var bids = parseBids(hex);
            getOpenBids.prototype.bids = bids;
            getOpenBids.prototype.lastUpdate = new Date();
            getOpenBids.prototype.game_id = game_id;
            resolve(bids);
        });
    });
}
            
function updateBids (game_id) {
    getOpenBids(game_id).then(function (bids) {
        $("#home-bids-table tbody, #away-bids-table tbody").empty();
        bids.forEach(bid => {
            if (bid.home) addBidToTable("#home-bids-table", bid);
            else addBidToTable("#away-bids-table", bid);
        });
    });
}
    

function spreadShow(id) {
    $("#home-bids-table tbody, #away-bids-table tbody, #bets-table tbody, #my-bets-table tbody, #my-bids-table tbody").empty();

    getGame(id).then(function (game) {
        $('.home').html(game.home);
        $('.away').html(game.away);
    });
    getBets(id).then(function (bets) {
        bets.forEach(bet => addBetToTable("#bets-table", bet));
        var currentLine = bets[bets.length - 1].line;
        $("#home-line").val(currentLine);
        $("#away-line").val(-currentLine);
    });
    updateBids(id);
    setInterval(() => updateBids(id), 5000);
    $.when(getGame(id), getOpenBids(id), getWalletAddress()).then(
    function (game, bids, walletAddress) {
        bids.filter(bid => bid.bidder == walletAddress).forEach(bid => {
            bid.team = bid.home ? game.home : game.away;
            addBidToTable("#my-bids-table", bid);
        });
    });
    $.when(getGame(id), getBets(id), getWalletAddress()).then(
    function (game, bets, walletAddress) {
        var myBets = bets.filter(bet =>
            bet.home == walletAddress || bet.away == walletAddress);
        myBets.forEach(bet => {
            bet.team = bet.home == walletAddress ? game.home : game.away;
            addBetToTable("#my-bets-table", bet);
        });
    });


    // listeners for bet placement
    if (!spreadShow.prototype.listeners) {
        getWalletAddress().then(function (walletAddress) {
            spreadShow.prototype.listeners = true;
            $("#place-bet-home").click(function () {
                var id = window.location.hash.split('_')[1];
                var line = parseFloat($("#home-line").val());
                var amount = parseFloat($("#home-amount").val());
                var gas = contract.bidSpread.estimateGas(id, true, line, 
                    { from: walletAddress, value: amount , gas: 1000000 });
                contract.bidSpread.sendTransaction(id, true, line, 
                    { from: walletAddress, value: amount , gas: 1000000 });
            });
            $("#place-bet-away").click(function () {
                var id = window.location.hash.split('_')[1];
                var line = parseFloat($("#away-line").val());
                var amount = parseFloat($("#away-amount").val());
                contract.bidSpread.sendTransaction(id, false, line, 
                { from: walletAddress, value: amount , gas: 500000 });
            });
        });
    }

    // contract event listeners
    contract.BetPlaced({ game_id: id }).watch(function (err, log) {
        var bet = log.args;
        console.log(bet);
        addBetToTable("#bets-table", bet);
        $.when(getGame(id), getWalletAddress())
        .then(function (game, walletAddress) {
            if (walletAddress == bet.home || walletAddress == bet.away) {
                bet.team = bet.home == walletAddress ? game.home : game.away;
                addBetToTable("#my-bets-table", bet);
            }
        });
    });

}

// TODO: Add USD amounts next to ETH
function addBidToTable (table, bid) {
    var row = `<tr class="bid">`;
    if (table == "#my-bids-table") {
        row += `<td>${bid.team}</td>`;
    }
    row += `<td>${bid.line}</td>
        <td>${bid.amount}</td>
    </tr>`;
    $(table + " tbody").prepend(row);
}

// TODO: Add USD amounts next to ETH
function addBetToTable(table, bet) {
    var row = `<tr class="bet">`;
    if (table == "#my-bets-table") {
        row += `<td>${bet.team}</td>`;
    }
    row += `<td>${bet.line}</td>
        <td>${bet.amount}</td>
    </tr>`;
    $(table + " tbody").prepend(row);
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

