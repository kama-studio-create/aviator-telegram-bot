const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import Telegram bot
const AviatorTelegramBot = require('./telegram-bot');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
  WEB_APP_URL: process.env.WEB_APP_URL || 'https://your-domain.com',
  PORT: process.env.PORT || 3000,
  RTP: parseFloat(process.env.RTP) || 0.98,
  HOUSE_EDGE: parseFloat(process.env.HOUSE_EDGE) || 0.02,
  GAME_DURATION: parseInt(process.env.GAME_DURATION) || 30000,
  BET_PHASE_DURATION: parseInt(process.env.BET_PHASE_DURATION) || 5000,
  MIN_BET: parseInt(process.env.MIN_BET) || 1,
  MAX_BET: parseInt(process.env.MAX_BET) || 1000,
  STARTING_BALANCE: parseInt(process.env.STARTING_BALANCE) || 1000,
  ADMIN_SECRET: process.env.ADMIN_SECRET || 'admin123',
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_here'
};

// Global storage (use database in production)
let users = new Map();
let gameHistory = [];
let activeConnections = new Map();
let currentGameState = {
  gameId: 0,
  state: 'waiting',
  currentMultiplier: 1.00,
  crashPoint: 0,
  bets: new Map(),
  startTime: null
};

// Provably Fair System
class ProvablyFair {
  static generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  static generateClientSeed() {
    return Math.random().toString(36).substring(2, 15);
  }

  static calculateCrashPoint(serverSeed, clientSeed, nonce) {
    const hash = crypto.createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');

    const hashInt = parseInt(hash.substr(0, 8), 16);
    const e = Math.pow(2, 32);
    const crashPoint = (e / (e - hashInt)) * (1 - CONFIG.HOUSE_EDGE);
    
    return Math.max(1.00, Math.min(crashPoint, 1000.00));
  }
}

// User Management
function createUser(telegramData) {
  const user = {
    telegramId: telegramData.telegramId,
    username: telegramData.username || `User${telegramData.telegramId}`,
    firstName: telegramData.firstName || 'User',
    balance: CONFIG.STARTING_BALANCE,
    totalBets: 0,
    totalWins: 0,
    totalWagered: 0,
    totalWon: 0,
    joinDate: new Date(),
    lastActive: new Date(),
    isVIP: false,
    isBanned: false
  };
  
  users.set(telegramData.telegramId, user);
  console.log(`👤 New user created: ${user.username} (${user.telegramId})`);
  
  return user;
}

// Game Engine
class GameEngine {
  constructor() {
    this.gameState = 'waiting';
    this.currentMultiplier = 1.00;
    this.crashPoint = 0;
    this.gameId = 0;
    this.bets = new Map();
    this.serverSeed = null;
    this.clientSeed = null;
    this.startTime = null;
    this.gameInterval = null;
    this.bettingTimeout = null;
  }

  startBettingPhase() {
    this.gameId++;
    this.gameState = 'betting';
    this.bets.clear();
    this.currentMultiplier = 1.00;
    
    this.serverSeed = ProvablyFair.generateServerSeed();
    this.clientSeed = ProvablyFair.generateClientSeed();
    this.crashPoint = ProvablyFair.calculateCrashPoint(this.serverSeed, this.clientSeed, this.gameId);
    
    console.log(`🛩️ Flight #${this.gameId} - Crash altitude: ${this.crashPoint.toFixed(2)}x`);
    
    // Update global state
    currentGameState = {
      gameId: this.gameId,
      state: this.gameState,
      currentMultiplier: this.currentMultiplier,
      crashPoint: this.crashPoint,
      bets: this.bets,
      startTime: null
    };
    
    // Broadcast to all clients (frontend + admin)
    io.emit('bettingPhase', {
      gameId: this.gameId,
      timeLeft: CONFIG.BET_PHASE_DURATION,
      minBet: CONFIG.MIN_BET,
      maxBet: CONFIG.MAX_BET
    });

    this.bettingTimeout = setTimeout(() => {
      this.startFlight();
    }, CONFIG.BET_PHASE_DURATION);
  }

