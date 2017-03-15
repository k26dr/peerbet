var docReady = $.Deferred();
$(docReady.resolve);

var abiPromise = $.get("abi.json");
var contractAddressPromise = $.get("contract_address");

$.when(contractAddressPromise, abiPromise, docReady).then(function (contractAddress, abiJSON) {
    var walletAddress = web3.eth.accounts[0];
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    var contract = web3.eth.contract(abi).at(contractAddress)

    tx = {
        from: walletAddress,
        to: contractAddress, 
        gas: 4700000,
    }

    debugger;

})

    

