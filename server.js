// server.js (Updated)
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import modules
const GameEngine = require('./game/GameEngine');
const AviatorTelegramBot = require('./bot/TelegramBot');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');
const ProvablyFair = require('./game/ProvablyFair');
ProvablyFair.runQuickTest();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aviator', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('📦 Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Initialize game engine
const gameEngine = new GameEngine(io);

// Make game engine available to routes
app.use((req, res, next) => {
  req.gameEngine = gameEngine;
  req.io = io;
  next();
});

// Routes
app.use('/api/player', playerRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Aviator Game API',
    version: '1.0.0',
    endpoints: {
      player: {
        'POST /api/player/register': 'Register/login user',
        'GET /api/player/profile/:id': 'Get user profile',
        'POST /api/player/bet': 'Place bet',
        'POST /api/player/cashout': 'Cash out',
        'GET /api/player/history/:id': 'Get game history',
        'GET /api/player/transactions/:id': 'Get transactions',
        'GET /api/player/verify/:gameId': 'Verify game result'
      },
      admin: {
        'POST /api/admin/login': 'Admin login',
        'GET /api/admin/dashboard': 'Dashboard stats',
        'GET /api/admin/users': 'User management',
        'POST /api/admin/users/:id/bonus': 'Add user bonus',
        'POST /api/admin/users/:id/ban': 'Ban/unban user',
        'GET /api/admin/games': 'Game history',
        'POST /api/admin/broadcast': 'Send broadcast'
      }
    },
    websocket: {
      events: {
        'game:bettingPhase': 'Betting phase started',
        'game:takeoff': 'Game started',
        'game:multiplierUpdate': 'Multiplier update',
        'game:betPlaced': 'Bet placed by player',
        'game:cashOut': 'Player cashed out',
        'game:crashed': 'Game ended'
      }
    }
  });
});

// Websocket handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Send current game state
  socket.emit('gameState', gameEngine.getGameState());
  
  // Handle player authentication
  socket.on('auth', (data) => {
    socket.userId = data.telegramId;
    socket.username = data.username;
    console.log(`👤 User authenticated: ${data.username} (${data.telegramId})`);
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.username || socket.id}`);
  });
});

// Initialize Telegram bot
let telegramBot;
if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
  const webAppUrl = process.env.WEB_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  telegramBot = new AviatorTelegramBot(process.env.BOT_TOKEN, webAppUrl, apiBaseUrl);
  telegramBot.setupAdminCommands();
  console.log('🤖 Telegram bot initialized');
} else {
  console.log('⚠️ BOT_TOKEN not configured - running without Telegram bot');
}

// Error handling
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('💾 Database connection closed');
      process.exit(0);
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Aviator server running on port ${PORT}`);
  console.log(`🎮 Game interface: http://localhost:${PORT}`);
  console.log(`👑 Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`📚 API docs: http://localhost:${PORT}/api/docs`);
  
  // Start first game after 3 seconds
  setTimeout(() => {
    gameEngine.startNewGame();
  }, 3000);
});

module.exports = { app, server, gameEngine };