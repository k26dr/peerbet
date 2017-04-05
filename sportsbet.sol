pragma solidity ^0.4.9;

contract SportsBet {
    enum GameStatus { Open, Locked, Scored }
    enum BookType { Spread, MoneyLine, OverUnder }
    enum BetStatus { Open, Paid }

    // indexing on a string causes issues with web3, so category has to be an int
    event GameCreated(bytes32 indexed id, string home, 
        string away, uint16 indexed category, uint64 locktime);
    event BidPlaced(bytes32 indexed game_id, BookType book, 
        address bidder, uint amount, bool home, int32 line);
    event BetPlaced(bytes32 indexed game_id, BookType book, 
        address home, address away, uint amount, int32 line);

    struct Bid {
        address bidder;
        uint amount; /* in wei */
        bool home; /* true=home, false=away */
        int32 line;
    }

    struct Bet {
        address home;
        address away;
        uint amount; /* in wei */
        int32 line;
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
        

    function bidSpread(bytes32 game_id, bool home, int32 line) payable returns (int) {
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
            int result = addBidToStack(remainingBid, bidStack);
            BidPlaced(game_id, BookType.Spread, remainingBid.bidder, remainingBid.amount, home, line);
        }

        return -1;
    }

    // returning an array of structs is not allowed, so its time for a hackjob
    function getOpenBids(bytes32 game_id) constant returns (bytes) {
        Game game = getGameById(game_id);
        Book book = game.books[uint(BookType.Spread)];
        uint nBids = book.homeBids.length + book.awayBids.length;
        bytes memory s = new bytes(57 * nBids);
        uint k = 0;
        for (uint i=0; i < nBids; i++) {
            Bid bid;
            if (i < book.homeBids.length)
                bid = book.homeBids[i];
            else
                bid = book.awayBids[i - book.homeBids.length];
            bytes20 bidder = bytes20(bid.bidder);
            bytes32 amount = bytes32(bid.amount);
            byte home = bid.home ? byte(1) : byte(0);
            bytes4 line = bytes4(bid.line);

            for (uint j=0; j < 20; j++) { s[k] = bidder[j]; k++; }
            for (j=0; j < 32; j++) { s[k] = amount[j]; k++; }
            s[k] = home; k++;
            for (j=0; j < 4; j++) { s[k] = line[j]; k++; }

        }

        return s;
    }
    
    function matchExistingBids(Bid bid, Book storage book, bool home, bytes32 game_id) private returns (Bid) {
        Bid[] matchStack = home ?  book.awayBids : book.homeBids;
        int i = int(matchStack.length) - 1;
        while (i >= 0 && bid.amount > 0) {
            uint j = uint(i);
            if (matchStack[j].amount == 0) { // deleted bids
                i--;
                continue;
            }
            if (-bid.line < matchStack[j].line)
                break;

            address homeAddress = home ? bid.bidder : matchStack[j].bidder;
            address awayAddress = home ? matchStack[j].bidder : bid.bidder;
            int32 betLine = home ? -matchStack[j].line : matchStack[j].line;
            uint betAmount;
            if (bid.amount < matchStack[j].amount) {
                betAmount = bid.amount;
                matchStack[j].amount -= betAmount;
            }
            else {
                betAmount = matchStack[j].amount;
                delete matchStack[j];
            }
            bid.amount -= betAmount;

            Bet memory bet = Bet(homeAddress, awayAddress, betAmount, betLine, BetStatus.Open);
            book.bets.push(bet);
            BetPlaced(game_id, BookType.Spread, homeAddress, awayAddress, betAmount, betLine);
            i--;
        }
        return bid;
    }

    function cancelBid(address bidder, bytes32 game_id, int32 line, bool home) returns (bool) {
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
        

    function addBidToStack(Bid bid, Bid[] storage stack) private returns (int) {
        stack.push(bid); // make stack one item larger

        if (stack.length <= 1)
            return 0;

        // insert into sorted stack
        uint i = stack.length - 2;
        uint lastIndex = stack.length - 1;
        while (true) {
            if (stack[i].amount == 0) { // ignore deleted bids
                i--;
                continue;
            }
            if (stack[i].line > bid.line)
                break;
            stack[lastIndex] = stack[i];
            lastIndex = i;

            // uint exhibits undefined behavior when you take it negative
            // so we have to break manually
            if (i == 0) 
                break;
            i--;
        }
        stack[lastIndex] = bid;
        return -1;
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
