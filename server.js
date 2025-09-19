// server.js - Fixed and Enhanced
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import modules
const GameEngine = require('./game/GameEngine');
const AviatorTelegramBot = require('./bot/TelegramBot');
const playerRoutes = require('./routes/player');
const adminRoutes = require('./routes/admin');
const ProvablyFair = require('./game/ProvablyFair');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Environment validation
const requiredEnvVars = ['BOT_TOKEN', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️ Missing environment variables: ${missingVars.join(', ')}`);
  console.log('📝 Create a .env file based on .env.template');
}

// Security middleware with proper CSP for admin dashboard
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
    },
  },
}));

app.use(cors());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for game usage
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Stricter rate limiting for betting
const betLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 2, // 2 bets per second max
  message: { error: 'Betting too fast! Please wait.' }
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// Database connection with better error handling
const connectDB = async () => {
  try {
    const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/aviator';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('📦 Connected to MongoDB');
    
    // Test the connection
    await mongoose.connection.db.admin().ping();
    console.log('✅ Database ping successful');
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // In production, we might want to continue without DB for demo mode
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Continuing in demo mode without database');
    } else {
      process.exit(1);
    }
  }
};

// Initialize database
connectDB();

// Initialize game engine
const gameEngine = new GameEngine(io);

// Make game engine and io available to routes
app.use((req, res, next) => {
  req.gameEngine = gameEngine;
  req.io = io;
  next();
});

// Apply betting rate limit
app.use('/api/player/bet', betLimiter);

// Routes
app.use('/api/player', playerRoutes);
app.use('/api/admin', adminRoutes);

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// API Routes for game functionality
app.post('/api/bet', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!telegramId || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing telegramId or amount' 
      });
    }
    
    const result = await gameEngine.placeBet(telegramId, amount);
    res.json(result);
  } catch (error) {
    console.error('Bet error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to place bet' 
    });
  }
});

app.post('/api/cashout', async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing telegramId' 
      });
    }
    
    const result = await gameEngine.cashOut(telegramId);
    res.json(result);
  } catch (error) {
    console.error('Cashout error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cash out' 
    });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing telegramId' 
      });
    }
    
    // In demo mode without database, return mock user
    const mockUser = {
      telegramId,
      username: username || `User${telegramId}`,
      firstName: firstName || 'Player',
      lastName: lastName || '',
      balance: 1000,
      isVIP: false,
      isBanned: false
    };
    
    res.json({
      success: true,
      user: mockUser
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to register user' 
    });
  }
});

// Game state endpoint
app.get('/api/gamestate', (req, res) => {
  try {
    const gameState = gameEngine.getGameState();
    res.json(gameState);
  } catch (error) {
    console.error('Game state error:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Game history endpoint
app.get('/api/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    // Mock history for demo mode
    const mockHistory = [
      { gameId: 1001, crashPoint: 2.34, timestamp: new Date() },
      { gameId: 1000, crashPoint: 1.82, timestamp: new Date() },
      { gameId: 999, crashPoint: 5.67, timestamp: new Date() },
      { gameId: 998, crashPoint: 1.23, timestamp: new Date() },
      { gameId: 997, crashPoint: 12.45, timestamp: new Date() }
    ];
    
    res.json({ 
      success: true, 
      history: mockHistory.slice(0, limit) 
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Health check with more details
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    gameEngine: {
      status: gameEngine.gameState || 'unknown',
      gameId: gameEngine.gameId || 0,
      activeBets: gameEngine.activeBets?.size || 0
    }
  };
  
  res.json(health);
});

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Aviator Game API',
    version: '2.0.0',
    description: 'Complete Aviator crash game with Telegram integration',
    endpoints: {
      game: {
        'GET /api/gamestate': 'Get current game state',
        'POST /api/register': 'Register/login user',
        'POST /api/bet': 'Place bet (requires telegramId, amount)',
        'POST /api/cashout': 'Cash out (requires telegramId)',
        'GET /api/history': 'Get game history (optional: limit parameter)'
      },
      admin: {
        'GET /admin': 'Admin dashboard',
        'POST /api/admin/login': 'Admin login',
        'GET /api/admin/dashboard': 'Dashboard stats'
      },
      utility: {
        'GET /health': 'Server health check',
        'GET /api/docs': 'This documentation'
      }
    },
    websocket: {
      events: {
        client_to_server: {
          'auth': 'Authenticate user (telegramId, username)',
          'disconnect': 'Clean disconnect'
        },
        server_to_client: {
          'game:bettingPhase': 'Betting phase started',
          'game:takeoff': 'Game started',
          'game:multiplierUpdate': 'Multiplier update during flight',
          'game:betPlaced': 'Bet placed by any player',
          'game:cashOut': 'Player cashed out',
          'game:crashed': 'Game ended with crash'
        }
      }
    }
  });
});

// Websocket handling with improved error handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  try {
    // Send current game state immediately
    const gameState = gameEngine.getGameState();
    socket.emit('gameState', gameState);
    
    // Handle player authentication
    socket.on('auth', (data) => {
      try {
        socket.userId = data.telegramId;
        socket.username = data.username;
        console.log(`👤 User authenticated: ${data.username} (${data.telegramId})`);
      } catch (error) {
        console.error('Auth error:', error);
      }
    });
    
    // Handle betting via websocket (alternative to HTTP)
    socket.on('placeBet', async (data) => {
      try {
        const { telegramId, amount } = data;
        const result = await gameEngine.placeBet(telegramId, amount);
        socket.emit('betResult', result);
      } catch (error) {
        console.error('Socket bet error:', error);
        socket.emit('betResult', { success: false, error: error.message });
      }
    });
    
    // Handle cashout via websocket
    socket.on('cashOut', async (data) => {
      try {
        const { telegramId } = data;
        const result = await gameEngine.cashOut(telegramId);
        socket.emit('cashOutResult', result);
      } catch (error) {
        console.error('Socket cashout error:', error);
        socket.emit('cashOutResult', { success: false, error: error.message });
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.username || socket.id}`);
    });
    
    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
    
  } catch (error) {
    console.error('Socket connection error:', error);
  }
});

