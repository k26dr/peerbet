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

function parseTransaction(hex) {
    return {
        bidder: hex.substring(0,40),
        amount: hex.substring(40,104),
        home: hex.susbtring(104,106),
        line: ~~parseInt(hex.substring(107))
    }
}
getActiveGames()
contract.BidPlaced().watch(console.log);
contract.BetPlaced().watch(console.log);

eval(require('locus'));