  startFlight() {
    if (this.bets.size === 0) {
      console.log('⏭️ No passengers, preparing new flight');
      setTimeout(() => this.startBettingPhase(), 3000);
      return;
    }

    this.gameState = 'playing';
    this.startTime = Date.now();
    this.currentMultiplier = 1.00;
    
    // Update global state
    currentGameState.state = this.gameState;
    currentGameState.startTime = this.startTime;

    io.emit('flightStarted', {
      gameId: this.gameId,
      message: 'Plane is taking off! 🛫'
    });

    this.flightLoop();
  }

  flightLoop() {
    if (this.gameState !== 'playing') return;

    const elapsed = Date.now() - this.startTime;
    const progress = Math.min(elapsed / CONFIG.GAME_DURATION, 1);
    this.currentMultiplier = 1 + (Math.pow(progress, 0.5) * (this.crashPoint - 1));
    
    // Update global state
    currentGameState.currentMultiplier = this.currentMultiplier;
    
    if (this.currentMultiplier >= this.crashPoint || elapsed >= CONFIG.GAME_DURATION) {
      this.crashPlane();
      return;
    }

    // Broadcast to all clients
    io.emit('altitudeUpdate', {
      altitude: Math.round(this.currentMultiplier * 100) / 100,
      elapsed: elapsed
    });

    this.gameInterval = setTimeout(() => {
      this.flightLoop();
    }, 50);
  }

  crashPlane() {
    this.gameState = 'crashed';
    const finalCrashPoint = this.crashPoint;

    if (this.gameInterval) {
      clearTimeout(this.gameInterval);
      this.gameInterval = null;
    }

    const results = [];
    let totalBets = 0;
    let totalPayout = 0;

    this.bets.forEach((bet, userId) => {
      totalBets += bet.amount;
      const user = users.get(userId);
      
      if (bet.bailoutMultiplier && bet.bailoutMultiplier <= finalCrashPoint) {
        const payout = Math.floor(bet.amount * bet.bailoutMultiplier);
        totalPayout += payout;
        user.balance += payout;
        user.totalWins += 1;
        user.totalWon += payout;
        
        results.push({
          userId,
          username: user.username,
          bet: bet.amount,
          bailout: bet.bailoutMultiplier,
          payout,
          survived: true
        });
      } else {
        user.totalBets += 1;
        user.totalWagered += bet.amount;
        
        results.push({
          userId,
          username: user.username,
          bet: bet.amount,
          survived: false
        });
      }
    });

    const gameResult = {
      gameId: this.gameId,
      crashPoint: finalCrashPoint,
      serverSeed: this.serverSeed,
      clientSeed: this.clientSeed,
      results,
      totalBets,
      totalPayout,
      houseProfit: totalBets - totalPayout,
      timestamp: new Date()
    };

    gameHistory.unshift(gameResult);
    if (gameHistory.length > 100) {
      gameHistory.pop();
    }

    // Update global state
    currentGameState.state = this.gameState;

    // Broadcast to all clients
    io.emit('planeCrashed', {
      gameId: this.gameId,
      crashPoint: finalCrashPoint,
      serverSeed: this.serverSeed,
      clientSeed: this.clientSeed,
      results,
      message: '💥 Plane crashed!'
    });

    setTimeout(() => {
      this.startBettingPhase();
    }, 3000);
  }

  placeBet(userId, amount) {
    if (this.gameState !== 'betting') {
      return { success: false, message: 'Betting phase is over' };
    }

    const user = users.get(userId);
    if (!user || user.isBanned) {
      return { success: false, message: 'User not found or banned' };
    }

    if (user.balance < amount || amount < CONFIG.MIN_BET || amount > CONFIG.MAX_BET) {
      return { success: false, message: 'Invalid bet amount' };
    }

    if (this.bets.has(userId)) {
      return { success: false, message: 'Ticket already purchased' };
    }

    user.balance -= amount;
    this.bets.set(userId, {
      amount,
      bailoutMultiplier: null,
      timestamp: Date.now()
    });

    // Broadcast to all clients
    io.emit('ticketPurchased', {
      userId,
      username: user.username,
      amount,
      totalPassengers: this.bets.size
    });

    return { success: true, newBalance: user.balance };
  }

