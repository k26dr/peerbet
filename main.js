var docReady = $.Deferred();
$(docReady.resolve);

var CHEAP_GAS_PRICE = 2e9;
var FAST_GAS_PRICE = 20e9;
var abiPromise = $.get("bin/peerbet.sol:PeerBet.abi");
var contractAddressPromise = $.get("contract_address");
var dictionaryPromise = $.get("data_dictionary.json");
var startBlockPromise = $.get("start_block");
var contract;
var dictionary;
var startBlock;
var global_intervals = [];
var global_filters = [];

var web3Promise = new Promise(function (resolve, reject) {
    var interval = setInterval(function () {
        if (typeof web3 !== 'undefined') {
            resolve(web3);
            clearInterval(interval);
        }
    }, 50);
});
$.when(contractAddressPromise, abiPromise, dictionaryPromise, startBlockPromise, docReady, web3Promise)
    .always(function (contractAddress, abiJSON, dictionary, startBlock) {
    var contractAddress = contractAddress[0];
    var abi = JSON.parse(abiJSON[0]);
    window.dictionary = dictionary[0];
    window.startBlock = startBlock[0];
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
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 1);
            break;
        case 'moneyline':
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 2);
            break;
        case 'overunder':
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 3);
            break;
        case 'creategame':
            $("#view-container").html($("#create-game").html());
            createGamePage();
            break;
        case 'withdraw':
        case 'profile':
            $("#view-container").html($("#profile").html());
            profilePage();
            break;
        case 'results':
            $("#view-container").html($("#results").html());
            resultsPage();
            break;
        case 'manage':
            $("#view-container").html($("#manage-game").html());
            manageGamePage(params[0]);
            break;
        case 'games':
        default:
            $("#view-container").html($("#games").html());
            gamesPage();
    }
    $('#view-container').show();
}

function getWalletAddress () {
    return new Promise(function (resolve, reject) {
        // metamask
        if (web3 && web3.eth.accounts[0]) {
            var walletAddress = web3.eth.accounts[0];
            sessionStorage.walletAddress = walletAddress;
            resolve(walletAddress);
        }
        // get cached if available for mist
        else if (sessionStorage.walletAddress)
            resolve(sessionStorage.walletAddress);
        else if (typeof mist !== 'undefined') {
            mist.requestAccount(function (err, accounts) {
                if (err) reject(err);
                else {
                    // cache then resolve
                    var account = accounts[accounts.length - 1];
                    sessionStorage.walletAddress = account;
                    resolve(account);
                }
            })
        }
    })
}

function getGames () {
    // get cached if available
    if (getGames.prototype.games)
        return Promise.resolve(getGames.prototype.games);

    var activeGamesPromise = new Promise((resolve, reject) => {
        contract.getActiveGames.call(function (err, game_ids) {
            if (err) reject(err);
            else resolve(game_ids);
        });
    });
    var gamesPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameCreated({ id: game_ids }, { fromBlock: startBlock })
                .get(function (err, logs) {
                    var games = logs.map(log => log.args);
                    resolve(games);
                });
        });
    });
    var scoresPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameScored({ game_id: game_ids }, { fromBlock: startBlock })
                .get((err, logs) => {
                    var scores = logs.map(log => log.args);
                    resolve(scores);
                });
        });
    });

    return new Promise((resolve, reject) => {
        $.when(gamesPromise, scoresPromise).then((games, scores) => {
            var scoresObj = {}
            scores.forEach(score => scoresObj[score.game_id] = score);
            games.forEach(game => {
                if (scoresObj[game.id]) {
                    game.result = { 
                        home: scoresObj[game.id].homeScore, 
                        away: scoresObj[game.id].awayScore,
                        timestamp: parseInt(scoresObj[game.id].timestamp)
                    }
                }
                else
                    game.result = { home: '-', away: '-' }
            });
            getGames.prototype.games = games;
            resolve(games);
        });
    });
}

function getGame(id) {
    return getGames().then(function (games) {
        var game = games.filter(g => g.id == id)[0];
        return game;
    })
}

function gamesPage() {
    getGames().then(function (games) {
        $("#games-table tbody").empty();
        var now = new Date().getTime() / 1000;
        games.filter(game => game.locktime > now)
            .sort((a,b) => a.locktime - b.locktime)
            .forEach(game => addGameToTable(game, "#games-table"));
    });
}

