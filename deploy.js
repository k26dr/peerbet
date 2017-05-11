var Web3 = require('web3');
var fs = require('fs');
var exec = require('child_process').execSync;

var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var walletAddress = web3.eth.accounts[0];
web3.personal.unlockAccount(walletAddress, process.argv[2]);

exec(`solc --bin --abi --optimize -o bin peerbet.sol`);

var abi = fs.readFileSync('bin/peerbet.sol:PeerBet.abi');
var compiled = '0x' + fs.readFileSync("bin/PeerBet.bin");
var PeerBet = web3.eth.contract(abi);

var gasEstimate = PeerBet.new.getData({
     data: compiled
});
gasEstimate = web3.eth.estimateGas({ data: gasEstimate });
console.log("Gas Estimate: ", gasEstimate);

var peerbet = PeerBet.new(
   {
     from: walletAddress, 
     data: compiled,
     gas: 4600000,
     gasPrice: 2.1e10
   }, function (e, contract){
    if (e) console.log(e);
    if (typeof contract.address !== 'undefined') {
        console.log('Contract mined! address: ' + contract.address + 
            ' transactionHash: ' + contract.transactionHash);

        var tx = web3.eth.getTransactionReceipt(contract.transactionHash);
        console.log("Actual Gas: ", tx.gasUsed);

        fs.writeFileSync("contract_address", contract.address);
        fs.writeFileSync("start_block", web3.eth.blockNumber);

        if (process.argv[3] == "--debug") 
            eval(require('locus'));
    }
 })



