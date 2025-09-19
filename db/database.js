// db/database.js
const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true },
  username: String,
  firstName: String,
  lastName: String,
  balance: { type: Number, default: 1000 },
  totalBets: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalWagered: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },
  joinDate: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  isVIP: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  referralCode: String,
  referredBy: Number
}, { timestamps: true });

// Game History Schema
const gameSchema = new mongoose.Schema({
  gameId: { type: Number, unique: true, required: true },
  crashPoint: { type: Number, required: true },
  serverSeed: String,
  clientSeed: String,
  hashedServerSeed: String,
  bets: [{
    userId: Number,
    username: String,
    betAmount: Number,
    cashoutMultiplier: Number,
    payout: Number,
    profit: Number,
    cashedOut: Boolean
  }],
  totalBets: Number,
  totalPayout: Number,
  houseProfit: Number,
  startTime: Date,
  endTime: Date
}, { timestamps: true });

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['bet', 'win', 'deposit', 'withdrawal', 'bonus', 'referral'],
    required: true 
  },
  amount: { type: Number, required: true },
  balanceBefore: Number,
  balanceAfter: Number,
  gameId: Number,
  description: String,
  status: { 
    type: String, 
    enum: ['completed', 'pending', 'cancelled'],
    default: 'completed' 
  }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Game: mongoose.model('Game', gameSchema),
  Transaction: mongoose.model('Transaction', transactionSchema)
};