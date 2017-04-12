var docReady = $.Deferred();
$(docReady.resolve);

var abiPromise = $.get("abi.json");
var contractAddressPromise = $.get("contract_address");
var dictionaryPromise = $.get("data_dictionary.json");
var contract;
var dictionary;
var global_intervals = [];
var global_filters = [];

$.when(contractAddressPromise, abiPromise, dictionaryPromise, docReady).always(function (contractAddress, abiJSON, dictionary) {
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    window.dictionary = dictionary[0];
    contract = web3.eth.contract(abi).at(contractAddress);

    routeFromURL();

});

function routeFromURL() {
    global_intervals.forEach(clearInterval);
    global_filters.forEach(filter => filter.stopWatching());
    var parts = window.location.hash.slice(1).split('_');
    route(parts[0], parts.slice(1))
}
window.addEventListener("hashchange", routeFromURL);

function route(page, params) {
    var html = "";
    
    // Emptying the view container is the most reliable way of deleting 
    // old event listeners. Each page load re-assigns event handlers
    $('#view-container').empty().hide();
    switch (page) {
        case 'spread':
            $("#view-container").html($("#spread").html());
            spreadShow(params[0]);
            break;
        case 'games':
            $("#view-container").html($("#games").html());
            gamesList();
            break;
        default:
            $("#view-container").html($("#games").html());
            gamesList();
    }
    $('#view-container').show();
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
                    var games = logs.map(log => log.args);
                    games.sort(function (a,b) {
                        return a.locktime - b.locktime;
                    });
                    getGames.prototype.games = games;
                    resolve(games);
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

function getOpenBidsByLine(game_id) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game
        if (getOpenBidsByLine.prototype.lastUpdate &&
            getOpenBidsByLine.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getOpenBidsByLine.prototype.game_id == game_id)
            resolve(getOpenBidsByLine.prototype.bids);
        contract.getOpenBidsByLine.call(game_id, function (err, hex) {
            var bids = parseBids(hex);
            getOpenBidsByLine.prototype.bids = bids;
            getOpenBidsByLine.prototype.lastUpdate = new Date();
            getOpenBidsByLine.prototype.game_id = game_id;
            resolve(bids);
        });
    });
}

function getMyOpenBids(game_id, walletAddress) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game
        if (getMyOpenBids.prototype.lastUpdate &&
            getMyOpenBids.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getMyOpenBids.prototype.game_id == game_id)
            resolve(getMyOpenBids.prototype.bids);
        getWalletAddress().then(function (walletAddress) {
            contract.getOpenBidsByBidder.call(game_id, walletAddress, function (err, hex) {
                var bids = parseBids(hex);
                getMyOpenBids.prototype.bids = bids;
                getMyOpenBids.prototype.lastUpdate = new Date();
                getMyOpenBids.prototype.game_id = game_id;
                resolve(bids);
            });
        });
    });
}
            
function updateBids (game_id) {
    getOpenBidsByLine(game_id).then(function (bids) {
        $("#home-bids-table tbody, #away-bids-table tbody").empty();
        bids.forEach(bid => {
            if (bid.home) addBidToTable("#home-bids-table", bid);
            else addBidToTable("#away-bids-table", bid);
        });
    });
    $.when(getGame(game_id), getMyOpenBids(game_id)).then(function (game, bids) {
        $("#my-bids-table tbody").empty();
        bids.forEach(bid => {
            bid.team = bid.home ? game.home : game.away;
            addBidToTable("#my-bids-table", bid);
        });
    });
}
    

