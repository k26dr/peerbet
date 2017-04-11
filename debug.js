var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var abi = JSON.parse(fs.readFileSync("abi.json", "ascii"));
var contractAddress = fs.readFileSync("contract_address", "ascii");
var contract = web3.eth.contract(abi).at(contractAddress);
var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

var tx = {
    from: walletAddress, 
    to: contractAddress,
    gas: 4700000
}

function getActiveGames() {
    active_games = contract.getActiveGames.call();
    if (active_games.length == 0)
        setTimeout(getActiveGames, 100);
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

function watch () {
    contract.BidPlaced().watch(console.log);
    contract.BetPlaced().watch(console.log);
}

getActiveGames()

eval(require('locus'));
