pragma solidity ^0.4.9;

contract SportsBet {
    enum GameStatus { Open, Locked }
    enum BookType { Spread, MoneyLine, OverUnder }

    struct Bid {
        address bidder;
        uint amount; /* in wei */
        bool home; /* true=home, false=away */
        int64 line;
    }

    struct Bet {
        address home;
        address away;
        uint amount; /* in wei */
        int64 line;
    }

    struct Book {
        BookType bookType;
        Bid[] homeBids;
        Bid[] awayBids;
        Bet[] bets;
    }

    struct Game {
        bytes32 id;
        string home;
        string away;
        uint locktime;
        GameStatus status;
        string category;
        Book[] books;
    }

    address owner;
    Game[] public games;
    mapping(address => uint) private balances;

    function SportsBet() {
        address owner = msg.sender;
    }

    function bidSpread(bytes32 game_id, bool home, int64 line) payable {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        Bid memory bid = Bid(msg.sender, msg.value, home, line);
        Bid[] matchStack = home ?  book.awayBids : book.homeBids;
        Bid[] bidStack = home ? book.homeBids : book.awayBids;

        // Match existing bets (taker)
        for (uint i = matchStack.length - 1; 
            -matchStack[i].line >= bid.line && bid.amount > 0 && i >= 0;
            i--)
        {
            address homeAddress = home ? bid.bidder : matchStack[i].bidder;
            address awayAddress = home ? matchStack[i].bidder : bid.bidder;
            uint betAmount = bid.amount < matchStack[i].amount ? bid.amount : matchStack[i].amount;
            int64 betLine = home ? -matchStack[i].line : matchStack[i].line;
            delete matchStack[i];
            Bet memory bet = Bet(homeAddress, awayAddress, betAmount, betLine);
            book.bets.push(bet);
            bid.amount -= betAmount;
        }


        // Use leftover funds to place open bids (maker)
        addBidToStack(bid, bidStack);

    }

    function cancelBid(address bidder, bytes32 game_id, int64 line, bool home) returns (bool) {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        Bid[] stack = home ? book.homeBids : book.awayBids;
        bool found = true;
        uint i = 0;

        // Delete bid in stack, refund amount to user
        while (i < stack.length) {
            if (stack[i].bidder == bidder && stack[i].line == line) {
                balances[bidder] += stack[i].amount;
                delete stack[i];
                found = true;
                break;
            }
            i++;
        }

        if (!found)
            return false;

        // Shift all succeeding bids up
        // WARNING: This is a potentially expensive operation because of all the storage rewrites
        // This should re-written to be more gas-efficient process later
        while (i < stack.length - 1) {
            stack[i] = stack[i+1];
        }
        return true;

    }

    function kill () {
        if (msg.sender == owner) selfdestruct(owner);
    }

    function addBidToStack(Bid bid, Bid[] storage stack) private {
        uint i = stack.length - 1;
        stack.push(bid); // just to make the stack one item larger
        while (stack[i].amount <= bid.amount && i > 0) {
            stack[i+1] = stack[i];
            i--;
        }
        stack[i+1] = bid;
    }

    function getGameById(bytes32 game_id) private returns (Game storage) {
        bool game_exists = false;
        for (uint i = 0; i < games.length; i++) {
            if (games[i].id == game_id) {
                Game game = games[i];
                game_exists = true;
                break;
            }
        }
        if (!game_exists)
            throw;
        return game;
    }


    function withdraw() returns (bool) {
        var balance = balances[msg.sender];
        balances[msg.sender] = 0;
        if (!msg.sender.send(balance)) {
            balances[msg.sender] = balance;
            return false;
        }
        return true;
    }
}