  bailOut(userId) {
    if (this.gameState !== 'playing') {
      return { success: false, message: 'Cannot bail out now' };
    }

    const bet = this.bets.get(userId);
    if (!bet || bet.bailoutMultiplier) {
      return { success: false, message: 'No active bet or already bailed out' };
    }

    bet.bailoutMultiplier = this.currentMultiplier;
    const payout = Math.floor(bet.amount * this.currentMultiplier);
    
    const user = users.get(userId);
    user.balance += payout;

    // Broadcast to all clients
    io.emit('passengerBailedOut', {
      userId,
      username: user.username,
      altitude: this.currentMultiplier,
      payout
    });

    return { success: true, payout, newBalance: user.balance };
  }
}

const gameEngine = new GameEngine();

// Authentication middleware for admin
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// =================
// PLAYER API ROUTES
// =================

app.post('/api/register', (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID required' });
  }
  
  let user = users.get(telegramId);
  if (!user) {
    user = createUser({ telegramId, username, firstName, lastName });
  } else {
    user.lastActive = new Date();
  }
  
  res.json({ success: true, user });
});

app.get('/api/user/:telegramId', (req, res) => {
  const telegramId = parseInt(req.params.telegramId);
  const user = users.get(telegramId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.lastActive = new Date();
  res.json(user);
});

app.post('/api/bet', (req, res) => {
  const { telegramId, amount } = req.body;
  const result = gameEngine.placeBet(telegramId, amount);
  res.json(result);
});

app.post('/api/bailout', (req, res) => {
  const { telegramId } = req.body;
  const result = gameEngine.bailOut(telegramId);
  res.json(result);
});

app.get('/api/game-history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(gameHistory.slice(0, limit));
});

app.get('/api/verify/:gameId', (req, res) => {
  const gameId = parseInt(req.params.gameId);
  const game = gameHistory.find(g => g.gameId === gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const isValid = Math.abs(
    ProvablyFair.calculateCrashPoint(game.serverSeed, game.clientSeed, gameId) - game.crashPoint
  ) < 0.01;

  res.json({
    gameId,
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    crashPoint: game.crashPoint,
    isValid
  });
});

// ================
// ADMIN API ROUTES
// ================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password !== CONFIG.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { role: 'admin', timestamp: Date.now() },
    CONFIG.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ success: true, token });
});

app.get('/api/admin/dashboard', authenticateAdmin, (req, res) => {
  const totalUsers = users.size;
  const activeUsers = Array.from(users.values())
    .filter(u => u.lastActive >= new Date(Date.now() - 24 * 60 * 60 * 1000)).length;
  
  const totalRevenue = gameHistory.reduce((sum, game) => sum + game.houseProfit, 0);
  const totalGames = gameHistory.length;

  res.json({
    totalUsers,
    activeUsers,
    totalRevenue,
    totalGames,
    currentGame: {
      gameId: currentGameState.gameId,
      state: currentGameState.state,
      players: currentGameState.bets.size,
      currentMultiplier: currentGameState.currentMultiplier
    }
  });
});

app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  const filter = req.query.filter || 'all';
  let userList = Array.from(users.values());
  
  switch (filter) {
    case 'active':
      userList = userList.filter(u => 
        u.lastActive >= new Date(Date.now() - 24 * 60 * 60 * 1000)
      );
      break;
    case 'banned':
      userList = userList.filter(u => u.isBanned);
      break;
    case 'vip':
      userList = userList.filter(u => u.isVIP);
      break;
  }

  res.json({ users: userList.slice(0, 50) });
});

app.post('/api/admin/users/:userId/bonus', authenticateAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const { amount } = req.body;
  
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.balance += amount;
  res.json({ success: true, newBalance: user.balance });
});

app.post('/api/admin/users/:userId/ban', authenticateAdmin, (req, res) => {
  const userId = parseInt(req.params.userId);
  const { action } = req.body;
  
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.isBanned = action === 'ban';
  res.json({ success: true, message: `User ${action}ned successfully` });
});

app.post('/api/admin/games/force-crash', authenticateAdmin, (req, res) => {
  const { multiplier } = req.body;
  
  if (multiplier < 1.0 || multiplier > 1000) {
    return res.status(400).json({ error: 'Invalid multiplier' });
  }

  // Override next crash point
  gameEngine.crashPoint = multiplier;
  
  res.json({ 
    success: true, 
    message: `Next crash set to ${multiplier}x` 
  });
});