function resultsPage () {
    getGames().then(function (games) {
        $("#results-table tbody").empty();
        var now = new Date().getTime() / 1000;
        games.filter(game => game.locktime < now)
            .sort((a,b) => b.locktime - a.locktime)
            .forEach(game => addGameToTable(game, "#results-table"));
    });
}

    
function addGameToTable (game, table) {
    var category = dictionary.categories[parseInt(game.category)];
    var gametime = new Date(parseInt(game.locktime) * 1000);
    var date = gametime.toString().slice(0,10);
    var time = gametime.toTimeString().slice(0,5);

    var row = `<tr class="game">
        <td>
            <div class="logo logo-home"></div>
            <span class="home">${game.home}</span>
        </td>
        <td>
            <div class="logo logo-away"></div>
            <span class="away">${game.away}</span>
        </td>`;
    if (table == "#results-table" || table == "#my-games-table")
        row += `<td>${game.result.home} - ${game.result.away}</td>`;
    row += ` <td>${category}</td>
        <td>${date}</td>
        <td>${time}</td>`;
    if (table == "#my-games-table")
        row += `<td><a href="#manage_${game.id}"><button class="btn btn-bet">MANAGE</button></a></td>`;
    else {
        row += `<td class="bets-cell">
            <a href="#spread_${game.id}"><button class="btn btn-bet">SPREAD</button></a>
            <a href="#moneyline_${game.id}"><button class="btn btn-bet">MONEY LINE</button></a>
            <a href="#overunder_${game.id}"><button class="btn btn-bet">OVER UNDER</button></a>
        </td>`;
    }
    row += `</tr>`;
    $(`#view-container ${table} tbody`).append(row);
    $(`#view-container ${table} tr`).last().data('id', game.id);

    // set logos
    var homePos = getLogoPosition(game.home);
    var awayPos = getLogoPosition(game.away);
    $(`#view-container ${table} .logo-home`).last()
        .css('background-position-x', homePos.x)
        .css('background-position-y', homePos.y);
    $(`#view-container ${table} .logo-away`).last()
        .css('background-position-x', awayPos.x)
        .css('background-position-y', awayPos.y);
}

function getLogoPosition(team) {
    var index = dictionary.logos.NBA.indexOf(team);
    return {
        x: -16 - 37*(index % 6), 
        y: -14 - 35*Math.floor(index / 6)
    }
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

function getBets(game_id, book) {
    return new Promise(function (resolve, reject) {
        // if cache is set and is for this game
        if (getBets.prototype.game_id == game_id &&
            getBets.prototype.book === book)
            resolve(getBets.prototype.bets);
        else {
            contract.BetPlaced({ game_id: game_id, book: book }, { fromBlock: startBlock })
                .get(function (err, logs) {
                    var bets = logs.map(log => log.args);
                    if (pageBookType() == 1 || pageBookType() == 3)
                        bets.forEach(bet => bet.line /= 10);
                    bets.forEach(bet => bet.amount = parseFloat(bet.amount / 1e18));
                    getBets.prototype.game_id = game_id;
                    getBets.prototype.book = book;
                    getBets.prototype.bets = bets;
                    resolve(bets);
                });
        }
    });
}

// This function is available, but is currently unused
// in the interest of minimizing JSON-RPC calls. A user's
// bets can be filtered from getBets() instead.
function getMyBets(game_id, book) {
    return new Promise(function (resolve, reject) {
        // if cache is set and is for this game
        if (getMyBets.prototype.game_id == game_id &&
            getMyBets.prototype.book == book)
            resolve(getMyBets.prototype.bets);
        else {
            getWalletAddress().then(function (walletAddress) {
                contract.BetPlaced({ game_id: game_id, book: book, user: walletAddress }, { fromBlock: startBlock })
                    .get(function (err, logs) {
                        var bets = logs.map(log => log.args);
                        if (pageBookType() == 1)
                            bets.forEach(bet => bet.line /= 10);
                        getMyBets.prototype.game_id = game_id;
                        getMyBets.prototype.book = book;
                        getMyBets.prototype.bets = bets;
                        resolve(bets);
                    });
            });
        }
    });
}

function getOpenBids(game_id, book) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game and book
        if (getOpenBids.prototype.lastUpdate &&
            getOpenBids.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getOpenBids.prototype.game_id == game_id &&
            getOpenBids.prototype.book == book)
            resolve(getOpenBids.prototype.bids);
        contract.getOpenBids.call(game_id, book, function (err, hex) {
            var bids = parseBids(hex);
            if (pageBookType() == 1 || pageBookType() == 3)
                bids.forEach(bid => bid.line /= 10);
            bids.forEach(bid => bid.amount = parseFloat(bid.amount / 1e18));
            getOpenBids.prototype.bids = bids;
            getOpenBids.prototype.lastUpdate = new Date();
            getOpenBids.prototype.game_id = game_id;
            getOpenBids.prototype.book = book;
            resolve(bids);
        });
    });
}

