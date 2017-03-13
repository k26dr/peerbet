contract SportsBet is owned, mortal {
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
        BookType type;
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

    Game[] public games;
    mapping(address => uint) private balances;

    function SportsBet() returns (bool success) {
        return true;
    }

    function bidSpread(bytes32 game_id, bool home, int64 line) payable {
        Game game = getGameById(game_id);
        Book book = game.books[BetType.Spread];
        Bid bid = Bid(msg.sender, msg.value, home, line);
        Bid[] matchStack = home ?  book.awayBids : book.homeBids;
        Bid[] bidStack = home ? book.homeBids : book.awayBids;

        // Match existing bets (taker)
        Bid remainingBid = matchBidToStack(bid, matchStack, home);

        // Use leftover funds to place open bids (maker)
        addBidToStack(remainingBid, bidStack);

    }

    function cancelBid(address bidder, bytes32 game_id, uint64 line, bool home) returns (bool success) {
        Game game = getGameById(game_id);
        Book book = game.books[BetType.Spread];
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

    function matchBidToStack(Bid bid, Bid[] stack, home) private {
        for (uint i = stack.length - 1; 
            -stack[i].line >= bid.line && bid.amount > 0 && i >= 0;
            i--)
        {
            address homeAddress = home ? bid.bidder : stack[i].bidder;
            address awayAddress = home ? stack[i].bidder : bid.bidder;
            uint betAmount = bid.amount < stack[i].amount ? bid.amount : stack[i].amount;
            int64 betLine = home ? -stack[i].line : stack[i].line;
            delete stack[i];
            Bet bet = Bet(homeAddress, awayAddress, betAmount, betLine);
            book.bets.push(bet);
            bid.amount -= betAmount;
        }

        return bid;
    }

    function addBidToStack(Bid bid, Bid[] stack) private {
        uint i = stack.length - 1;
        stack.push(bid) # just to make the stack one item larger
        while (stack[i].amount <= bid.amount && i > 0) {
            stack[i+1] = stack[i];
            i--;
        }
        stack[i+1] = bid;
    }

    function getGameById(bytes32 game_id) private returns (Game g) {
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


    // Returns nothing right now
    function withdraw() returns bool {
        var balance = balances[msg.sender]
        balances[msg.sender] = 0
        if (!msg.sender.send(balance)) {
            balances[msg.sender] = balance;
            throw;
        }
        return true;
    }
}
