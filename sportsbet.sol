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

    function bidSpread(bytes32 game_id, bool home, int64 line) payable {
        Game game = getGameById(game_id);
        Book book = game.books[BetType.Spread];
        Bid bid = Bid(msg.sender, msg.value, home, line);
        Bid[] bidStack = home ?  book.awayBids : book.homeBids;

        // Match existing bets (taker)
        for (uint i = bidStack.length - 1; 
            -bidStack[i].line >= bid.line && bid.amount > 0 && i >= 0;
            i--)
        {
            address homeAddress = home ? bid.bidder : bidStack[i].bidder;
            address awayAddress = home ? bidStack[i].bidder : bid.bidder;
            uint betAmount = bid.amount < bidStack[i].amount ? bid.amount : bidStack[i].amount;
            int64 betLine = home ? -bidStack[i].line : bidStack[i].line;
            delete bidStack[i];
            Bet bet = Bet(homeAddress, awayAddress, betAmount, betLine);
            book.bets.push(bet);
            bid.amount -= betAmount;
        }

        // Use leftover funds to place open bids (maker)
        addBidToStack(bid, bidStack);

    }

    function addBidToStack(Bid bid, Bid[] stack) {
        uint i = stack.length - 1;
        while (stack[i].amount <= bid.amount && i > 0) {
            i--;
        }
        stack
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
    }
}
