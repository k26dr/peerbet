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

var active_games = contract.getActiveGames.call();

eval(require('locus'));