// Initialize Telegram bot with better error handling
let telegramBot;
const initializeTelegramBot = () => {
  if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
    try {
      const webAppUrl = process.env.WEB_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      
      telegramBot = new AviatorTelegramBot(process.env.BOT_TOKEN, webAppUrl, apiBaseUrl);
      
      // Setup admin commands if admin features are enabled
      if (process.env.ADMIN_SECRET) {
        telegramBot.setupAdminCommands();
      }
      
      console.log('🤖 Telegram bot initialized');
      console.log(`🌐 Web App URL: ${webAppUrl}`);
    } catch (error) {
      console.error('❌ Telegram bot initialization failed:', error.message);
      console.log('⚠️ Continuing without Telegram bot...');
    }
  } else {
    console.log('⚠️ BOT_TOKEN not configured - running without Telegram bot');
    console.log('💡 Add your bot token to .env file to enable Telegram integration');
  }
};

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment ? error.message : 'Internal server error';
  
  res.status(500).json({ 
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`🛑 Received ${signal}, shutting down gracefully`);
  
  server.close(() => {
    console.log('🌐 HTTP server closed');
    
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close(false, () => {
        console.log('💾 Database connection closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('💀 Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('🚀 AVIATOR GAME SERVER STARTED');
  console.log('=====================================');
  console.log(`🌐 Server: http://${HOST}:${PORT}`);
  console.log(`🎮 Game: http://localhost:${PORT}`);
  console.log(`👑 Admin: http://localhost:${PORT}/admin`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log('=====================================');
  
  // Run provably fair test
  console.log('🧪 Running Provably Fair test...');
  ProvablyFair.runQuickTest();
  
  // Initialize Telegram bot
  initializeTelegramBot();
  
  // Start first game after 3 seconds
  setTimeout(() => {
    try {
      gameEngine.startNewGame();
      console.log('🎲 Game engine started - first game beginning...');
    } catch (error) {
      console.error('❌ Failed to start game engine:', error);
    }
  }, 3000);
  
  // Show startup info
  console.log('✅ Server ready for connections!');
  if (process.env.NODE_ENV !== 'production') {
    console.log('📝 Tip: Set NODE_ENV=production for production deployment');
  }
});

module.exports = { app, server, gameEngine };