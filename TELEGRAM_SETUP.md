# 🤖 TELEGRAM BOT SETUP GUIDE

## Step 1: Create Telegram Bot
1. Open Telegram
2. Search for "@BotFather"
3. Start a chat with BotFather
4. Send: /newbot

## Step 2: Configure Your Bot
BotFather will ask:
- **Bot name**: Aviator Game Bot (or your choice)
- **Username**: aviator_game_xyz_bot (must end with 'bot')

## Step 3: Get Your Token
BotFather will give you a token like:
```
123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```
**Copy this token** - you'll need it for Render.com

## Step 4: Set Menu Button (After Deployment)
Once your Render.com app is live:
1. Send to @BotFather: /setmenubutton
2. Choose your bot
3. **Button text**: 🎮 Play Aviator
4. **Web App URL**: https://your-service.onrender.com

## Step 5: Configure Commands (Optional)
Send to @BotFather: /setcommands
Then paste these commands:
```
start - 🎮 Start playing Aviator
help - 📚 How to play guide
balance - 💰 Check your balance
stats - 📊 Game statistics
history - 📜 Recent flights
verify - 🔍 Verify game results
```

## 🔐 Security Notes:
- Never share your bot token publicly
- The token gives full control of your bot
- Keep it secure in environment variables

## ✅ When Complete:
Your bot will respond to:
- /start - Welcome message with game button
- Menu button - Opens your Aviator game
- All the commands you configured
