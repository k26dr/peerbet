var docReady = $.Deferred();
$(docReady.resolve);

var abiPromise = $.get("bin/sportsbet.sol:SportsBet.abi");
var contractAddressPromise = $.get("bin/contract_address");

$.when(contractAddressPromise, abiPromise, docReady).then(function (contractAddress, abiJSON) {
    var walletAddress = web3.eth.accounts[0];
    var contractAddress = contractAddress[0];
    var abi = JSON.parse(abiJSON[0]);
    contract = web3.eth.contract(abi).at(contractAddress)

    tx = {
        from: walletAddress,
        to: contractAddress, 
        gas: 4700000,
    }

    contract.test.call(console.log);
    debugger;
    contract.getGameId.sendTransaction('patriots', 'ravens', 'nfl', '100', tx, console.log);
    web3.eth.getBlock(4444, console.log);
    contract.Test().get(console.log);

})

    