function groupByLine (bids) {
    var lines = { home: {}, away: {} };
    bids.forEach(bid => {
        var side = bid.home ? "home" : "away";
        if (lines[side][bid.line])
            lines[side][bid.line] += bid.amount;
        else
            lines[side][bid.line] = bid.amount;
    });
    return lines;
}
            
            
function updateBids (game_id, book) {
    $.when(getOpenBids(game_id, book), getWalletAddress(), getGame(game_id))
    .then(function (bids, walletAddress, game) {
        bids = bids.filter(bid => bid.amount > 0);
        $("#home-bids-table tbody, #away-bids-table tbody, #my-bids-table tbody").empty();
        var lines = groupByLine(bids);
        var homeLines = Object.keys(lines.home);
        if (pageBookType() == 3)
            homeLines.sort((a,b) => a -b)
        else
            homeLines.sort((a,b) => b -a)
        homeLines.forEach(line => addBidToTable("#home-bids-table", { line: line, amount: lines.home[line] }));
        Object.keys(lines.away)
            .sort((a,b) => b - a)
            .forEach(line => addBidToTable("#away-bids-table", { line: line, amount: lines.away[line] }));
        bids.filter(bid => bid.bidder == walletAddress)
            .forEach(bid => { bid.team = bid.home ? game.home : game.away;
                addBidToTable("#my-bids-table", bid);
            });
        
    });
}
    

