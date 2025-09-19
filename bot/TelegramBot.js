// bot/TelegramBot.js
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('../db/database');
const axios = require('axios');

class AviatorTelegramBot {
  constructor(token, webAppUrl, apiBaseUrl) {
    this.bot = new TelegramBot(token, { polling: true });
    this.webAppUrl = webAppUrl;
    this.apiBaseUrl = apiBaseUrl;
    this.setupHandlers();
    
    console.log('🤖 Telegram bot initialized');
  }

  setupHandlers() {
    // Start command
    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const referralCode = match[1] ? match[1].trim() : null;

      try {
        // Register user
        const response = await axios.post(`${this.apiBaseUrl}/api/player/register`, {
          telegramId: userId,
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name
        });

        const keyboard = {
          reply_markup: {
            inline_keyboard: [[
              {
                text: '🛩️ Play Aviator',
                web_app: { url: this.webAppUrl }
              }
            ], [
              {
                text: '💰 Balance',
                callback_data: 'balance'
              },
              {
                text: '📊 Stats',
                callback_data: 'stats'
              }
            ], [
              {
                text: '🎁 Bonus',
                callback_data: 'bonus'
              },
              {
                text: '👥 Referral',
                callback_data: 'referral'
              }
            ]]
          }
        };

        await this.bot.sendMessage(chatId, 
          `🛩️ *Welcome to Aviator!*\n\n` +
          `🎮 The multiplier crash game where you control your destiny!\n\n` +
          `💰 Starting balance: 1,000⭐\n` +
          `🎯 Minimum bet: 10⭐\n` +
          `🚀 Maximum multiplier: 1000x\n\n` +
          `*How to play:*\n` +
          `1️⃣ Place your bet before takeoff\n` +
          `2️⃣ Watch the multiplier rise\n` +
          `3️⃣ Cash out before the plane crashes\n` +
          `4️⃣ The higher you fly, the more you win!\n\n` +
          `✨ *Provably Fair* - Every flight is verifiable\n\n` +
          `Ready for takeoff? 🛫`,
          { 
            parse_mode: 'Markdown',
            ...keyboard
          }
        );

        // Handle referral
        if (referralCode && response.data.user.balance === 1000) {
          await this.handleReferral(userId, referralCode);
        }

      } catch (error) {
        console.error('Error in start command:', error);
        await this.bot.sendMessage(chatId, 
          '❌ Something went wrong. Please try again later.'
        );
      }
    });

    // Callback query handlers
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;

      try {
        await this.bot.answerCallbackQuery(query.id);

        switch (data) {
          case 'balance':
            await this.handleBalance(chatId, userId);
            break;
          case 'stats':
            await this.handleStats(chatId, userId);
            break;
          case 'bonus':
            await this.handleBonus(chatId, userId);
            break;
          case 'referral':
            await this.handleReferralInfo(chatId, userId);
            break;
          default:
            if (data.startsWith('verify_')) {
              const gameId = data.split('_')[1];
              await this.handleVerifyGame(chatId, gameId);
            }
        }
      } catch (error) {
        console.error('Error handling callback:', error);
      }
    });

    // Web App data handler
    this.bot.on('web_app_data', async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const data = JSON.parse(msg.web_app.data);

      try {
        if (data.type === 'game_result') {
          await this.handleGameResult(chatId, userId, data);
        }
      } catch (error) {
        console.error('Error handling web app data:', error);
      }
    });

    // Commands
    this.bot.onText(/\/balance/, async (msg) => {
      await this.handleBalance(msg.chat.id, msg.from.id);
    });

    this.bot.onText(/\/stats/, async (msg) => {
      await this.handleStats(msg.chat.id, msg.from.id);
    });

    this.bot.onText(/\/history/, async (msg) => {
      await this.handleHistory(msg.chat.id, msg.from.id);
    });

    this.bot.onText(/\/verify (.+)/, async (msg, match) => {
      const gameId = match[1];
      await this.handleVerifyGame(msg.chat.id, gameId);
    });
  }

  async handleBalance(chatId, userId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/player/profile/${userId}`);
      const user = response.data.user;

      await this.bot.sendMessage(chatId,
        `💰 *Your Balance*\n\n` +
        `⭐ Stars: ${user.balance.toLocaleString()}\n` +
        `📈 Total Wagered: ${user.totalWagered.toLocaleString()}⭐\n` +
        `🏆 Total Won: ${user.totalWon.toLocaleString()}⭐\n` +
        `📊 Net Profit: ${(user.totalWon - user.totalWagered).toLocaleString()}⭐`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Could not fetch balance');
    }
  }

  async handleStats(chatId, userId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/player/profile/${userId}`);
      const user = response.data.user;

      const winRateEmoji = user.winRate >= 60 ? '🔥' : user.winRate >= 40 ? '⚡' : '📈';

      await this.bot.sendMessage(chatId,
        `📊 *Your Statistics*\n\n` +
        `🎮 Games Played: ${user.totalBets}\n` +
        `🏆 Games Won: ${user.totalWins}\n` +
        `${winRateEmoji} Win Rate: ${user.winRate}%\n` +
        `💎 VIP Status: ${user.isVIP ? 'Yes ⭐' : 'No'}\n` +
        `📅 Member Since: ${new Date(user.joinDate).toLocaleDateString()}\n\n` +
        `💰 *Financial Stats:*\n` +
        `📈 Total Wagered: ${user.totalWagered.toLocaleString()}⭐\n` +
        `🎯 Total Won: ${user.totalWon.toLocaleString()}⭐\n` +
        `📊 Net Profit: ${(user.totalWon - user.totalWagered).toLocaleString()}⭐`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Could not fetch statistics');
    }
  }

  async handleHistory(chatId, userId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/player/history/${userId}?limit=10`);
      const games = response.data.games;

      if (games.length === 0) {
        await this.bot.sendMessage(chatId, '📊 No game history found. Play your first game!');
        return;
      }

      let message = '🎮 *Recent Games* (Last 10)\n\n';
      
      games.forEach((game, index) => {
        const result = game.cashedOut ? '✅' : '💥';
        const profit = game.profit > 0 ? `+${game.profit}` : game.profit;
        const multiplier = game.cashoutMultiplier ? `${game.cashoutMultiplier.toFixed(2)}x` : 'Crashed';
        
        message += `${result} Game #${game.gameId}\n`;
        message += `   Bet: ${game.betAmount}⭐ | ${multiplier}\n`;
        message += `   Profit: ${profit}⭐ | Crash: ${game.crashPoint.toFixed(2)}x\n\n`;
      });

      const keyboard = {
        reply_markup: {
          inline_keyboard: games.slice(0, 3).map(game => [{
            text: `🔍 Verify Game #${game.gameId}`,
            callback_data: `verify_${game.gameId}`
          }])
        }
      };

      await this.bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Could not fetch game history');
    }
  }

  async handleVerifyGame(chatId, gameId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/api/player/verify/${gameId}`);
      const verification = response.data;

      const status = verification.isValid ? '✅ VALID' : '❌ INVALID';
      
      await this.bot.sendMessage(chatId,
        `🔍 *Game Verification*\n\n` +
        `🎮 Game ID: #${verification.gameId}\n` +
        `💥 Crash Point: ${verification.crashPoint.toFixed(2)}x\n` +
        `🔐 Server Seed: \`${verification.serverSeed.substring(0, 16)}...\`\n` +
        `🎲 Client Seed: \`${verification.clientSeed}\`\n` +
        `📊 Calculated: ${verification.calculatedCrash.toFixed(2)}x\n` +
        `✅ Status: ${status}\n\n` +
        `🛡️ *Provably Fair Verified*\n` +
        `This game result can be independently verified using the seeds above.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Game not found or verification failed');
    }
  }

  async handleBonus(chatId, userId) {
    try {
      // Check if user is eligible for daily bonus
      const user = await User.findOne({ telegramId: userId });
      if (!user) {
        await this.bot.sendMessage(chatId, '❌ User not found');
        return;
      }

      const now = new Date();
      const lastBonus = user.lastDailyBonus || new Date(0);
      const timeSinceLastBonus = now - lastBonus;
      const hoursUntilNext = Math.max(0, 24 - (timeSinceLastBonus / (1000 * 60 * 60)));

      if (hoursUntilNext > 0) {
        await this.bot.sendMessage(chatId,
          `🎁 *Daily Bonus*\n\n` +
          `⏰ Next bonus available in ${hoursUntilNext.toFixed(1)} hours\n\n` +
          `💰 Daily bonus: 100⭐\n` +
          `🎯 VIP bonus: 250⭐\n` +
          `👥 Referral bonus: 500⭐ per friend`,
          { parse_mode: 'Markdown' }
        );
      } else {
        // Give daily bonus
        const bonusAmount = user.isVIP ? 250 : 100;
        user.balance += bonusAmount;
        user.lastDailyBonus = now;
        await user.save();

        await this.bot.sendMessage(chatId,
          `🎁 *Daily Bonus Claimed!*\n\n` +
          `💰 You received: ${bonusAmount}⭐\n` +
          `💳 New balance: ${user.balance.toLocaleString()}⭐\n\n` +
          `See you tomorrow for another bonus! 🌅`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Could not process bonus');
    }
  }

  async handleReferralInfo(chatId, userId) {
    try {
      const user = await User.findOne({ telegramId: userId });
      if (!user) return;

      const referralCount = await User.countDocuments({ referredBy: userId });
      const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=${user.referralCode}`;

      await this.bot.sendMessage(chatId,
        `👥 *Referral Program*\n\n` +
        `🔗 Your referral link:\n\`${referralLink}\`\n\n` +
        `📊 Friends referred: ${referralCount}\n` +
        `🎁 Bonus per friend: 500⭐\n` +
        `💰 Friend gets: 200⭐ bonus\n\n` +
        `Share your link and earn stars for every friend who joins! 🚀`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.bot.sendMessage(chatId, '❌ Could not fetch referral info');
    }
  }

  async handleReferral(userId, referralCode) {
    try {
      const referrer = await User.findOne({ referralCode });
      if (!referrer || referrer.telegramId === userId) return;

      // Give bonus to new user
      const newUser = await User.findOne({ telegramId: userId });
      if (newUser) {
        newUser.balance += 200; // New user bonus
        newUser.referredBy = referrer.telegramId;
        await newUser.save();
      }

      // Give bonus to referrer
      referrer.balance += 500; // Referrer bonus
      await referrer.save();

      // Notify both users
      await this.bot.sendMessage(userId,
        `🎉 *Referral Bonus!*\n\n` +
        `You got 200⭐ for joining through a friend's link!`,
        { parse_mode: 'Markdown' }
      );

      await this.bot.sendMessage(referrer.telegramId,
        `🎉 *Friend Joined!*\n\n` +
        `You earned 500⭐ for referring a friend!\n` +
        `Keep sharing and earning! 💰`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error handling referral:', error);
    }
  }

  async handleGameResult(chatId, userId, data) {
    const { gameId, won, profit, multiplier } = data;
    
    if (won) {
      await this.bot.sendMessage(chatId,
        `🎉 *Amazing Flight!*\n\n` +
        `🛩️ Game #${gameId}\n` +
        `💰 Profit: +${profit}⭐\n` +
        `🚀 Cashed out at: ${multiplier}x\n\n` +
        `Great timing! 🎯`,
        { parse_mode: 'Markdown' }
      );
    } else if (profit < -100) { // Only notify for significant losses
      await this.bot.sendMessage(chatId,
        `💥 *Plane Crashed!*\n\n` +
        `🛩️ Game #${gameId}\n` +
        `📉 Lost: ${Math.abs(profit)}⭐\n\n` +
        `Don't give up! Next flight awaits! ✈️`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Admin commands
  setupAdminCommands() {
    const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID);
    
    this.bot.onText(/\/admin_stats/, async (msg) => {
      if (msg.from.id !== ADMIN_ID) return;
      
      try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({
          lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        
        await this.bot.sendMessage(msg.chat.id,
          `📊 *Admin Stats*\n\n` +
          `👥 Total Users: ${totalUsers}\n` +
          `🟢 Active (24h): ${activeUsers}\n` +
          `📱 Bot Status: Online ✅`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, '❌ Error fetching admin stats');
      }
    });
  }
}

module.exports = AviatorTelegramBot;