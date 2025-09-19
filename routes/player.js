// routes/player.js (FIXED)
const express = require('express');
const router = express.Router();
const { User, Game, Transaction } = require('../db/database');
const rateLimit = require('express-rate-limit');

// Rate limiting
const betRateLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 1, // 1 bet per second per IP
  message: { error: 'Too many bets, slow down' }
});

const cashoutRateLimit = rateLimit({
  windowMs: 500, // 500ms
  max: 1, // 1 cashout per 500ms per IP
  message: { error: 'Too many cashout attempts' }
});

// Register/Login user
router.post('/register', async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    let user = await User.findOne({ telegramId });
    if (!user) {
      // Create new user
      user = new User({
        telegramId,
        username: username || `User${telegramId}`,
        firstName: firstName || 'Player',
        lastName: lastName || '',
        balance: 1000, // Starting balance
        referralCode: generateReferralCode()
      });
      
      await user.save();
      console.log(`👤 New user: ${user.username} (${telegramId})`);
      
      // Give welcome bonus
      await new Transaction({
        userId: telegramId,
        type: 'bonus',
        amount: 1000,
        balanceBefore: 0,
        balanceAfter: 1000,
        description: 'Welcome bonus'
      }).save();
      
    } else {
      // Update last active
      user.lastActive = new Date();
      await user.save();
    }
    
    res.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        balance: user.balance,
        isVIP: user.isVIP,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
router.get('/profile/:telegramId', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.params.telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user game stats
    const games = await Game.find({ 'bets.userId': parseInt(req.params.telegramId) });
    const totalGames = games.length;
    const wonGames = games.filter(game => 
      game.bets.some(bet => bet.userId === parseInt(req.params.telegramId) && bet.cashedOut)
    ).length;

    res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        balance: user.balance,
        totalBets: totalGames,
        totalWins: wonGames,
        totalWagered: user.totalWagered,
        totalWon: user.totalWon,
        winRate: totalGames > 0 ? ((wonGames / totalGames) * 100).toFixed(1) : 0,
        joinDate: user.joinDate,
        isVIP: user.isVIP
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Place bet
router.post('/bet', betRateLimit, async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!telegramId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const numAmount = parseInt(amount);
    if (numAmount < 10 || numAmount > 10000) {
      return res.status(400).json({ error: 'Invalid bet amount (10-10000 stars)' });
    }
    
    const result = await req.gameEngine.placeBet(telegramId, numAmount);
    res.json(result);
  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cash out
router.post('/cashout', cashoutRateLimit, async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    const result = await req.gameEngine.cashOut(telegramId);
    res.json(result);
  } catch (error) {
    console.error('Cashout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current game state
router.get('/game-state', (req, res) => {
  try {
    const gameState = req.gameEngine.getGameState();
    res.json(gameState);
  } catch (error) {
    console.error('Game state error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get game history
router.get('/history/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    
    const games = await Game.find({ 'bets.userId': parseInt(telegramId) })
      .sort({ gameId: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('gameId crashPoint bets createdAt');
    
    const userGames = games.map(game => {
      const userBet = game.bets.find(bet => bet.userId === parseInt(telegramId));
      if (!userBet) return null;
      
      return {
        gameId: game.gameId,
        crashPoint: game.crashPoint,
        betAmount: userBet.betAmount,
        cashoutMultiplier: userBet.cashoutMultiplier,
        payout: userBet.payout,
        profit: userBet.profit,
        cashedOut: userBet.cashedOut,
        timestamp: game.createdAt
      };
    }).filter(Boolean);

    res.json({ games: userGames });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent game history (for UI)
router.get('/recent-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const games = await Game.find()
      .sort({ gameId: -1 })
      .limit(limit)
      .select('gameId crashPoint createdAt');
    
    const history = games.map(game => ({
      gameId: game.gameId,
      crashPoint: parseFloat(game.crashPoint.toFixed(2)),
      timestamp: game.createdAt
    }));

    res.json({ history });
  } catch (error) {
    console.error('Recent history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transaction history
router.get('/transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type; // filter by type
    
    let query = { userId: parseInt(telegramId) };
    if (type) query.type = type;
    
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({ transactions });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify game
router.get('/verify/:gameId', async (req, res) => {
  try {
    const game = await Game.findOne({ gameId: parseInt(req.params.gameId) });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const ProvablyFair = require('../game/ProvablyFair');
    const calculatedCrash = ProvablyFair.calculateCrashPoint(
      game.serverSeed,
      game.clientSeed,
      game.gameId
    );

    const isValid = Math.abs(calculatedCrash - game.crashPoint) < 0.01;

    res.json({
      gameId: game.gameId,
      serverSeed: game.serverSeed,
      clientSeed: game.clientSeed,
      crashPoint: game.crashPoint,
      calculatedCrash: calculatedCrash,
      isValid: isValid,
      timestamp: game.createdAt
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Daily bonus
router.post('/bonus/daily', async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const lastBonus = user.lastDailyBonus || new Date(0);
    const timeSinceLastBonus = now - lastBonus;
    const hoursUntilNext = Math.max(0, 24 - (timeSinceLastBonus / (1000 * 60 * 60)));

    if (hoursUntilNext > 0) {
      return res.json({
        success: false,
        message: `Next bonus available in ${hoursUntilNext.toFixed(1)} hours`,
        hoursLeft: hoursUntilNext
      });
    }

    // Give daily bonus
    const bonusAmount = user.isVIP ? 200 : 100;
    const balanceBefore = user.balance;
    user.balance += bonusAmount;
    user.lastDailyBonus = now;
    await user.save();

    // Create transaction
    await new Transaction({
      userId: telegramId,
      type: 'bonus',
      amount: bonusAmount,
      balanceBefore: balanceBefore,
      balanceAfter: user.balance,
      description: 'Daily bonus'
    }).save();

    res.json({
      success: true,
      bonus: bonusAmount,
      newBalance: user.balance,
      message: `Daily bonus claimed: ${bonusAmount}⭐`
    });
  } catch (error) {
    console.error('Daily bonus error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const type = req.query.type || 'profit'; // profit, wins, wagered
    const limit = parseInt(req.query.limit) || 10;
    
    let sortField;
    switch (type) {
      case 'wins':
        sortField = 'totalWins';
        break;
      case 'wagered':
        sortField = 'totalWagered';
        break;
      default:
        sortField = 'totalWon';
    }
    
    const users = await User.find({ isBanned: false })
      .sort({ [sortField]: -1 })
      .limit(limit)
      .select('username firstName totalWins totalWon totalWagered isVIP');
    
    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      username: user.username,
      firstName: user.firstName,
      totalWins: user.totalWins,
      totalWon: user.totalWon,
      totalWagered: user.totalWagered,
      profit: user.totalWon - user.totalWagered,
      isVIP: user.isVIP
    }));

    res.json({ leaderboard, type });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = router;