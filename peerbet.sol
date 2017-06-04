pragma solidity ^0.4.9;

contract PeerBet {
    enum GameStatus { Open, Locked, Scored }
    enum BetStatus { Open, Paid }

    // indexing on a string causes issues with web3, so category has to be an int
    event GameCreated(uint indexed id, address indexed creator, string home, 
        string away, uint16 indexed category, uint64 locktime);
    event BidPlaced(uint indexed game_id, address bidder, uint amount, bool over, int32 line);
    event BetPlaced(uint indexed game_id, address indexed user, bool over, uint amount, int32 line);
    event GameScored(uint indexed game_id, int homeScore, int awayScore, uint timestamp);
    event Withdrawal(address indexed user, uint amount, uint timestamp);

    struct Bid {
        address bidder;
        uint amount; /* in wei */
        bool over; 
        int32 line;
    }

    struct Bet {
        address over;
        address under;
        uint amount; /* in wei */
        int32 line;
        BetStatus status;
    }

    struct Book {
        Bid[] overBids;
        Bid[] underBids;
        Bet[] bets;
    }

    struct GameResult {
        int home;
        int away;
        uint timestamp; // when the game was scored
    }

    struct Game {
        uint id;
        address creator;
        string home;
        string away;
        uint16 category;
        uint64 locktime;
        GameStatus status;
        Book book;
        GameResult result;
    }

    address public owner;
    Game[] games;
    mapping(address => uint) public balances;
    uint counter; // used for ids

    function PeerBet() {
        owner = msg.sender;
        counter = 1;
    }

	function createGame (string home, string away, uint16 category, uint64 locktime) returns (int) {
        uint id = counter; 
        counter++;

        games.length += 1;
        Game game = games[games.length - 1];

        game.id = id;
        game.creator = msg.sender;
        game.home = home;
        game.away = away;
        game.category = category;
        game.locktime = locktime;
        game.status = GameStatus.Open;

        GameCreated(id, game.creator, home, away, category, locktime);
        return -1;
    }
    
    function cancelOpenBids(Book storage book) private returns (int) {
        for (uint i=0; i < book.overBids.length; i++) {
            Bid bid = book.overBids[i];
            balances[bid.bidder] += bid.amount;
        }
        delete book.overBids;
        for (i=0; i < book.underBids.length; i++) {
            bid = book.underBids[i];
            balances[bid.bidder] += bid.amount;
        }
        delete book.underBids;

        return -1;
    }

    function payBets(uint game_id) private returns (int) {
        Game game = getGameById(game_id);
        Bet[] bets = game.book.bets;

        int totalPoints = game.result.home + game.result.away;
        for (uint i=0; i < bets.length; i++) {
            Bet bet = bets[i];
            if (bet.status == BetStatus.Paid)
                continue;
            if (totalPoints > bet.line)
                balances[bet.over] += bet.amount * 2;
            else if (totalPoints < bet.line)
                balances[bet.under] += bet.amount * 2;
            else {
                balances[bet.under] += bet.amount;
                balances[bet.over] += bet.amount;
            }
            bet.status = BetStatus.Paid;
        }

        return -1;
    }

    function setGameResult(uint game_id, int homeScore, int awayScore) returns (int) {
        Game game = getGameById(game_id);
        if (msg.sender != game.creator) return 1;
        if (game.locktime > now) return 2;
        if (game.status == GameStatus.Scored) return 3;

        cancelOpenBids(game.book);

        game.result.home = homeScore;
        game.result.away = awayScore;
        game.result.timestamp = now;
        game.status = GameStatus.Scored;
        payBets(game_id);
        GameScored(game_id, homeScore, awayScore, now);

        return -1;
    }

    function bid(uint game_id, bool over, int32 line) payable returns (int) {
        Game game = getGameById(game_id);
        Bid memory bid = Bid(msg.sender, msg.value, over, line);

        // validate inputs: game status, gametime 
        if (game.status != GameStatus.Open)
            return 1;
        if (now > game.locktime) {
            game.status = GameStatus.Locked;    
            cancelOpenBids(game.book);
            return 2;
        }

        Bid memory remainingBid = matchExistingBids(bid, game_id);

        // Use leftover funds to place open bids (maker)
        if (remainingBid.amount > 0) {
            Bid[] bidStack = over ? game.book.overBids : game.book.underBids;
            if (over)
                addBidToStack(remainingBid, bidStack, true);
            else
                addBidToStack(remainingBid, bidStack, false);
            BidPlaced(game_id, msg.sender, remainingBid.amount, over, line);
        }

        return -1;
    }

    // returning an array of structs is not allowed, so its time for a hackjob
    // that returns a raw bytes dump of the combined home and away bids
    // clients will have to parse the hex dump to get the bids out
    function getOpenBids(uint game_id) constant returns (bytes) {
        Game game = getGameById(game_id);
        uint nBids = game.book.overBids.length + game.book.underBids.length;
        bytes memory s = new bytes(57 * nBids);
        uint k = 0;
        for (uint i=0; i < nBids; i++) {
            if (i < game.book.overBids.length)
                Bid bid = game.book.overBids[i];
            else
                bid = game.book.underBids[i - game.book.overBids.length];
            bytes20 bidder = bytes20(bid.bidder);
            bytes32 amount = bytes32(bid.amount);
            byte home = bid.over ? byte(1) : byte(0);
            bytes4 line = bytes4(bid.line);

            for (uint j=0; j < 20; j++) { s[k] = bidder[j]; k++; }
            for (j=0; j < 32; j++) { s[k] = amount[j]; k++; }
            s[k] = home; k++;
            for (j=0; j < 4; j++) { s[k] = line[j]; k++; }

        }

        return s;
    }

    function matchExistingBids(Bid bid, uint game_id) private returns (Bid) {
        Game game = getGameById(game_id);
        Bid[] matchStack = bid.over ?  game.book.underBids : game.book.overBids;

        int i = int(matchStack.length) - 1;
        while (i >= 0 && bid.amount > 0) {
            uint j = uint(i);
            if (matchStack[j].amount == 0) { // deleted bids
                i--;
                continue;
            }
            if (bid.over && bid.line < matchStack[j].line 
                || !bid.over && bid.line > matchStack[j].line)
                break;

            uint betAmount;
            if (bid.amount < matchStack[j].amount)
                betAmount = bid.amount;
            else 
                betAmount = matchStack[j].amount;
            bid.amount -= betAmount;
            matchStack[j].amount -= betAmount;

            Bet memory bet = Bet(
                bid.over ? bid.bidder : matchStack[j].bidder,
                bid.over ? matchStack[j].bidder : bid.bidder,
                betAmount,
                matchStack[j].line,
                BetStatus.Open
            );
            game.book.bets.push(bet);
            BetPlaced(game_id, bid.bidder, bid.over, betAmount, matchStack[j].line);
            BetPlaced(game_id, matchStack[j].bidder, !bid.over, betAmount, matchStack[j].line);
            i--;
        }
        return bid;
    }

    function kill () {
        if (msg.sender == owner) selfdestruct(owner);
    }

    function getActiveGames () constant returns (uint[]) {
        uint[] memory game_ids = new uint[](games.length);
        for (uint i=0; i < games.length; i++) {
            game_ids[i] = (games[i].id);
        }
        return game_ids;
    }
        
    function addBidToStack(Bid bid, Bid[] storage stack, bool reverse) private returns (int) {
        if (stack.length == 0) {
            stack.push(bid);
            return -1;
        }
        
        // determine position of new bid in stack
        uint insertIndex = stack.length;
        if (reverse) {
            while (insertIndex > 0 && bid.line <= stack[insertIndex-1].line)
                insertIndex--;
        }
        else {
            while (insertIndex > 0 && bid.line >= stack[insertIndex-1].line)
                insertIndex--;
        }
        
        // try to find deleted slot to fill
        if (insertIndex > 0 && stack[insertIndex - 1].amount == 0) {
            stack[insertIndex - 1] = bid;
            return -1;
        }
        uint shiftEndIndex = insertIndex;
        while (shiftEndIndex < stack.length && stack[shiftEndIndex].amount > 0) {
            shiftEndIndex++;
        }
        
        // shift bids down (up to deleted index if one exists)
        if (shiftEndIndex == stack.length)
            stack.length += 1;
        for (uint i = shiftEndIndex; i > insertIndex; i--) {
            stack[i] = stack[i-1];
        } 

        stack[insertIndex] = bid;
        

        return -1;
    }

    function getGameById(uint game_id) constant private returns (Game storage) {
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


    function withdraw() returns (int) {
        var balance = balances[msg.sender];
        balances[msg.sender] = 0;
        if (!msg.sender.send(balance)) {
            balances[msg.sender] = balance;
            return 1;
        }
        Withdrawal(msg.sender, balance, now);
        return -1;
    }

}