app.get('/api/admin/games/history', authenticateAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const games = gameHistory.slice(0, limit);
  
  res.json({
    games,
    summary: {
      totalProfit: games.reduce((sum, g) => sum + g.houseProfit, 0),
      averageCrash: games.reduce((sum, g) => sum + g.crashPoint, 0) / games.length
    }
  });
});

app.post('/api/admin/notifications/broadcast', authenticateAdmin, (req, res) => {
  const { message, type } = req.body;
  
  // Broadcast to all connected clients
  io.emit('adminNotification', {
    message,
    type: type || 'info',
    timestamp: new Date()
  });
  
  res.json({ success: true });
});

app.get('/api/admin/system/status', authenticateAdmin, (req, res) => {
  const memUsage = process.memoryUsage();
  
  res.json({
    uptime: process.uptime(),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024)
    },
    activeConnections: activeConnections.size,
    currentGame: {
      id: currentGameState.gameId,
      state: currentGameState.state,
      players: currentGameState.bets.size
    }
  });
});

// ==================
// WEBSOCKET HANDLING
// ==================

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Store connection info
  activeConnections.set(socket.id, {
    connectTime: Date.now(),
    userAgent: socket.handshake.headers['user-agent']
  });
  
  // Send current game state to new connection
  socket.emit('gameState', {
    gameId: currentGameState.gameId,
    state: currentGameState.state,
    currentMultiplier: currentGameState.currentMultiplier,
    totalPlayers: currentGameState.bets.size,
    config: {
      minBet: CONFIG.MIN_BET,
      maxBet: CONFIG.MAX_BET,
      rtp: CONFIG.RTP
    }
  });

  // Handle user authentication
  socket.on('authenticate', (data) => {
    if (data.telegramId) {
      socket.userId = data.telegramId;
      socket.username = data.username;
      console.log(`👤 User authenticated: ${data.username} (${data.telegramId})`);
    }
  });

  // Handle admin authentication
  socket.on('adminAuth', (data) => {
    try {
      const decoded = jwt.verify(data.token, CONFIG.JWT_SECRET);
      socket.isAdmin = true;
      console.log(`👑 Admin authenticated: ${socket.id}`);
      
      // Send admin-specific data
      socket.emit('adminData', {
        totalUsers: users.size,
        gameHistory: gameHistory.slice(0, 10),
        activeConnections: activeConnections.size
      });
    } catch (error) {
      socket.emit('authError', { message: 'Invalid admin token' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.username || socket.id}`);
    activeConnections.delete(socket.id);
  });
});

// =============
// STATIC ROUTES
// =============

// Serve main game interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    endpoints: {
      player: {
        'POST /api/register': 'Register new user',
        'GET /api/user/:id': 'Get user info',
        'POST /api/bet': 'Place bet',
        'POST /api/bailout': 'Cash out',
        'GET /api/game-history': 'Get game history',
        'GET /api/verify/:gameId': 'Verify game result'
      },
      admin: {
        'POST /api/admin/login': 'Admin login',
        'GET /api/admin/dashboard': 'Dashboard data',
        'GET /api/admin/users': 'User management',
        'POST /api/admin/games/force-crash': 'Force crash point',
        'POST /api/admin/notifications/broadcast': 'Send notification'
      }
    },
    websocket: {
      events: {
        client: ['gameState', 'bettingPhase', 'flightStarted', 'altitudeUpdate', 'planeCrashed'],
        server: ['authenticate', 'adminAuth']
      }
    }
  });
});

// Initialize Telegram bot
let telegramBot;
if (CONFIG.BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    telegramBot = new AviatorTelegramBot(CONFIG.BOT_TOKEN, CONFIG.WEB_APP_URL);
    console.log('🤖 Telegram bot initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error.message);
  }
} else {
  console.log('⚠️ Telegram bot token not configured');
}

// Error handling
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = CONFIG.PORT;
server.listen(PORT, () => {
  console.log(`🚀 Aviator server running on port ${PORT}`);
  console.log(`🎮 Game interface: http://localhost:${PORT}`);
  console.log(`👑 Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`📚 API documentation: http://localhost:${PORT}/api/docs`);
  
  // Start the game engine
  setTimeout(() => {
    gameEngine.startBettingPhase();
  }, 2000);
});

module.exports = { app, server, gameEngine, users, gameHistory };