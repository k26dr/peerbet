// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract PeerBet {
    enum Side { PUSH, OVER, UNDER }
    
    struct Bet {
        uint counterStart;
        uint counterEnd;
        Side side;
    }

    struct Line {
        uint bettingEnds;
        uint payoutBegins;
        address resolver;
        bool cancelled;
        Side winner;
        mapping(Side => uint) counters;
        mapping(address => Bet) bets;
    }
    mapping(string => Line) public lines;

    function register(string calldata id, uint bettingEnds, address resolver) public {
        require(lines[id].bettingEnds == 0, "Line is already registered");
        lines[id].bettingEnds = bettingEnds;
        lines[id].payoutBegins = bettingEnds + 3*86400; // If oracle dies or something, winner defaults to PUSH, and refunds can begin 3 days after betting ends
        lines[id].resolver = resolver;
    }

    function bet(string calldata id, Side side) public payable {
        require(block.timestamp < lines[id].bettingEnds, "Betting period is over");
        require(msg.value > 0, "No value included in bet");
        require(lines[id].bets[msg.sender].counterEnd == 0, "Cannot bet twice on a line with same address. Use a new address.");
        require(side == Side.OVER || side == Side.UNDER, "Cannot bet push");
        lines[id].bets[msg.sender] = Bet(
            lines[id].counters[side], 
            lines[id].counters[side] + msg.value,
            side
        );
        lines[id].counters[side] += msg.value;
    }

    function cancelLine(string calldata id) public {
        require(lines[id].resolver == msg.sender, "Only resolver can cancel line");
        lines[id].cancelled = true;
        lines[id].payoutBegins = block.timestamp + 86400;
    }

    function resolveLine(string calldata id, Side side) public {
        require(lines[id].resolver == msg.sender, "Only resolver can resolve line");
        lines[id].winner = side;
        lines[id].payoutBegins = block.timestamp + 86400;
    }

    function collectPayout(string calldata id) public {
        Bet memory myBet = lines[id].bets[msg.sender];
        require(block.timestamp > lines[id].payoutBegins, "Payout period has not begun");
        require(myBet.counterEnd > 0, "Bet does not exist. Did you already claim?");
        require(lines[id].cancelled || lines[id].winner == myBet.side || lines[id].winner == Side.PUSH, "Your side lost");
        
        Side otherSide = (myBet.side == Side.UNDER) ? Side.OVER : Side.UNDER;
        require(lines[id].counters[otherSide] > myBet.counterStart, "Bet did not activate");

        uint payoutAmount = 0;
        if (lines[id].winner == Side.PUSH || lines[id].cancelled) {
            payoutAmount = myBet.counterEnd - myBet.counterStart;
        }
        else if (lines[id].winner == myBet.side) {
            payoutAmount = myBet.counterEnd > lines[id].counters[otherSide] ?
                2 * (lines[id].counters[otherSide] - myBet.counterStart) :
                2 * (myBet.counterEnd - myBet.counterStart);
        }
        
        delete lines[id].bets[msg.sender];
        (bool success, ) = msg.sender.call{ value: payoutAmount }("");
        require(success, "Transfer failed.");
    }

    function viewBet(string calldata lineId, address bettor) public view returns (Bet memory) {
        return lines[lineId].bets[bettor];
    }

    function viewCounter(string calldata lineId, Side side) public view returns (uint) {
        return lines[lineId].counters[side];
    } 
}