function betsPage(id, book) {
    $("#home-bids-table tbody, #away-bids-table tbody, #my-bets-table tbody, #my-bids-table tbody").empty();
    $("#view-container #bet-alerts").empty();
    $("#view-container #score-row").hide();

    getGame(id).then(function (game) {
        if (pageBookType() == 3) {
            $('.home').html("Over");
            $('.away').html("Under");
            $('h1 .home').html(game.home);
            $('h1 .away').html(game.away);
        }
        else {
            $('.home').html(game.home);
            $('.away').html(game.away);
        }

        // display logos
        var homePos = getLogoPosition(game.home);
        var awayPos = getLogoPosition(game.away);
        $(`#view-container .logo-home`)
            .css('background-position-x', homePos.x)
            .css('background-position-y', homePos.y);
        $(`#view-container .logo-away`)
            .css('background-position-x', awayPos.x)
            .css('background-position-y', awayPos.y);

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
            $(".game-status")
                .removeClass('open')
                .addClass('closed')
                .html("Betting is closed");
        }
        else {
            $("#bet-placements, #open-bids-row").show();
            $(".game-status")
                .removeClass('closed')
                .addClass('open')
                .html("Betting locks 10 min prior to gametime");
        }

        // Display scores
        if (now > locktime) {
            $('.home-score').html(`${game.result.home}`);
            $('.away-score').html(`${game.result.away}`);
            $('#score-row').show();
        }
    });
    $.when(getGame(id), getBets(id, book), getWalletAddress())
    .then(function (game, bets, walletAddress) {
        $("#view-container #bets-table tbody").empty(); 
        if (bets.length == 0)
            return false;

        bets.filter(bet => bet.home)
            .forEach(bet => addBetToTable("#bets-table", bet));

        // display my bets
        var myBets = bets.filter(bet => bet.user == walletAddress);
        var lines = groupByLine(myBets);
        Object.keys(lines.home)
            .forEach(line => addBetToTable("#my-bets-table", 
                { line: line, amount: lines.home[line], team: game.home, home: true }));
        Object.keys(lines.away)
            .forEach(line => addBetToTable("#my-bets-table", 
                { line: line, amount: lines.away[line], team: game.away, home: false }));

        // display most recent line
        var currentLine = bets.filter(bet => bet.home).reverse()[0].line;
        $("#home-line").val(currentLine);
        if (pageBookType() == 3)
            $("#away-line").val(currentLine);
        else
            $("#away-line").val(-currentLine);
    });
    updateBids(id, book);
    var updateBidsInterval = setInterval(() => updateBids(id, book), 5000);
    global_intervals.push(updateBidsInterval);

    // listeners for bet placement
    $("#place-bet-home, #place-bet-away").click(function (e) {
        getWalletAddress().then(function (walletAddress) {
            var home = e.target.id == "place-bet-home";
            var side = home ? "home" : "away";
            if ($(`#${side}-amount`).val().trim() == '' || $(`#${side}-line`).val().trim() == '')
                return false;

            // line validations
            var line = parseFloat($(`#${side}-line`).val());
            if (pageBookType() == 2) {
                if (line >= -100 && line < 100) {
                    errorAlert("Line cannot be between -100 and 99", "#bet-alerts");
                    return false;
                }
                if (line % 1 != 0) {
                    errorAlert("Line must be a whole number", "#bet-alerts");
                    return false;
                }
            }
            else {
                if (line % 0.5 != 0) {
                    errorAlert("Only half point lines are allowed.", "#bet-alerts");
                    return false;
                }
            }

            // prevent double betting
            e.target.disabled = true; 
            setTimeout(() => e.target.disabled = false, 3000);

            var id = pageGameId();
            if (pageBookType() == 1 || pageBookType() == 3)
                line *= 10;
            var amount = parseFloat($(`#${side}-amount`).val()) * 1e18;
            var gas = 500000;
            
            contract.bid(id, book, home, line, 
                { from: walletAddress, value: amount , gas: gas }, 
                function (err, tx) {
                    e.target.disabled = false;
                    if (!tx) // rejected transaction
                        return false;
                    $(`#${side}-amount`).val('');
                    if (pageBookType() == 3)
                        var team = home ? "Over" : "Under";
                    else
                        var team = $(`.${side}`).first().html();
                    if (pageBookType() == 1 || pageBookType() == 3)
                        line = line / 10;
                    if (line > 0 && pageBookType() != 3)
                        line = '+' + line;
                    amount = amount / 1e18;
                    var notice = `Bid for ${amount} ETH initiated at ${team} (${line}). 
                        This page will update when the bid clears.`;
                    txAlert(tx, notice, "#bet-alerts");
                    $(`#bet-description-${side}`).html('');
                });
        });
    });

    // cancel bid listener
    function cancelBidListener (e) {
        var game_id = pageGameId();
        $.when(getWalletAddress(), getGame(game_id))
        .then(function (walletAddress, game) {
            var $parentRow = $(e.target).parents("tr");
            var team = $parentRow.find("td").first().text().trim();
            if (pageBookType() == 3)
                var home = team == "Over";
            else
                var home = team == game.home;
            var line = parseFloat($parentRow.find("td").eq(1).html());
            if (pageBookType() == 1 || pageBookType() == 3)
                line *= 10;
            console.log(game_id, book, line, home, walletAddress);
            contract.cancelBid(game_id, book, line, home, 
                { from: walletAddress, gas: 200000 }, function (err, tx) {
                    if (err) return false;
                    txAlert(tx, "Bid cancelation submitted.", "#bet-alerts");
                });
        });
    }
    $(document).off("click", ".cancel-bid"); // cancel listeners from other pages
    $(document).on("click", ".cancel-bid", cancelBidListener);

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
        if (bet.game_id != id || bet.book != book)
            return false;
        bet.amount /= 1e18;
        if (bet.book == 1 || bet.book == 3)
            bet.line /= 10;
        if (bet.home)
            addBetToTable("#bets-table", bet);
        $.when(getGame(id), getWalletAddress()).then(function (game, walletAddress) {
            if (bet.user == walletAddress) {
                bet.team = bet.home ? game.home : game.away;
                addBetToTable("#my-bets-table", bet);
            }
        });
    });
    global_filters.push(betPlacedFilter);

}

function pageBookType () {
    var page = window.location.hash.slice(1).split('_')[0];
    switch (page) {
        case 'spread':
            return 1;
        case 'moneyline':
            return 2;
        case 'overunder':
            return 3;
        default:
            return 0;
    }
}

function pageGameId() {
    return window.location.hash.split('_')[1];
}

function txAlert (tx, text, selector) {
    var notice = `
        <div class="alert alert-success alert-dismissable">
            ${text} View status <a class="alert-link" href="${txLink(tx)}">here</a>.
            <a class="close" data-dismiss="alert" aria-label="close">&times;</a>
        </div>`;
    $(`#view-container ${selector}`).append(notice);
    window.scrollTo(0,0);
}

