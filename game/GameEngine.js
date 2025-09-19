

// game/GameEngine.js
const { User, Game, Transaction } = require('../db/database');
const ProvablyFair = require('./ProvablyFair');

class GameEngine {
  constructor(io) {
    this.io = io;
    this.gameState = 'waiting';
    this.currentGame = null;
    this.activeBets = new Map();
    this.gameId = 0;
    this.serverSeed = null;
    this.clientSeed = null;
    this.hashedServerSeed = null;
    this.crashPoint = 0;
    this.currentMultiplier = 1.00;
    this.gameStartTime = null;
    this.intervals = {
      betting: null,
      flight: null
    };
  }

  async startNewGame() {
    this.gameId++;
    this.gameState = 'betting';
    this.activeBets.clear();
    this.currentMultiplier = 1.00;
    
    // Generate provably fair data
    this.serverSeed = ProvablyFair.generateServerSeed();
    this.clientSeed = ProvablyFair.generateClientSeed();
    this.hashedServerSeed = ProvablyFair.hashServerSeed(this.serverSeed);
    this.crashPoint = ProvablyFair.calculateCrashPoint(
      this.serverSeed, 
      this.clientSeed, 
      this.gameId
    );

    // Create game record
    this.currentGame = new Game({
      gameId: this.gameId,
      crashPoint: this.crashPoint,
      serverSeed: this.serverSeed,
      clientSeed: this.clientSeed,
      hashedServerSeed: this.hashedServerSeed,
      bets: [],
      startTime: new Date()
    });

    // Broadcast betting phase
    this.io.emit('game:bettingPhase', {
      gameId: this.gameId,
      hashedServerSeed: this.hashedServerSeed,
      bettingTimeLeft: 10000 // 10 seconds
    });

    console.log(`🛩️ Game #${this.gameId} - Betting phase started (crash: ${this.crashPoint.toFixed(2)}x)`);

    // Set betting timeout
    this.intervals.betting = setTimeout(() => {
      this.startFlight();
    }, 10000);
  }

  async placeBet(telegramId, amount) {
    if (this.gameState !== 'betting') {
      return { success: false, error: 'Betting phase ended' };
    }

    if (this.activeBets.has(telegramId)) {
      return { success: false, error: 'Already placed bet this round' };
    }

    const user = await User.findOne({ telegramId });
    if (!user || user.isBanned) {
      return { success: false, error: 'User not found or banned' };
    }

    if (user.balance < amount || amount < 1 || amount > 10000) {
      return { success: false, error: 'Invalid bet amount' };
    }

    // Deduct balance
    user.balance -= amount;
    user.totalWagered += amount;
    await user.save();

    // Record bet
    this.activeBets.set(telegramId, {
      userId: telegramId,
      username: user.username,
      betAmount: amount,
      cashoutMultiplier: null,
      payout: 0,
      profit: -amount,
      cashedOut: false,
      timestamp: Date.now()
    });

    // Create transaction
    await new Transaction({
      userId: telegramId,
      type: 'bet',
      amount: -amount,
      balanceBefore: user.balance + amount,
      balanceAfter: user.balance,
      gameId: this.gameId,
      description: `Bet placed in game #${this.gameId}`
    }).save();

    // Broadcast bet placed
    this.io.emit('game:betPlaced', {
      gameId: this.gameId,
      username: user.username,
      amount: amount,
      totalBets: this.activeBets.size
    });

    return { 
      success: true, 
      newBalance: user.balance,
      totalBets: this.activeBets.size
    };
  }

