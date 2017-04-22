var Web3 = require('web3');
var fs = require('fs');

var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

var source = fs.readFileSync("peerbet.sol", "ascii");
var compiled = web3.eth.compile.solidity(source)['<stdin>:PeerBet'];

var abi = compiled.info.abiDefinition;
var PeerBet = web3.eth.contract(abi);
//var gasEstimate = PeerBet.new.getData({
//     from: walletAddress, 
//     data: compiled.code
//});
//gasEstimate = web3.eth.estimateGas({ data: gasEstimate });

var peerbet = PeerBet.new(
   {
     from: walletAddress, 
     data: compiled.code,
     gas: 4500000,
     gasPrice: 2.1e10
   }, function (e, contract){
    if (e) console.log(e);
    if (typeof contract.address !== 'undefined') {
        console.log('Contract mined! address: ' + contract.address + 
            ' transactionHash: ' + contract.transactionHash);

        fs.writeFileSync("abi.json", JSON.stringify(abi));
        fs.writeFileSync("bytecode", compiled.code);
        fs.writeFileSync("contract_address", contract.address);
        fs.writeFileSync("start_block", web3.eth.blockNumber);

        if (process.argv[3] == "--debug") 
            eval(require('locus'));
    }
 })



