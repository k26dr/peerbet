var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var abi = JSON.parse(fs.readFileSync("abi.json", "ascii"));
var contractAddress = fs.readFileSync("contract_address", "ascii");
var contract = web3.eth.contract(abi).at(contractAddress);
var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

var three_days = parseInt(new Date().getTime() / 1000) + 3*3600*24;
var three_hours = parseInt(new Date().getTime() / 1000) + 3*3600;
var three_minutes = parseInt(new Date().getTime() / 1000) + 3*60;

var games = [
    ["New England", "Baltimore", 0, three_days],
    ["San Francisco", "Seattle", 0, three_hours],
    ["Oakland", "Minnesota", 0, three_minutes],
    ["Jacksonville", "Indianapolis", 0, three_days],
    ["Golden State", "Utah", 1, three_hours],
    ["Oklahoma City", "Miami", 1, three_minutes]
]
games.forEach(function (game) {
    contract.createGame.sendTransaction(...game, { 
        from: walletAddress, 
        to: contract.address,
        gas: 200000
    });
});

var active_games = games.map(g => contract.getGameId.call(...g));

for (var i=0; i < 200; i++) {
    var random_index = Math.floor(Math.random() * active_games.length);
    var random_amount = Math.floor(Math.random() * 100000);
    var random_line = Math.floor(Math.random() * 20) - 10;
    var home = Math.random() > 0.5;
    contract.bidSpread.sendTransaction(active_games[random_index], home, random_line, { from: walletAddress, value: random_amount , gas: 500000 });
}

