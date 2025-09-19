// game/GameEngine.js (FIXED - Working Game Flow)
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
      flight: null,
      gameLoop: null
    };

    // Auto-start game loop
    this.startGameLoop();
  }

  startGameLoop() {
    console.log('🎮 Starting automatic game loop...');
    
    // Start first game after 3 seconds
    setTimeout(() => {
      this.startNewGame();
    }, 3000);

    // Main game loop - runs every 100ms
    this.intervals.gameLoop = setInterval(() => {
      this.updateGame();
    }, 100);
  }

  updateGame() {
    const now = Date.now();

    switch (this.gameState) {
      case 'betting':
        // Check if betting phase should end (10 seconds)
        if (now - this.gameStartTime > 10000) {
          this.startFlight();
        }
        break;

      case 'flying':
        // Update multiplier
        const elapsed = now - this.gameStartTime;
        const progress = elapsed / 30000; // 30 second max flight
        
        // Smooth multiplier curve
        this.currentMultiplier = 1 + (Math.pow(progress * 3, 1.5));
        
        // Broadcast multiplier update
        this.io.emit('game:multiplierUpdate', {
          gameId: this.gameId,
          multiplier: this.currentMultiplier,
          elapsed: elapsed
        });

        // Check if should crash
        const crashChance = this.calculateCrashChance();
        if (Math.random() < crashChance || this.currentMultiplier >= this.crashPoint) {
          this.crashPlane();
        }
        break;
    }
  }

  calculateCrashChance() {
    // Higher multiplier = higher crash chance
    // Also consider the predetermined crash point
    const baseCrashChance = 0.001; // 0.1% per update
    const multiplierFactor = Math.pow(this.currentMultiplier - 1, 2) * 0.01;
    const crashPointFactor = this.currentMultiplier >= this.crashPoint * 0.95 ? 0.5 : 0;
    
    return baseCrashChance + multiplierFactor + crashPointFactor;
  }

  async startNewGame() {
    if (this.gameState !== 'waiting') return;

    this.gameId++;
    this.gameState = 'betting';
    this.activeBets.clear();
    this.currentMultiplier = 1.00;
    this.gameStartTime = Date.now();
    
    // Generate provably fair data
    this.serverSeed = ProvablyFair.generateServerSeed();
    this.clientSeed = ProvablyFair.generateClientSeed();
    this.hashedServerSeed = ProvablyFair.hashServerSeed(this.serverSeed);
    this.crashPoint = ProvablyFair.calculateCrashPoint(
      this.serverSeed, 
      this.clientSeed, 
      this.gameId
    );

    console.log(`🛩️ Game #${this.gameId} - Betting phase started (will crash at ${this.crashPoint.toFixed(2)}x)`);

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
      state: 'betting',
      multiplier: this.currentMultiplier,
      bettingTimeLeft: 10000
    });
  }

  startFlight() {
    if (this.gameState !== 'betting') return;

    console.log(`🚁 Game #${this.gameId} - Flight started with ${this.activeBets.size} bets`);

    this.gameState = 'flying';
    this.gameStartTime = Date.now();
    this.currentMultiplier = 1.00;

    this.io.emit('game:takeoff', {
      gameId: this.gameId,
      state: 'flying',
      multiplier: this.currentMultiplier,
      message: 'Plane is taking off! 🛫'
    });
  }

  async crashPlane() {
    if (this.gameState !== 'flying') return;

    this.gameState = 'crashed';
    const finalCrashPoint = this.currentMultiplier;

    console.log(`💥 Game #${this.gameId} - Crashed at ${finalCrashPoint.toFixed(2)}x (target was ${this.crashPoint.toFixed(2)}x)`);

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

          // Create loss transaction
          await new Transaction({
            userId: userId,
            type: 'loss',
            amount: -bet.betAmount,
            balanceBefore: user.balance + bet.betAmount,
            balanceAfter: user.balance,
            gameId: this.gameId,
            description: `Game loss at ${finalCrashPoint.toFixed(2)}x`
          }).save();
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
      totalPayout: totalPayout,
      state: 'crashed',
      multiplier: finalCrashPoint
    });

    // Wait 5 seconds then start new game
    this.gameState = 'waiting';
    setTimeout(() => {
      this.startNewGame();
    }, 5000);
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

    if (user.balance < amount || amount < 10 || amount > 10000) {
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
      firstName: user.firstName,
      amount: amount,
      totalBets: this.activeBets.size
    });

    console.log(`💰 Bet placed: ${user.username} - ${amount}⭐`);

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
      firstName: user.firstName,
      multiplier: this.currentMultiplier,
      payout: payout
    });

    console.log(`🎯 Cashout: ${user.username} - ${payout}⭐ at ${this.currentMultiplier.toFixed(2)}x`);

    return { 
      success: true, 
      payout: payout,
      multiplier: this.currentMultiplier,
      newBalance: user.balance
    };
  }

  getGameState() {
    return {
      gameId: this.gameId,
      state: this.gameState,
      currentMultiplier: this.currentMultiplier,
      activeBets: this.activeBets.size,
      hashedServerSeed: this.hashedServerSeed,
      crashPoint: this.gameState === 'crashed' ? this.crashPoint : null
    };
  }

  // Admin functions
  forceNextCrash(multiplier) {
    this.crashPoint = multiplier;
    console.log(`🎛️ Admin: Next game will crash at ${multiplier}x`);
  }

  destroy() {
    // Clean up intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    console.log('🛑 Game engine stopped');
  }
}

module.exports = GameEngine;