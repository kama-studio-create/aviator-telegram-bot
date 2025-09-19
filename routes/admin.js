// routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { User, Game, Transaction } = require('../db/database');

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin login
router.post('/login', (req, res) => {
  const { password } = req.body;
  
  if (password !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { role: 'admin', timestamp: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ success: true, token });
});

// Dashboard stats
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const totalGames = await Game.countDocuments();
    const totalProfit = await Game.aggregate([
      { $group: { _id: null, total: { $sum: '$houseProfit' } } }
    ]);
    
    const recentGames = await Game.find()
      .sort({ gameId: -1 })
      .limit(10)
      .select('gameId crashPoint totalBets totalPayout houseProfit createdAt');

    res.json({
      totalUsers,
      activeUsers,
      totalGames,
      totalProfit: totalProfit[0]?.total || 0,
      currentGame: req.gameEngine.getGameState(),
      recentGames
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User management
router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search;
    
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { telegramId: parseInt(search) || 0 }
      ];
    }

    const users = await User.find(query)
      .sort({ lastActive: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add bonus to user
router.post('/users/:telegramId/bonus', adminAuth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const telegramId = parseInt(req.params.telegramId);
    
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const balanceBefore = user.balance;
    user.balance += amount;
    await user.save();

    // Create transaction
    await new Transaction({
      userId: telegramId,
      type: 'bonus',
      amount: amount,
      balanceBefore: balanceBefore,
      balanceAfter: user.balance,
      description: reason || 'Admin bonus'
    }).save();

    res.json({ 
      success: true, 
      newBalance: user.balance,
      message: `Added ${amount} stars to ${user.username}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban/unban user
router.post('/users/:telegramId/ban', adminAuth, async (req, res) => {
  try {
    const { action, reason } = req.body; // action: 'ban' or 'unban'
    const telegramId = parseInt(req.params.telegramId);
    
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isBanned = action === 'ban';
    await user.save();

    res.json({ 
      success: true,
      message: `User ${user.username} has been ${action}ned`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Game history with detailed stats
router.get('/games', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    const games = await Game.find()
      .sort({ gameId: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const stats = await Game.aggregate([
      {
        $group: {
          _id: null,
          totalProfit: { $sum: '$houseProfit' },
          totalBets: { $sum: '$totalBets' },
          totalPayout: { $sum: '$totalPayout' },
          avgCrashPoint: { $avg: '$crashPoint' },
          totalGames: { $sum: 1 }
        }
      }
    ]);

    res.json({
      games,
      stats: stats[0] || {},
      pagination: {
        page,
        limit,
        total: await Game.countDocuments()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force crash next game (for testing)
router.post('/games/force-crash', adminAuth, async (req, res) => {
  try {
    const { multiplier } = req.body;
    
    if (multiplier < 1.0 || multiplier > 100.0) {
      return res.status(400).json({ error: 'Invalid multiplier range' });
    }

    // This would need to be implemented in the game engine
    // req.gameEngine.forceNextCrash(multiplier);
    
    res.json({ 
      success: true, 
      message: `Next game will crash at ${multiplier}x` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send broadcast message
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const { message, type } = req.body;
    
    // Broadcast to all connected clients
    req.io.emit('admin:broadcast', {
      message,
      type: type || 'info',
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;