function errorAlert(text, selector) {
    var notice = `
        <div class="alert alert-danger alert-dismissable">
            ${text}
            <a class="close" data-dismiss="alert" aria-label="close">&times;</a>
        </div>`;
    $(`#view-container ${selector}`).append(notice);
    window.scrollTo(0,0);
}

function addBidToTable (table, bid) {
    var side = bid.home ? "home" : "away";

    var row = `<tr class="bid">`;
    if (table == "#my-bids-table") {
        if (pageBookType() == 3) {
            var side = bid.home ? "Over" : "Under";
            row += `<td>${side}</td>`;
        }
        else
            row += `<td>
                <div class="logo"></div>
                <span>${bid.team}</span>
            </td>`;
    }
    row += `<td>${bid.line}</td>
        <td class="currency">${bid.amount}</td>`;
    if (table == "#my-bids-table") {
        row += `<td><a class="cancel-bid">Cancel</a></td>`;
    }
    row += `</tr>`;
    $(table + " tbody").prepend(row);

    // set logos
    var logoPos = getLogoPosition(bid.team);
    $(`#view-container ${table} .logo`).first()
        .css('background-position-x', logoPos.x)
        .css('background-position-y', logoPos.y);
}

function addBetToTable(table, bet) {
    var row = `<tr class="bet">`;
    var line = bet.line;

    if (table == "#my-bets-table") {
        row += `<td>`;
        if (pageBookType() == 1 || pageBookType() == 2) {
            row += `<div class="logo"></div>`;
            row += `<span>${bet.team}</span>`;
        }
        else if (pageBookType() == 3)
            row += bet.home ? "Over" : "Under";
        row += `</td>`;
    }
    row += `<td>${line}</td>
        <td class="currency">${bet.amount}</td>
    </tr>`;
    $("#view-container " + table + " tbody").prepend(row);

    // set logos
    var logoPos = getLogoPosition(bet.team);
    $(`#view-container ${table} .logo`).first()
        .css('background-position-x', logoPos.x)
        .css('background-position-y', logoPos.y);
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

    return bids;
}

function profilePage() {
    getWalletAddress().then(function (walletAddress) {
        $("#profile-address").html(walletAddress);
        contract.balances.call(walletAddress, function (err, balance) {
            balance = parseFloat(balance / 1e18);
            $("#profile-balance").html(balance);
            if (balance == 0)
                $("#profile-withdraw").hide();
        });
        getGames().then(function (games) {
            $("#my-games-table tbody").empty();
            games.filter(game => game.creator == walletAddress)
                .forEach(game => addGameToTable(game, "#my-games-table"));
        });
        contract.Withdrawal({ user: walletAddress }, { fromBlock: startBlock })
            .get(function (err, logs) {
                var withdrawals = logs.map(log => log.args);
                withdrawals.forEach(w => w.amount = parseFloat(w.amount / 1e18));
                $("#profile-withdrawals-table tbody").empty();
                withdrawals.forEach(addWithdrawalToTable);
            });
        
        $("#profile-withdraw").click(function (e) {
            e.target.disabled = true;
            getWalletAddress().then(walletAddress => {
                contract.withdraw({ from: walletAddress, gas: 50000 },
                    function (err, tx) {
                        if (err) {
                            e.target.disabled = false;
                            return false;
                        }
                        txAlert(tx, "Withdrawal initiated.", "#profile-alerts");
                    });
            });
        });
    });
}

function addWithdrawalToTable(withdrawal) {
    var timestamp = new Date(parseInt(withdrawal.timestamp) * 1000);
    var dateString = timestamp.toLocaleDateString();
    var timeString = timestamp.toLocaleTimeString();
    var row = `<tr>
        <td>${dateString} ${timeString}</td>
        <td class="currency">${withdrawal.amount}</td>
    </tr>`;
    $("#profile-withdrawals-table tbody").append(row);
}

function createGamePage() {
    updateTeams('NBA');
    $("#create-game-submit").click(function () {
        getWalletAddress().then(function (walletAddress) {
            var home = $("#create-game-home").val();
            var away = $("#create-game-away").val();
            var category = parseInt($("#create-game-category").val());
            var offset = new Date().getTimezoneOffset() * 60 * 1000;
            var locktime = (document.querySelector("#create-game-locktime").valueAsNumber + offset) / 1000;
            contract.createGame(home, away, category, locktime, 
                { from: walletAddress, gas: 400000 }, function (err, tx) {
                    if (err) return false;
                    txAlert(tx, "Creating game.", "#create-game-alerts");
                    $(".create-game-input").val('');
                });
        });
    });
}

