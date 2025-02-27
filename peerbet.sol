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

    function register(string calldata game_id, uint bettingEnds, address resolver) public {
        require(lines[game_id].bettingEnds == 0, "Line is already registered");
        lines[game_id].bettingEnds = bettingEnds;
        lines[game_id].payoutBegins = bettingEnds + 3*86400; // If oracle dies or something, winner defaults to PUSH, and refunds can begin 3 days after betting ends
        lines[game_id].resolver = resolver;
    }

    function bet(string calldata game_id, Side side) public payable {
        require(block.timestamp < lines[game_id].bettingEnds, "Betting period is over");
        require(msg.value > 0, "No value included in bet");
        require(lines[game_id].bets[msg.sender].counterEnd == 0, "Cannot bet twice on a line with same address. Use a new address.");
        require(side == Side.OVER || side == Side.UNDER, "Cannot bet push");
        lines[game_id].bets[msg.sender] = Bet(
            lines[game_id].counters[side], 
            lines[game_id].counters[side] + msg.value,
            side
        );
        lines[game_id].counters[side] += msg.value;
    }

    function cancelLine(string calldata game_id) public {
        require(lines[game_id].resolver == msg.sender, "Only resolver can cancel line");
        lines[game_id].cancelled = true;
        lines[game_id].payoutBegins = block.timestamp + 86400;
    }

    function resolveLine(string calldata game_id, Side side) public {
        require(lines[game_id].resolver == msg.sender, "Only resolver can resolve line");
        lines[game_id].winner = side;
        lines[game_id].payoutBegins = block.timestamp + 86400;
    }

    function collectPayout(string calldata game_id) public {
        Bet memory myBet = lines[game_id].bets[msg.sender];
        require(block.timestamp > lines[game_id].payoutBegins, "Payout period has not begun");
        require(myBet.counterEnd > 0, "Bet does not exist. Did you already claim?");
        require(lines[game_id].cancelled || lines[game_id].winner == myBet.side || lines[game_id].winner == Side.PUSH, "Your side lost");
        
        Side otherSide = (myBet.side == Side.UNDER) ? Side.OVER : Side.UNDER;
        require(lines[game_id].counters[otherSide] > myBet.counterStart, "Bet did not activate");

        uint payoutAmount = 0;
        if (lines[game_id].winner == Side.PUSH || lines[game_id].cancelled) {
            payoutAmount = myBet.counterEnd - myBet.counterStart;
        }
        else if (lines[game_id].winner == myBet.side) {
            payoutAmount = myBet.counterEnd > lines[game_id].counters[otherSide] ?
                2 * (lines[game_id].counters[otherSide] - myBet.counterStart) :
                2 * (myBet.counterEnd - myBet.counterStart);
        }
        
        delete lines[game_id].bets[msg.sender];
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
