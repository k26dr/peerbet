var Web3 = require('web3');
var fs = require('fs');

var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

var abi = JSON.parse(fs.readFileSync("bin/sportsbet.sol:SportsBet.abi", "ascii"));
var bytecode = '0x' + fs.readFileSync("bin/sportsbet.sol:SportsBet.bin", "ascii");
var SportsBet = web3.eth.contract(abi);

console.log("Mining contract...");
var sportsbet_sol_sportsbet = SportsBet.new(
   {
     from: walletAddress, 
     data: bytecode, 
     gas: '4700000'
   }, function (e, contract){
    if (e) console.log(e);
    if (typeof contract.address !== 'undefined') {
         fs.writeFileSync("bin/contract_address", contract.address)
         console.log('Contract mined! address: ' + contract.address + ' transactionHash: ' + contract.transactionHash);
    }
 })