function spreadShow(id) {
    $("#home-bids-table tbody, #away-bids-table tbody, #bets-table tbody, #my-bets-table tbody, #my-bids-table tbody").empty();

    getGame(id).then(function (game) {
        $('.home').html(game.home);
        $('.away').html(game.away);

        // Display gametime 
        var locktime = new Date(game.locktime * 1000);
        var timeString = locktime.toLocaleTimeString();
        var dateString = locktime.toLocaleDateString();
        var timeString = locktime.toLocaleTimeString('en-us',
            { timeZoneName: 'short' });
        $('.locktime').html(`${dateString} ${timeString}`);

        // Hide betting 10 min prior to gametime
        var now = new Date();
        var tenMinutes = 10*60*1000;
        if (locktime - now < tenMinutes) {
            $("#bet-placements, #open-bids-row").hide();
            $(".game-status").html("Betting is closed");
        }
        else {
            $("#bet-placements, #open-bids-row").show();
            $(".game-status").html("Betting locks 10 min prior to gametime");
        }
    });
    getBets(id).then(function (bets) {
        bets.forEach(bet => addBetToTable("#bets-table", bet));
        var currentLine = bets[bets.length - 1].line / 10;
        $("#home-line").val(currentLine);
        $("#away-line").val(-currentLine);
    });
    updateBids(id);
    var updateBidsInterval = setInterval(() => updateBids(id), 5000);
    global_intervals.push(updateBidsInterval);

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
    getWalletAddress().then(function (walletAddress) {
        $("#place-bet-home").click(function () {
            if ($("#home-amount").val().trim() == '' || $("#home-line").val().trim() == '')
                return false;
            var id = window.location.hash.split('_')[1];
            var line = parseFloat($("#home-line").val()) * 10;
            var amount = parseFloat($("#home-amount").val()) * 1e18;
            var gas = contract.bidSpread.estimateGas(id, true, line, 
                { from: walletAddress, value: amount , gas: 1000000 });
            contract.bidSpread.sendTransaction(id, true, line, 
                { from: walletAddress, value: amount , gas: 1000000 });
            $("#home-amount").val('');
            var team = $('.home').first().html();
            if (line > 0)
                line = '+' + line;
            var notice = `Bet placed. Allow 30 sec for bet to process`;
            $("#bet-description-home").html(notice);
        });
        $("#place-bet-away").click(function () {
            if ($("#away-amount").val().trim() == '' || 
                $("#away-line").val().trim() == '')
                return false;
            var id = window.location.hash.split('_')[1];
            var line = parseFloat($("#away-line").val()) * 10;
            var amount = parseFloat($("#away-amount").val()) * 1e18;
            contract.bidSpread.sendTransaction(id, false, line, 
            { from: walletAddress, value: amount , gas: 500000 });
            $("#away-amount").val('');
            var team = $('.away').first().html();
            if (line > 0)
                line = '+' + line;
            var notice = `Bet placed. Allow 30 sec for bet to process`;
            $("#bet-description-away").html(notice);
        });
    });

    // cancel bid listener
    $(document).on("click", ".cancel-bid", function (e) {
        var game_id = window.location.hash.split('_')[1];
        $.when(getWalletAddress(), getGame(game_id))
        .then(function (walletAddress, game) {
            var $parentRow = $(e.target).parents("tr");
            var team = $parentRow.find("td").first().html();
            var home = team == game.home;
            var line = $parentRow.find("td").eq(1).html();
            contract.cancelBid.sendTransaction(walletAddress, game_id, 
                line, home, { from: walletAddress, gas: 200000 });
        });
    });

    // Update description when bet changes
    $(".form-control").on('keyup', function (e) {
        var $parent = $(e.target).parents(".col-md-6")
        var $description = $parent.find(".bet-description");  
        var line = $parent.find(".line").val();
        if (parseInt(line) > 0)
            line = "+" + line;
        var amount = $parent.find(".amount").val();
        var team = $parent.find("#place-bet-home").length == 1 ? 
            $parent.find(".home").html() : $parent.find(".away").html();
        $description.html(`Bet ${amount} ETH @ ${team} (${line})`);
    });

    // contract event listeners
    var betPlacedFilter = contract.BetPlaced({ game_id: id });
    betPlacedFilter.watch(function (err, log) {
        var bet = log.args;
        addBetToTable("#bets-table", bet);
        $.when(getGame(id), getWalletAddress())
        .then(function (game, walletAddress) {
            if (walletAddress == bet.home || walletAddress == bet.away) {
                bet.team = bet.home == walletAddress ? game.home : game.away;
                addBetToTable("#my-bets-table", bet);
            }
        });
    });
    global_filters.push(betPlacedFilter);

}

function addBidToTable (table, bid) {
    var side = bid.home ? "home" : "away";
    var amount = bid.amount / 1e18;
    var line = bid.line / 10;

    var row = `<tr class="bid">`;
    if (table == "#my-bids-table") {
        row += `<td>${bid.team}</td>`;
    }
    row += `<td>${line}</td>
        <td class="currency">${amount}</td>`;
    if (table == "#my-bids-table") {
        row += `<td><a class="cancel-bid">Cancel</a></td>`;
    }
    row += `</tr>`;
    $(table + " tbody").prepend(row);
}

function addBetToTable(table, bet) {
    var row = `<tr class="bet">`;
    var amount = bet.amount / 1e18;
    var line = bet.line / 10;

    if (table == "#my-bets-table") {
        row += `<td>${bet.team}</td>`;
    }
    row += `<td>${line}</td>
        <td class="currency">${amount}</td>
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

function parseShortBid(hex) {
    return {
        amount: parseInt(hex.slice(0,64), 16),
        home: parseInt(hex.slice(64,66)) == 1,
        line: ~~parseInt(hex.slice(66), 16)
    }
}

function parseBids(hex) {
    if (hex.slice(0,2) == '0x')
        hex = hex.slice(2);
    var short = (hex.length % 74 == 0);
    var bids = []
    if (short) {
        for (var i=0; i < hex.length; i += 74) 
            bids.push(parseShortBid(hex.slice(i, i+74)));
    }
    else {
        for (var i=0; i < hex.length; i += 114)
            bids.push(parseBid(hex.slice(i, i+114)));
    }

    return bids.filter(bid => bid.amount > 0);
}
