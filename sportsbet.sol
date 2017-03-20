pragma solidity ^0.4.9;

contract SportsBet {
    enum GameStatus { Open, Locked, Scored }
    enum BookType { Spread, MoneyLine, OverUnder }
    enum BetStatus { Open, Paid }

    // indexing on a string causes issues with web3, so category has to be an int
    event GameCreated(bytes32 id, string home, string away, uint16 indexed category, uint64 locktime);
    event BidPlaced(bytes32 indexed game_id, BookType book, address bidder, uint amount, bool home, int64 line);
    event BetPlaced(bytes32 indexed game_id, BookType book, address home, address away, uint amount, int64 line);

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
        BetStatus status;
    }

    struct Book {
        Bid[] homeBids;
        Bid[] awayBids;
        Bet[] bets;
    }

    struct GameResult {
        int home;
        int away;
    }

    struct Game {
        bytes32 id;
        string home;
        string away;
        uint16 category;
        uint64 locktime;
        GameStatus status;
        mapping(uint => Book) books;
        GameResult result;
    }

    address public owner;
    Game[] games;
    mapping(address => uint) public balances;

    function SportsBet() {
        owner = msg.sender;
    }

	function createGame (string home, string away, uint16 category, uint64 locktime) returns (bytes32) {
        if (msg.sender != owner) throw;
        bytes32 id = getGameId(home, away, category, locktime);
        mapping(uint => Book) books;
        Bid[] memory homeBids;
        Bid[] memory awayBids;
        Bet[] memory bets;
        GameResult memory result = GameResult(0,0);
        Game memory game = Game(id, home, away, category, locktime, GameStatus.Open, result);
        games.push(game);
        GameCreated(id, home, away, category, locktime);
        return id;
    }

    function setGameResult (bytes32 game_id, int homeScore, int awayScore) {
        if (msg.sender != owner) throw;

        Game game = getGameById(game_id);
        game.result.home = homeScore;
        game.result.away = awayScore;
        game.status = GameStatus.Scored;

        // Currently only handles spread bets
        Bet[] bets = game.books[uint(BookType.Spread)].bets;
        int resultSpread = awayScore - homeScore;
        for (uint i = 0; i < bets.length; i++) {
            Bet bet = bets[i];
            if (resultSpread > bet.line) 
                balances[bet.away] += bet.amount * 2;
            else if (resultSpread < bet.line)
                balances[bet.home] += bet.amount * 2;
            else { // draw
                balances[bet.away] += bet.amount;
                balances[bet.home] += bet.amount;
            }
            bet.status = BetStatus.Paid;
        }
    }
        

    function bidSpread(bytes32 game_id, bool home, int64 line) payable returns (bool) {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        Bid memory bid = Bid(msg.sender, msg.value, home, line);

        // check game locktime
        if (game.status == GameStatus.Locked)
            return false;
        if (now > game.locktime) {
            game.status = GameStatus.Locked;    
            return false;
        }

        Bid memory remainingBid = matchExistingBids(bid, book, home, game_id);

        // Use leftover funds to place open bids (maker)
        if (bid.amount > 0) {
            Bid[] bidStack = home ? book.homeBids : book.awayBids;
            addBidToStack(remainingBid, bidStack);
            BidPlaced(game_id, BookType.Spread, msg.sender, msg.value, home, line);
        }

        return true;

    }

    function matchExistingBids(Bid bid, Book storage book, bool home, bytes32 game_id) private returns (Bid) {
        Bid[] matchStack = home ?  book.awayBids : book.homeBids;
        for (uint i = matchStack.length - 1; 
            -matchStack[i].line >= bid.line && bid.amount > 0 && i >= 0;
            i--)
        {
            address homeAddress = home ? bid.bidder : matchStack[i].bidder;
            address awayAddress = home ? matchStack[i].bidder : bid.bidder;
            uint betAmount = bid.amount < matchStack[i].amount ? bid.amount : matchStack[i].amount;
            int64 betLine = home ? -matchStack[i].line : matchStack[i].line;
            delete matchStack[i];
            Bet memory bet = Bet(homeAddress, awayAddress, betAmount, betLine, BetStatus.Open);
            book.bets.push(bet);
            BetPlaced(game_id, BookType.Spread, homeAddress, awayAddress, betAmount, betLine);
            bid.amount -= betAmount;
        }
        return bid;
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

    function test () constant returns (address) {
        return owner;
    }

    function getGameId (string home, string away, uint16 category, uint64 locktime) constant returns (bytes32) {
        uint i = 0;
        bytes memory a = bytes(home);
        bytes memory b = bytes(away);
        bytes2 c = bytes2(category);
        bytes8 d = bytes8(locktime);

        uint length = a.length + b.length + c.length + d.length;
        bytes memory toHash = new bytes(length);
        uint k = 0;
        for (i = 0; i < a.length; i++) { toHash[k] = a[i]; k++; }
        for (i = 0; i < b.length; i++) { toHash[k] = b[i]; k++; }
        for (i = 0; i < c.length; i++) { toHash[k] = c[i]; k++; }
        for (i = 0; i < d.length; i++) { toHash[k] = d[i]; k++; }
        return keccak256(toHash);
        
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
