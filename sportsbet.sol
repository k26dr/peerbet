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
        

    function bidSpread(bytes32 game_id, bool home, int64 line) payable returns (int result) {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        Bid memory bid = Bid(msg.sender, msg.value, home, line);

        // check game locktime
        if (game.status == GameStatus.Locked)
            return 1;
        if (now > game.locktime) {
            game.status = GameStatus.Locked;    
            return 2;
        }

        Bid memory remainingBid = matchExistingBids(bid, book, home, game_id);

        // Use leftover funds to place open bids (maker)
        if (bid.amount > 0) {
            Bid[] bidStack = home ? book.homeBids : book.awayBids;
            addBidToStack(remainingBid, bidStack);
            BidPlaced(game_id, BookType.Spread, msg.sender, msg.value, home, line);
        }

        return 0;

    }

    // returning an array of structs is not allowed, so its time for a hackjob
    function getOpenBids(bytes32 game_id) constant returns (bytes) {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        bytes memory s = new bytes(60 * book.homeBids.length);
        uint k = 0;
        for (uint i=0; i < book.homeBids.length; i++) {
            Bid bid = book.homeBids[i];
            bytes20 bidder = bytes20(bid.bidder);
            bytes32 amount = bytes32(bid.amount);
            byte home = bid.home ? byte(1) : byte(0);
            bytes8 line = bytes8(bid.line);

            for (uint j=0; j < bidder.length; j++) { s[k] = bidder[j]; k++; }
            for (j=0; j < 32; j++) { s[k] = amount[j]; k++; }
            s[k] = home; k++;
            for (j=0; j < 8; j++) { s[k] = line[j]; k++; }

        }
        return s;
    }

    function concat(string s1, string s2) constant returns (string) {
        bytes memory b1 = bytes(s1);
        bytes memory b2 = bytes(s2);
        bytes memory b3 = new bytes(b1.length + b2.length);
        uint k=0;
        for (uint i=0; i < b1.length; i++) { b3[k] = b1[i]; k++; }
        for (i=0; i < b2.length; i++) { b3[k] = b2[i]; k++; }
        return string(b3);
    }

    function matchExistingBids(Bid bid, Book storage book, bool home, bytes32 game_id) private returns (Bid) {
        Bid[] matchStack = home ?  book.awayBids : book.homeBids;
        int i = int(matchStack.length) - 1;
        while (i >= 0 && bid.amount > 0) {
            uint j = uint(i);
            if (-bid.line < matchStack[j].line)
                break;
            address homeAddress = home ? bid.bidder : matchStack[j].bidder;
            address awayAddress = home ? matchStack[j].bidder : bid.bidder;
            uint betAmount = bid.amount < matchStack[j].amount ? bid.amount : matchStack[j].amount;
            int64 betLine = home ? -matchStack[j].line : matchStack[j].line;
            delete matchStack[j];
            Bet memory bet = Bet(homeAddress, awayAddress, betAmount, betLine, BetStatus.Open);
            book.bets.push(bet);
            BetPlaced(game_id, BookType.Spread, homeAddress, awayAddress, betAmount, betLine);
            bid.amount -= betAmount;
            i--;
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
    
    function getActiveGames () returns (bytes32[]) {
        bytes32[] memory game_ids = new bytes32[](games.length);
        for (uint i=0; i < games.length; i++) {
            game_ids[i] = (games[i].id);
        }
        return game_ids;
    }
        

    function addBidToStack(Bid bid, Bid[] storage stack) private {
        int i = int(stack.length) - 1;
        stack.push(bid); // just to make the stack one item larger
        while (i >= 0) {
            uint j = uint(i);
            if (stack[j].amount > bid.amount)
                break;
            stack[j+1] = stack[j];
            i--;
        }
        stack[uint(i+1)] = bid;
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
