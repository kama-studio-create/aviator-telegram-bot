# 🔧 RENDER.COM CONFIGURATION SETTINGS

Copy these exact settings when creating your Render service:

## Basic Settings:
- **Name**: aviator-telegram-bot
- **Environment**: Node
- **Branch**: main
- **Root Directory**: (leave empty)

## Build & Deploy:
- **Build Command**: npm install
- **Start Command**: npm start

## Plan:
- **Instance Type**: Free

## Advanced Settings:
- **Auto-Deploy**: Yes (recommended)

## Environment Variables (Add these in the Environment tab):

### Required Variables:
```
BOT_TOKEN=your_actual_telegram_bot_token_from_botfather
ADMIN_SECRET=your_strong_admin_password_here
WEB_APP_URL=https://your-service-name.onrender.com
JWT_SECRET=your_generated_jwt_secret_from_guide
```

### Optional Variables (can use defaults):
```
NODE_ENV=production
RTP=0.98
HOUSE_EDGE=0.02
GAME_DURATION=30000
BET_PHASE_DURATION=5000
MIN_BET=1
MAX_BET=1000
STARTING_BALANCE=1000
```

## ⚠️ IMPORTANT NOTES:

### 1. Service Name:
- Choose a unique name (e.g., aviator-game-xyz)
- This becomes your URL: https://your-service-name.onrender.com

### 2. BOT_TOKEN:
- Get from @BotFather on Telegram
- Send /newbot to create a bot
- Copy the token (looks like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)

### 3. WEB_APP_URL:
- Initially set to: https://your-service-name.onrender.com
- Update after deployment with your actual Render URL

### 4. JWT_SECRET:
- Use the one generated in JWT_SECRET_GUIDE.md
- Or generate new one with: node generate-jwt-secret.js

## 🚀 Deployment Process:
1. Configure all settings above
2. Click "Create Web Service"
3. Wait 5-10 minutes for build
4. Your app will be live!

## 📱 After Deployment:
1. Copy your Render.com URL
2. Update WEB_APP_URL environment variable
3. Configure Telegram bot with @BotFather
4. Test your game!
