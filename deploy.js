var Web3 = require('web3');
var fs = require('fs');

var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

var source = fs.readFileSync("sportsbet.sol", "ascii");
var compiled = web3.eth.compile.solidity(source)['<stdin>:SportsBet'];

var abi = compiled.info.abiDefinition;
var SportsBet = web3.eth.contract(abi);


var sportsbet = SportsBet.new(
   {
     from: walletAddress, 
     data: compiled.code,
     gas: 4000000,
     gasPrice: 2.1e10
   }, function (e, contract){
    if (e) console.log(e);
    if (typeof contract.address !== 'undefined') {
        console.log('Contract mined! address: ' + contract.address + 
            ' transactionHash: ' + contract.transactionHash);

        fs.writeFileSync("abi.json", JSON.stringify(abi));
        fs.writeFileSync("bytecode", compiled.code);
        fs.writeFileSync("contract_address", contract.address);

        if (process.argv[3] == "--debug") 
            eval(require('locus'));
    }
 })



