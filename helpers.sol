contract owned {
    address owner;

    function owned() { owner = msg.sender; }

    modifier onlyOwner {
        if (msg.sender != owner)
            throw;
        _;
    }
}

contract mortal is owned {
    function kill() {
        if (msg.sender == owner) selfdestruct(owner);
    }
}

contract priced {
    modifier costs(uint price) {
        if (msg.value >= price) {
            _;
        }
    }
}
