var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

// Load ABI, contract address, contract
var abi = JSON.parse(fs.readFileSync("bin/peerbet.sol:PeerBet.abi", "ascii"));
var contractAddress = fs.readFileSync("contract_address", "ascii");
var contract = web3.eth.contract(abi).at(contractAddress);
var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

// Create a series of locktimes
var thirty_secs = parseInt(new Date().getTime() / 1000) + 30;
var three_days = parseInt(new Date().getTime() / 1000) + 3*3600*24;
var three_hours = parseInt(new Date().getTime() / 1000) + 3*3600;
var three_minutes = parseInt(new Date().getTime() / 1000) + 3*60;

// Seed games
var games = [
    ["Cleveland", "Indiana", 1, thirty_secs],
    ["San Antonio", "Memphis", 1, three_hours],
    ["Boston", "Chicago", 1, three_minutes],
    ["Los Angeles Clippers", "Utah", 1, three_days],
    ["Golden State", "Portland", 1, three_hours],
    ["Oklahoma City", "Houston", 1, three_minutes]
]
games.forEach(function (game) {
    contract.createGame(...game, { from: walletAddress, gas: 200000 });
});

for (var i=0; i < 100; i++) {
    var random_game = Math.floor(Math.random() * 6) + 1; // 1-6
    var random_amount = Math.floor(Math.random() * 100 * 1e15); // 1-100 milliether
    var over = Math.random() > 0.5; // true or false
    var random_line = Math.floor(Math.random() * 50) + 175; // 175-225
    contract.bid(random_game, over, random_line, { from: walletAddress, value: random_amount , gas: 500000 });
}