  async cashOut(telegramId) {
    if (this.gameState !== 'flying') {
      return { success: false, error: 'Cannot cash out now' };
    }

    const bet = this.activeBets.get(telegramId);
    if (!bet || bet.cashedOut) {
      return { success: false, error: 'No active bet found' };
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Calculate payout
    const payout = Math.floor(bet.betAmount * this.currentMultiplier);
    const profit = payout - bet.betAmount;

    // Update bet record
    bet.cashoutMultiplier = this.currentMultiplier;
    bet.payout = payout;
    bet.profit = profit;
    bet.cashedOut = true;

    // Update user balance
    user.balance += payout;
    user.totalWins += 1;
    user.totalWon += payout;
    await user.save();

    // Create transaction
    await new Transaction({
      userId: telegramId,
      type: 'win',
      amount: payout,
      balanceBefore: user.balance - payout,
      balanceAfter: user.balance,
      gameId: this.gameId,
      description: `Cashout at ${this.currentMultiplier.toFixed(2)}x in game #${this.gameId}`
    }).save();

    // Broadcast cashout
    this.io.emit('game:cashOut', {
      gameId: this.gameId,
      username: user.username,
      multiplier: this.currentMultiplier,
      payout: payout
    });

    return { 
      success: true, 
      payout: payout,
      multiplier: this.currentMultiplier,
      newBalance: user.balance
    };
  }

  startFlight() {
    if (this.activeBets.size === 0) {
      console.log('No bets placed, starting new round');
      setTimeout(() => this.startNewGame(), 3000);
      return;
    }

    this.gameState = 'flying';
    this.gameStartTime = Date.now();
    this.currentMultiplier = 1.00;

    this.io.emit('game:takeoff', {
      gameId: this.gameId,
      message: 'Plane is taking off! 🛫'
    });

    console.log(`🚁 Game #${this.gameId} - Flight started with ${this.activeBets.size} bets`);

    this.flightLoop();
  }

  flightLoop() {
    if (this.gameState !== 'flying') return;

    const elapsed = Date.now() - this.gameStartTime;
    const maxDuration = 30000; // 30 seconds max
    const progress = Math.min(elapsed / maxDuration, 1);
    
    // Smooth multiplier increase
    this.currentMultiplier = 1 + (Math.pow(progress, 0.4) * (this.crashPoint - 1));

    // Check if we've reached crash point
    if (this.currentMultiplier >= this.crashPoint) {
      this.crashPlane();
      return;
    }

    // Broadcast current multiplier
    this.io.emit('game:multiplierUpdate', {
      gameId: this.gameId,
      multiplier: this.currentMultiplier,
      elapsed: elapsed
    });

    // Continue flight
    this.intervals.flight = setTimeout(() => {
      this.flightLoop();
    }, 50);
  }

  async crashPlane() {
    this.gameState = 'crashed';
    clearTimeout(this.intervals.flight);

    const finalCrashPoint = this.crashPoint;
    let totalBets = 0;
    let totalPayout = 0;

    // Process all bets
    const betResults = [];
    for (const [userId, bet] of this.activeBets) {
      totalBets += bet.betAmount;

      if (bet.cashedOut) {
        totalPayout += bet.payout;
      } else {
        // User didn't cash out - they lose
        const user = await User.findOne({ telegramId: userId });
        if (user) {
          user.totalBets += 1;
          await user.save();
        }
      }

      betResults.push({
        userId: bet.userId,
        username: bet.username,
        betAmount: bet.betAmount,
        cashoutMultiplier: bet.cashoutMultiplier,
        payout: bet.payout,
        profit: bet.profit,
        cashedOut: bet.cashedOut
      });
    }

    // Save game to database
    this.currentGame.bets = betResults;
    this.currentGame.totalBets = totalBets;
    this.currentGame.totalPayout = totalPayout;
    this.currentGame.houseProfit = totalBets - totalPayout;
    this.currentGame.endTime = new Date();
    await this.currentGame.save();

    // Broadcast crash
    this.io.emit('game:crashed', {
      gameId: this.gameId,
      crashPoint: finalCrashPoint,
      serverSeed: this.serverSeed,
      clientSeed: this.clientSeed,
      results: betResults,
      totalBets: totalBets,
      totalPayout: totalPayout
    });

    console.log(`💥 Game #${this.gameId} - Crashed at ${finalCrashPoint.toFixed(2)}x`);

    // Start new game after 5 seconds
    setTimeout(() => {
      this.startNewGame();
    }, 5000);
  }

  getGameState() {
    return {
      gameId: this.gameId,
      state: this.gameState,
      currentMultiplier: this.currentMultiplier,
      activeBets: this.activeBets.size,
      hashedServerSeed: this.hashedServerSeed
    };
  }
}

module.exports = GameEngine;