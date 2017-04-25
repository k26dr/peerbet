var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var abi = JSON.parse(fs.readFileSync("abi.json", "ascii"));
var contractAddress = fs.readFileSync("contract_address", "ascii");
var contract = web3.eth.contract(abi).at(contractAddress);
var walletAddress = web3.eth.accounts[0];
var secondAddress = web3.eth.accounts[1];
web3.personal.unlockAccount(walletAddress, process.argv[2]);
web3.personal.unlockAccount(secondAddress, process.argv[2]);

var thirty_secs = parseInt(new Date().getTime() / 1000) + 30;
var three_days = parseInt(new Date().getTime() / 1000) + 3*3600*24;
var three_hours = parseInt(new Date().getTime() / 1000) + 3*3600;
var three_minutes = parseInt(new Date().getTime() / 1000) + 3*60;

var games = [
    ["Cleveland", "Indiana", 1, thirty_secs],
    ["San Antonio", "Memphis", 1, three_hours],
    ["Boston", "Chicago", 1, three_minutes],
    ["Los Angeles Clippers", "Utah", 1, three_days],
    ["Golden State", "Portland", 1, three_hours],
    ["Oklahoma City", "Houston", 1, three_minutes]
]
games.forEach(function (game) {
    contract.createGame.sendTransaction(...game, { 
        from: walletAddress, 
        gas: 200000
    });
});

var active_games = games.map(g => contract.getGameId.call(...g));

for (var i=0; i < 200; i++) {
    var random_index = Math.floor(Math.random() * (active_games.length - 1));
    var random_amount = Math.random() * 100 * 1e17;
    var random_address = Math.random() > 0.5 ? walletAddress : secondAddress;
    var home = Math.random() > 0.5;
    var random_book = Math.floor(Math.random() * 3) + 1;
    if (random_book == 1)
        var random_line = (Math.floor(Math.random() * 40) - 20) * 5; // -100 to 100 by 5s
    else if (random_book == 2) {
        var random_line = Math.floor(Math.random() * 300) + 100;
        if (Math.random() > 0.5) 
            random_line *= -1;
    }
    else
        var random_line = Math.floor(Math.random() * 100) + 150
    contract.bid(active_games[random_index], random_book, home, random_line, { from: random_address, value: random_amount , gas: 500000 });
}