function updateTeams(category) {
    $("#create-game-home, #create-game-away").empty();
    dictionary.logos[category].concat().sort().forEach(team => {
        $("#create-game-home, #create-game-away").append(
            `<option>${team}</option`);
    });
}

function manageGamePage(game_id) {
    $("#game-manage-verify-section").hide();
    $("#game-manage-score-status").hide();
    $("#game-manage-verified-status").hide();

    $("#game-manage-betting-links").append(`
        <a href="#spread_${game_id}"><button class="btn btn-bet">SPREAD</button></a>
        <a href="#moneyline_${game_id}"><button class="btn btn-bet">MONEY LINE</button></a>
        <a href="#overunder_${game_id}"><button class="btn btn-bet">OVER UNDER</button></a>
    `);

    getGame(game_id).then(function (game) {
        $("#game-manage-home-score").val(game.result.home);
        $("#game-manage-away-score").val(game.result.away);
        $(".away").html(game.away);
        $(".home").html(game.home);

        var ms = 1000 * (game.result.timestamp + 12*3600);
        var verifyTime = new Date(ms);

        if (game.result.home == '-')
            $("#game-manage-verify-section").hide();
        else {
            $("#game-manage-verify-section").show();
            var timeString = `${verifyTime.toLocaleDateString()} ${verifyTime.toLocaleTimeString()}`;
        }
        
        // wait 12 hours to activate verify button
        var now = new Date();
        var notice = `Verifying a score pays out all bets associated with a game.`
        if (verifyTime > now) {
            document.getElementById('verify-score').disabled = true;
            notice += ` The current score cannot be verified until ${timeString}`;
        }
        $("#game-manage-verify-status").html(notice);

        // set logos
        var homePos = getLogoPosition(game.home);
        var awayPos = getLogoPosition(game.away);
        $(`#view-container .logo-home`)
            .css('background-position-x', homePos.x)
            .css('background-position-y', homePos.y);
        $(`#view-container .logo-away`)
            .css('background-position-x', awayPos.x)
            .css('background-position-y', awayPos.y);
    });

    $("#game-manage-score-btn").click(function () {
        $.when(getWalletAddress(), getGame(game_id))
            .then(function (walletAddress, game) {
            // make sure game is scorable
            var now = new Date().getTime() / 1000;
            if (game.locktime > now) {
                errorAlert("Games cannot be scored until after they start", "#game-manage-alerts");
                return false;
            }

            var homeScore = parseInt($("#game-manage-home-score").val());
            var awayScore = parseInt($("#game-manage-away-score").val());
            if (homeScore == '' || awayScore == '')
                return false;
            contract.setGameResult(game_id, homeScore, awayScore,
            { from: walletAddress, gas: 400000 }, function (err, tx) {
                var notice = "Score submitted. Scores must still be verified before bets are paid out."        
                txAlert(tx, notice, "#game-manage-alerts");
            });
        });
    });

    $("#delete-game-btn").click(function () {
        getWalletAddress().then(function (walletAddress) {
            if ($("#verify-delete-text").val() != "DELETE")
                return false;
            contract.deleteGame(game_id, { from: walletAddress, gas: 1000000 }, 
                function (err, tx) {
                    $("#game-manage-delete-status")
                        .html(`Deleting Game Permanently. 
                            View status <a href="${txLink(tx)}">here</a>`)
                        .show();
                });
        });
    });

    $("#verify-score").click(function () {
        document.getElementById('verify-score').disabled = true;
        getWalletAddress().then(function (walletAddress) {
            contract.verifyGameResult(game_id, { from: walletAddress, gas: 500000 }, function (err, tx) {
                if (err) {
                    document.getElementById('verify-score').disabled = false;
                    return false;
                }
                txAlert(tx, "Game verification and bet payment process initiated.", "#game-manage-alerts");
            });
        });
    });

    contract.GameVerified({ game_id: game_id }, { fromBlock: startBlock }, function (err, logs) {
        if (logs.length == 0) return false;
        $("#game-manage-verify-status").hide();
        $("#game-manage-verified-status").show();
        $("#verify-score").hide();
    });
}

function txLink (tx) {
    return `https://etherscan.io/tx/${tx}`;
}
