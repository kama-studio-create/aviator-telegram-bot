const TelegramBot = require('node-telegram-bot-api');

class AviatorTelegramBot {
    constructor(token, webAppUrl) {
        this.bot = new TelegramBot(token, { polling: true });
        this.webAppUrl = webAppUrl;
        this.users = new Map();
        
        this.setupCommands();
        this.setupInlineQuery();
        this.setupCallbackQuery();
        
        console.log('🤖 Telegram bot initialized successfully');
    }

    setupCommands() {
        // Start command
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const user = msg.from;
            
            this.registerUser(user);
            
            const welcomeMessage = `
🎮 Welcome to **AVIATOR GAME** 🛩️

🚀 **How to Play:**
• Place your bet before the plane takes off
• Cash out before it flies too high and crashes!
• The longer you wait, the higher the multiplier
• But be careful - the plane can crash anytime!

💰 **Features:**
• Provably Fair Gaming
• Real-time Multiplayer
• Instant Telegram Stars Integration
• 98% RTP (Return to Player)

🎯 **Starting Balance:** 1000 ⭐ Telegram Stars

Ready for takeoff? Tap the button below! 👇
            `;

            const keyboard = {
                inline_keyboard: [[
                    {
                        text: '🎮 Play Aviator',
                        web_app: { url: this.webAppUrl }
                    }
                ]]
            };

            this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        });

        // Help command
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            
            const helpMessage = `
📚 **AVIATOR GAME HELP** 🛩️

🎯 **Game Rules:**
• Minimum bet: 1 ⭐
• Maximum bet: 1000 ⭐
• Betting phase: 5 seconds
• Flight duration: Up to 30 seconds

🛩️ **How It Works:**
1️⃣ Wait for betting phase
2️⃣ Place your bet
3️⃣ Watch the plane climb and multiplier rise
4️⃣ Cash out before the plane crashes!

🔒 **Provably Fair:**
• Each game uses cryptographic hashing
• Server seed + Client seed = Fair result
• Verify any game result
• 100% Transparent

💡 **Tips:**
• Start with small bets
• Don't get too greedy
• Cash out early for consistent wins
• Higher altitude = Higher risk = Higher reward

🎮 **Commands:**
/start - Start playing
/balance - Check balance  
/stats - View statistics
/history - Game history
/verify - Verify game results
/help - Show this help

Prepare for takeoff! 🛫
            `;

            this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        });

        // Balance command
        this.bot.onText(/\/balance/, async (msg) => {
            const chatId = msg.chat.id;
            const telegramId = msg.from.id;
            
            try {
                const response = await fetch(`${this.webAppUrl}/api/user/${telegramId}`);
                const userData = await response.json();
                
                if (userData.error) {
                    this.bot.sendMessage(chatId, '❌ User not found. Please /start first.');
                    return;
                }

                const balanceMessage = `
💰 **Your Balance**

⭐ **Current Balance:** ${userData.balance} Stars
📊 **Total Bets:** ${userData.totalBets}
🏆 **Total Wins:** ${userData.totalWins}
📅 **Member Since:** ${new Date(userData.joinDate).toLocaleDateString()}

🎮 Ready to play? Use the button below!
                `;

                const keyboard = {
                    inline_keyboard: [[
                        {
                            text: '🎮 Play Now',
                            web_app: { url: this.webAppUrl }
                        }
                    ]]
                };

                this.bot.sendMessage(chatId, balanceMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                console.error('Balance fetch error:', error);
                this.bot.sendMessage(chatId, '❌ Failed to fetch balance. Please try again.');
            }
        });

        // Statistics command
        this.bot.onText(/\/stats/, async (msg) => {
            const chatId = msg.chat.id;
            
            try {
                const response = await fetch(`${this.webAppUrl}/api/game-history`);
                const history = await response.json();
                
                if (history.length === 0) {
                    this.bot.sendMessage(chatId, '📊 No games played yet.');
                    return;
                }

                const crashes = history.map(game => game.crashPoint);
                const avgCrash = crashes.reduce((a, b) => a + b, 0) / crashes.length;
                const highestCrash = Math.max(...crashes);
                const lowestCrash = Math.min(...crashes);
                
                const lowCrashes = crashes.filter(c => c < 2).length;
                const mediumCrashes = crashes.filter(c => c >= 2 && c < 5).length;
                const highCrashes = crashes.filter(c => c >= 5).length;

                const statsMessage = `
📊 **GAME STATISTICS** (Last ${history.length} flights)

📈 **Crash Analysis:**
• Average: ${avgCrash.toFixed(2)}x
• Highest: ${highestCrash.toFixed(2)}x
• Lowest: ${lowestCrash.toFixed(2)}x

📊 **Distribution:**
• Low (1.0-2.0x): ${lowCrashes} flights (${(lowCrashes/history.length*100).toFixed(1)}%)
• Medium (2.0-5.0x): ${mediumCrashes} flights (${(mediumCrashes/history.length*100).toFixed(1)}%)
• High (5.0x+): ${highCrashes} flights (${(highCrashes/history.length*100).toFixed(1)}%)

🎯 **Recent Results:**
${crashes.slice(0, 10).map(c => `${c.toFixed(2)}x`).join(' • ')}

🎮 Want to try your luck?
                `;

                const keyboard = {
                    inline_keyboard: [[
                        {
                            text: '🎮 Play Aviator',
                            web_app: { url: this.webAppUrl }
                        }
                    ]]
                };

                this.bot.sendMessage(chatId, statsMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                console.error('Stats fetch error:', error);
                this.bot.sendMessage(chatId, '❌ Failed to fetch statistics.');
            }
        });

        // History command
        this.bot.onText(/\/history/, async (msg) => {
            const chatId = msg.chat.id;
            
            try {
                const response = await fetch(`${this.webAppUrl}/api/game-history`);
                const history = await response.json();
                
                if (history.length === 0) {
                    this.bot.sendMessage(chatId, '📜 No flight history available.');
                    return;
                }

                let historyMessage = '📜 **RECENT FLIGHT HISTORY**\n\n';
                
                history.slice(0, 15).forEach((game, index) => {
                    const emoji = game.crashPoint < 2 ? '🔴' : game.crashPoint < 5 ? '🟡' : '🟢';
                    const time = new Date(game.timestamp).toLocaleTimeString();
                    historyMessage += `${emoji} **Flight #${game.gameId}** - ${game.crashPoint.toFixed(2)}x (${time})\n`;
                });

                const keyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: '🔍 Verify Results',
                                callback_data: 'verify_games'
                            }
                        ],
                        [
                            {
                                text: '🎮 Play Now',
                                web_app: { url: this.webAppUrl }
                            }
                        ]
                    ]
                };

                this.bot.sendMessage(chatId, historyMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                console.error('History fetch error:', error);
                this.bot.sendMessage(chatId, '❌ Failed to fetch flight history.');
            }
        });

        // Verify command
        this.bot.onText(/\/verify (\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const gameId = parseInt(match[1]);
            
            try {
                const response = await fetch(`${this.webAppUrl}/api/verify/${gameId}`);
                const verification = await response.json();
                
                if (verification.error) {
                    this.bot.sendMessage(chatId, '❌ Flight not found.');
                    return;
                }

                const verifyMessage = `
🔍 **FLIGHT VERIFICATION** #${gameId}

${verification.isValid ? '✅' : '❌'} **Result:** ${verification.isValid ? 'VALID' : 'INVALID'}
🎯 **Crash Point:** ${verification.crashPoint.toFixed(2)}x

🔐 **Provably Fair Data:**
**Server Seed:** \`${verification.serverSeed}\`
**Client Seed:** \`${verification.clientSeed}\`

📋 **How to Verify:**
1. Use SHA-256 hash function
2. Hash: server_seed + client_seed + flight_id
3. Convert to crash multiplier
4. Compare with actual result

✅ This flight was ${verification.isValid ? 'FAIR' : 'UNFAIR'}!
                `;

                this.bot.sendMessage(chatId, verifyMessage, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Verification error:', error);
                this.bot.sendMessage(chatId, '❌ Failed to verify flight.');
            }
        });

        // Error handling
        this.bot.on('polling_error', (error) => {
            console.error('Polling error:', error);
        });

        this.bot.on('webhook_error', (error) => {
            console.error('Webhook error:', error);
        });
    }

    setupInlineQuery() {
        this.bot.on('inline_query', (query) => {
            const queryText = query.query.toLowerCase();
            
            const results = [
                {
                    type: 'article',
                    id: '1',
                    title: '🎮 Play Aviator Game',
                    description: 'Start playing the exciting crash game!',
                    input_message_content: {
                        message_text: '🎮 **AVIATOR GAME** 🛩️\n\nJoin the excitement! Place your bets and bail out before the plane crashes!\n\n🎯 Provably Fair • 98% RTP • Real-time Multiplayer',
                        parse_mode: 'Markdown'
                    },
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '🎮 Play Now',
                                web_app: { url: this.webAppUrl }
                            }
                        ]]
                    }
                },
                {
                    type: 'article',
                    id: '2',
                    title: '📊 Flight Statistics',
                    description: 'View recent flight statistics',
                    input_message_content: {
                        message_text: '📊 Want to see flight statistics? Use /stats command or play now!',
                        parse_mode: 'Markdown'
                    }
                }
            ];

            this.bot.answerInlineQuery(query.id, results);
        });
    }

    setupCallbackQuery() {
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;

            switch (data) {
                case 'verify_games':
                    const verifyMessage = `
🔍 **VERIFY FLIGHT RESULTS**

To verify a specific flight, use:
\`/verify [flight_id]\`

**Example:** \`/verify 123\`

🔐 **What is Provably Fair?**
• Every flight result is predetermined using cryptographic hashing
• You can verify any flight was fair using the seeds
• Complete transparency - no hidden tricks!

📜 **Latest Flights:** Use /history to see recent flights with their IDs.
                    `;

                    this.bot.editMessageText(verifyMessage, {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                {
                                    text: '🎮 Play Now',
                                    web_app: { url: this.webAppUrl }
                                }
                            ]]
                        }
                    });
                    break;

                default:
                    this.bot.answerCallbackQuery(callbackQuery.id);
            }
        });
    }

    registerUser(telegramUser) {
        if (!this.users.has(telegramUser.id)) {
            this.users.set(telegramUser.id, {
                id: telegramUser.id,
                username: telegramUser.username,
                firstName: telegramUser.first_name,
                lastName: telegramUser.last_name,
                joinedAt: new Date()
            });
            
            console.log(`👤 New user registered: ${telegramUser.username || telegramUser.first_name} (${telegramUser.id})`);
        }
    }

    // Utility methods for sending messages
    sendMessage(chatId, message, options = {}) {
        return this.bot.sendMessage(chatId, message, options);
    }

    sendPhoto(chatId, photo, options = {}) {
        return this.bot.sendPhoto(chatId, photo, options);
    }

    // Broadcast message to all users (admin function)
    async broadcastMessage(message, options = {}) {
        const users = Array.from(this.users.keys());
        let sent = 0;
        let failed = 0;

        for (const userId of users) {
            try {
                await this.bot.sendMessage(userId, message, options);
                sent++;
                // Rate limiting - don't spam too fast
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                failed++;
                console.error(`Failed to send message to ${userId}:`, error.message);
            }
        }

        console.log(`📢 Broadcast complete: ${sent} sent, ${failed} failed`);
        return { sent, failed };
    }

    // Get bot info
    async getBotInfo() {
        try {
            const botInfo = await this.bot.getMe();
            console.log('🤖 Bot info:', botInfo);
            return botInfo;
        } catch (error) {
            console.error('Failed to get bot info:', error);
            return null;
        }
    }
}

module.exports = AviatorTelegramBot;