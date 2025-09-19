// routes/player.js
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

// Register/Login user
router.post('/register', async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;
    
    let user = await User.findOne({ telegramId });
    if (!user) {
      // Create new user
      user = new User({
        telegramId,
        username: username || `User${telegramId}`,
        firstName,
        lastName,
        balance: 1000, // Starting balance
        referralCode: generateReferralCode()
      });
      
      await user.save();
      console.log(`👤 New user: ${user.username} (${telegramId})`);
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
        balance: user.balance,
        isVIP: user.isVIP,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
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

    // Get user stats
    const totalGames = await Game.countDocuments({ 
      'bets.userId': user.telegramId 
    });
    
    const wonGames = await Game.countDocuments({ 
      'bets.userId': user.telegramId,
      'bets.cashedOut': true 
    });

    res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        balance: user.balance,
        totalBets: user.totalBets,
        totalWins: user.totalWins,
        totalWagered: user.totalWagered,
        totalWon: user.totalWon,
        winRate: totalGames > 0 ? ((wonGames / totalGames) * 100).toFixed(1) : 0,
        joinDate: user.joinDate,
        isVIP: user.isVIP
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place bet
router.post('/bet', betRateLimit, async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    const result = await req.gameEngine.placeBet(telegramId, amount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cash out
router.post('/cashout', async (req, res) => {
  try {
    const { telegramId } = req.body;
    const result = await req.gameEngine.cashOut(telegramId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get game history
router.get('/history/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const games = await Game.find({ 'bets.userId': parseInt(telegramId) })
      .sort({ gameId: -1 })
      .limit(limit)
      .select('gameId crashPoint bets createdAt');
    
    const userGames = games.map(game => {
      const userBet = game.bets.find(bet => bet.userId === parseInt(telegramId));
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
    });

    res.json({ games: userGames });
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
});

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

module.exports = router;