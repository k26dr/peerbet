var abiPromise = $.get("bin/peerbet.sol:PeerBet.abi");
var contractAddressPromise = $.get("contract_address");
var web3Promise = new Promise(function (resolve, reject) {
    var interval = setInterval(function () {
        if (typeof web3 !== 'undefined') {
            resolve(web3);
            clearInterval(interval);
        }
	}, 50);
});

var contract;
$.when(contractAddressPromise, abiPromise, web3Promise)
    .always(function (contractAddress, abiJSON) {
    var contractAddress = contractAddress[0];
    var abi = JSON.parse(abiJSON[0]);
    contract = web3.eth.contract(abi).at(contractAddress);
    switch (window.location.pathname) {
        case '/bet.html':
            betsPage();
            break;
        case '/withdraw.html':
            withdrawPage();
            break;
        default:
            gamesPage();
    }
});


function getWalletAddress () {
    return new Promise(function (resolve, reject) {
        // Metamask
        if (web3 && web3.eth.accounts[0]) {
            var walletAddress = web3.eth.accounts[0];
        }
		// Mist
        else if (typeof mist !== 'undefined') {
            mist.requestAccount(function (err, accounts) {
                if (err) reject(err);
                else {
                    // cache then resolve
                    var walletAddress = accounts[accounts.length - 1];
                }
            })
        }
		resolve(walletAddress);
    })
}

function getGames () {
    var activeGamesPromise = new Promise((resolve, reject) => {
        contract.getActiveGames.call(function (err, game_ids) {
            if (err) reject(err);
            else resolve(game_ids);
        });
    });
    var gamesPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameCreated({ id: game_ids }, { fromBlock: 1 })
                .get(function (err, logs) {
                    var games = logs.map(log => log.args);
                    resolve(games);
                });
        });
    });
    var scoresPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameScored({ game_id: game_ids }, { fromBlock: 1 })
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

function gamesPage () {
    getGames().then(function (games) {
        games.forEach(addGameToTable);
    });
}

    
function addGameToTable (game, table) {
    var category = 'NBA';
    var gametime = new Date(parseInt(game.locktime) * 1000);
    var date = gametime.toString().slice(0,10);
    var time = gametime.toTimeString().slice(0,5);

    var row = `<tr class="game">
        <td>${game.home}</td>
        <td>${game.away}</td>
        <td>${game.result.home} - ${game.result.away}</td>
		<td>${category}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td class="bets-cell">
            <a href="bet.html?id=${game.id}">Bet</a>
        </td>
    </tr>`;
    $(`#games-table tbody`).append(row);
}


function getBets(game_id) {
    return new Promise(function (resolve, reject) {
		contract.BetPlaced({ game_id: game_id }, { fromBlock: 1 })
			.get(function (err, logs) {
				var bets = logs.map(log => log.args);
				bets.forEach(bet => bet.amount = parseFloat(bet.amount / 1e18));
				resolve(bets);
			});
    });
}

function getOpenBids(game_id, book) {
    return new Promise(function (resolve, reject) {
        contract.getOpenBids.call(game_id, book, function (err, hex) {
            var bids = parseBids(hex);
            bids = bids.filter(bid => bid.amount > 0);
            bids.forEach(bid => bid.amount = parseFloat(bid.amount / 1e18));
            resolve(bids);
        });
    });
}

function betsPage() {
    var id = parseInt(window.location.search.split('=')[1]);
    getGame(id).then(function (game) {
        $('.home').html(game.home);
        $('.away').html(game.away);

        // Display gametime 
        var locktime = new Date(game.locktime * 1000);
        $('.locktime').html(locktime.toString());

        // Display scores
        var homeScore = parseInt(game.result.home);
        var awayScore = parseInt(game.result.away);
        $('.home-score').html(homeScore);
        $('.away-score').html(awayScore);
    });
    getOpenBids(id).then(function (bids) {
        bids.filter(bid => bid.over)
            .forEach(bid => addBidToTable("#over-bids-table", bid));
        bids.filter(bid => !bid.over)
            .forEach(bid => addBidToTable("#under-bids-table", bid));
    });
    getBets(id).then(function (bets) {
        bets.filter(bet => bet.over)
            .forEach(bet => addBetToTable("#bets-table", bet));

    });

    // listeners for bet placement
    $("#place-bet-over, #place-bet-under").click(function (e) {
        getWalletAddress().then(function (walletAddress) {
            var over = e.target.id == "place-bet-over";
            var side = over ? "over" : "under";
            var line = parseFloat($(`#${side}-line`).val());
            var amount = parseFloat($(`#${side}-amount`).val()) * 1e18;
            var gas = 500000;
            
            console.log(id, over, line, amount, gas);
            contract.bid(id, over, line, 
                { from: walletAddress, value: amount , gas: gas }, 
                function (err, tx) {
                });
        });
    });

    // listeners for game scoring
    $("#score-btn").click(function () {
        var homeScore = parseInt($("#home-score-input").val());
        var awayScore = parseInt($("#away-score-input").val());
        getWalletAddress().then(function (walletAddress) {
            contract.setGameResult(id, homeScore, awayScore, 
                { from: walletAddress, gas: 500000 },
                function (err, tx) {
                });
        });
    });
}

function pageGameId() {
    return window.location.hash.split('_')[1];
}

function addBidToTable (table, bid) {
    var row = `<tr class="bid">
        <td>${bid.line}</td>
        <td class="currency">${bid.amount}</td>
    </tr>`;
    $(table + " tbody").prepend(row);
}

function addBetToTable(table, bet) {
    var row = `<tr class="bet">
        <td>${bet.line}</td>
        <td class="currency">${bet.amount}</td>
    </tr>`;
    $("#bets-table tbody").prepend(row);
}

function parseBid(hex) {
    return {
        bidder: '0x' + hex.slice(0,40),
        amount: parseInt(hex.slice(40,104), 16),
        over: parseInt(hex.slice(104,106)) == 1,
        line: ~~parseInt(hex.slice(106), 16)
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

function withdrawPage () {
    getWalletAddress().then(function (walletAddress) {
        $("#address").html(walletAddress);
        contract.balances(walletAddress, function (err, balance) {
            balance = parseInt(balance) / 1e18;
            $("#balance").html(balance);
        });
    });
}
