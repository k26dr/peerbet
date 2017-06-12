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
	if (window.location.pathname == '/bet.html')
		betPage();
	else
		gamesPage();
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
            <a href="bet.html?id=${game.id}">
				<button class="btn btn-bet">OVER UNDER</button>
			</a>
        </td>
    </tr>`;
    $(`#games-table tbody`).append(row);
}


function getBets(game_id, book) {
    return new Promise(function (resolve, reject) {
		contract.BetPlaced({ game_id: game_id, book: book }, { fromBlock: 1 })
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
            bids.forEach(bid => bid.amount = parseFloat(bid.amount / 1e18));
            resolve(bids);
        });
    });
}

//function betsPage(id, book) {
//    $("#home-bids-table tbody, #away-bids-table tbody, #my-bets-table tbody, #my-bids-table tbody").empty();
//    $("#view-container #bet-alerts").empty();
//    $("#view-container #score-row").hide();
//
//    getGame(id).then(function (game) {
//        if (pageBookType() == 3) {
//            $('.home').html("Over");
//            $('.away').html("Under");
//            $('h1 .home').html(game.home);
//            $('h1 .away').html(game.away);
//        }
//        else {
//            $('.home').html(game.home);
//            $('.away').html(game.away);
//        }
//
//        // Display gametime 
//        var locktime = new Date(game.locktime * 1000);
//        var timeString = locktime.toLocaleTimeString();
//        var dateString = locktime.toLocaleDateString();
//        var timeString = locktime.toLocaleTimeString('en-us',
//            { timeZoneName: 'short' });
//        $('.locktime').html(`${dateString} ${timeString}`);
//
//        // Hide betting 10 min prior to gametime
//        var now = new Date();
//        var tenMinutes = 10*60*1000;
//        if (locktime - now < tenMinutes) {
//            $("#bet-placements, #open-bids-row").hide();
//            $(".game-status")
//                .removeClass('open')
//                .addClass('closed')
//                .html("Betting is closed");
//        }
//        else {
//            $("#bet-placements, #open-bids-row").show();
//            $(".game-status")
//                .removeClass('closed')
//                .addClass('open')
//                .html("Betting locks 10 min prior to gametime");
//        }
//
//        // Display scores
//        if (now > locktime) {
//            $('.home-score').html(`${game.result.home}`);
//            $('.away-score').html(`${game.result.away}`);
//            $('#score-row').show();
//        }
//    });
//    $.when(getGame(id), getBets(id, book), getWalletAddress())
//    .then(function (game, bets, walletAddress) {
//        $("#view-container #bets-table tbody").empty(); 
//        if (bets.length == 0)
//            return false;
//
//        bets.filter(bet => bet.home)
//            .forEach(bet => addBetToTable("#bets-table", bet));
//
//        // display my bets
//        var myBets = bets.filter(bet => bet.user == walletAddress);
//        var lines = groupByLine(myBets);
//        Object.keys(lines.home)
//            .forEach(line => addBetToTable("#my-bets-table", 
//                { line: line, amount: lines.home[line], team: game.home, home: true }));
//        Object.keys(lines.away)
//            .forEach(line => addBetToTable("#my-bets-table", 
//                { line: line, amount: lines.away[line], team: game.away, home: false }));
//
//        // display most recent line
//        var currentLine = bets.filter(bet => bet.home).reverse()[0].line;
//        $("#home-line").val(currentLine);
//        if (pageBookType() == 3)
//            $("#away-line").val(currentLine);
//        else
//            $("#away-line").val(-currentLine);
//    });
//    updateBids(id, book);
//    var updateBidsInterval = setInterval(() => updateBids(id, book), 5000);
//    global_intervals.push(updateBidsInterval);
//
//    // listeners for bet placement
//    $("#place-bet-home, #place-bet-away").click(function (e) {
//        getWalletAddress().then(function (walletAddress) {
//            var home = e.target.id == "place-bet-home";
//            var side = home ? "home" : "away";
//            if ($(`#${side}-amount`).val().trim() == '' || $(`#${side}-line`).val().trim() == '')
//                return false;
//
//            // line validations
//            var line = parseFloat($(`#${side}-line`).val());
//            if (pageBookType() == 2) {
//                if (line >= -100 && line < 100) {
//                    errorAlert("Line cannot be between -100 and 99", "#bet-alerts");
//                    return false;
//                }
//                if (line % 1 != 0) {
//                    errorAlert("Line must be a whole number", "#bet-alerts");
//                    return false;
//                }
//            }
//            else {
//                if (line % 0.5 != 0) {
//                    errorAlert("Only half point lines are allowed.", "#bet-alerts");
//                    return false;
//                }
//            }
//
//            // prevent double betting
//            e.target.disabled = true; 
//            setTimeout(() => e.target.disabled = false, 3000);
//
//            var id = pageGameId();
//            if (pageBookType() == 1 || pageBookType() == 3)
//                line *= 10;
//            var amount = parseFloat($(`#${side}-amount`).val()) * 1e18;
//            var gas = 500000;
//            
//            contract.bid(id, book, home, line, 
//                { from: walletAddress, value: amount , gas: gas }, 
//                function (err, tx) {
//                    e.target.disabled = false;
//                    if (!tx) // rejected transaction
//                        return false;
//                    $(`#${side}-amount`).val('');
//                    if (pageBookType() == 3)
//                        var team = home ? "Over" : "Under";
//                    else
//                        var team = $(`.${side}`).first().html();
//                    if (pageBookType() == 1 || pageBookType() == 3)
//                        line = line / 10;
//                    if (line > 0 && pageBookType() != 3)
//                        line = '+' + line;
//                    amount = amount / 1e18;
//                    var notice = `Bid for ${amount} ETH initiated at ${team} (${line}). 
//                        This page will update when the bid clears.`;
//                    txAlert(tx, notice, "#bet-alerts");
//                    $(`#bet-description-${side}`).html('');
//                });
//        });
//    });
//
//}
//
//function pageGameId() {
//    return window.location.hash.split('_')[1];
//}
//
//function txAlert (tx, text, selector) {
//    var notice = `
//        <div class="alert alert-success alert-dismissable">
//            ${text} View status <a class="alert-link" href="${txLink(tx)}">here</a>.
//            <a class="close" data-dismiss="alert" aria-label="close">&times;</a>
//        </div>`;
//    $(`#view-container ${selector}`).append(notice);
//    window.scrollTo(0,0);
//}
//
//function errorAlert(text, selector) {
//    var notice = `
//        <div class="alert alert-danger alert-dismissable">
//            ${text}
//            <a class="close" data-dismiss="alert" aria-label="close">&times;</a>
//        </div>`;
//    $(`#view-container ${selector}`).append(notice);
//    window.scrollTo(0,0);
//}
//
//function addBidToTable (table, bid) {
//    var side = bid.home ? "over" : "under";
//
//    var row = `<tr class="bid">`;
//    row += `<td>${bid.line}</td>
//        <td class="currency">${bid.amount}</td>`;
//    row += `</tr>`;
//    $(table + " tbody").prepend(row);
//}
//
//function addBetToTable(table, bet) {
//    var row = `<tr class="bet">`;
//    var line = bet.line;
//
//    if (table == "#my-bets-table") {
//        row += `<td>`;
//        if (pageBookType() == 1 || pageBookType() == 2) {
//            row += `<div class="logo"></div>`;
//            row += `<span>${bet.team}</span>`;
//        }
//        else if (pageBookType() == 3)
//            row += bet.home ? "Over" : "Under";
//        row += `</td>`;
//    }
//    row += `<td>${line}</td>
//        <td class="currency">${bet.amount}</td>
//    </tr>`;
//    $("#view-container " + table + " tbody").prepend(row);
//}
//
//function parseBid(hex) {
//    return {
//        bidder: '0x' + hex.slice(0,40),
//        amount: parseInt(hex.slice(40,104), 16),
//        home: parseInt(hex.slice(104,106)) == 1,
//        line: ~~parseInt(hex.slice(106), 16)
//    }
//}
//
//function parseShortBid(hex) {
//    return {
//        amount: parseInt(hex.slice(0,64), 16),
//        home: parseInt(hex.slice(64,66)) == 1,
//        line: ~~parseInt(hex.slice(66), 16)
//    }
//}
//
//function parseBids(hex) {
//    if (hex.slice(0,2) == '0x')
//        hex = hex.slice(2);
//    var short = (hex.length % 74 == 0);
//    var bids = []
//    if (short) {
//        for (var i=0; i < hex.length; i += 74) 
//            bids.push(parseShortBid(hex.slice(i, i+74)));
//    }
//    else {
//        for (var i=0; i < hex.length; i += 114)
//            bids.push(parseBid(hex.slice(i, i+114)));
//    }
//
//    return bids;
//}
