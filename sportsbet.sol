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

    function bid(bytes32 game_id, bool home, int64 line) payable {
        // Get game from list
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

        // Match bids from opposing stack
        Bid bid = Bid(msg.sender, msg.value, home, line)
        if (home)
            Bid[] bidStack = game.awayBids;
        else
            Bid[] bidStack = game.homeBids;

        uint i = bidStack.length - 1;
        while (true) {
            break; 
        }

    }

    function withdraw() returns bool {
        var balance = balances[msg.sender]
        balances[msg.sender] = 0
        if (!msg.sender.send(balance)) {
            balances[msg.sender] = balance;
            throw;
        }
    }
}
