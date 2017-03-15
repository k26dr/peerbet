var Web3 = require('web3');
var web3 = new Web3();
var fs = require('fs');

web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var abi = JSON.parse(fs.readFileSync("bin/sportsbet.sol:SportsBet.abi", "ascii"));
var contractAddress = fs.readFileSync("bin/contract_address", "ascii");
var contract = web3.eth.contract(abi).at(contractAddress);

var walletAddress = web3.eth.accounts[0];
var tx = {
    from: tx,
    to: contractAddress,
    gas: 470000
}

var result = contract.test.call(tx);
console.log(result);

var result = contract.getGameId.call("patriots", "ravens", "nfl", 100, tx);
console.log(result);
