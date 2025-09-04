# 🛩️ Aviator Telegram Bot

A complete Telegram crash game with advanced admin system.

## 🚀 Quick Start

1. **Setup:**
   ```bash
   npm install
   cp .env.template .env
   # Edit .env with your bot token and settings
   ```

2. **Run:**
   ```bash
   npm start
   ```

3. **Admin Panel:**
   - Visit: `http://localhost:3000/admin`
   - Use your admin password from .env

## 🎮 Features

- ✅ Plane-themed crash game with realistic animations
- ✅ Provably fair system with SHA-256 verification  
- ✅ Real-time multiplayer with WebSocket
- ✅ Advanced admin dashboard
- ✅ Complete user management
- ✅ Dynamic odds control
- ✅ Financial analytics
- ✅ Mobile-optimized interface

## 🔧 Configuration

Edit `.env` file:
- `BOT_TOKEN`: Your Telegram bot token
- `ADMIN_SECRET`: Admin password
- `WEB_APP_URL`: Your deployed URL

## 📱 Telegram Setup

1. Get bot token from @BotFather
2. Set menu button: `/setmenubutton`
3. Web App URL: Your deployed URL

## 🚀 Deploy (FREE Platforms)

Choose your preferred free platform:

```bash
# Setup free deployment configs
node deploy-free.js

# Deploy to Render.com (Recommended)
# 1. Push to GitHub
# 2. Connect to render.com
# 3. Auto-deploy

# Or deploy to Railway.app
npm run deploy:railway

# Or deploy to Vercel
npm run deploy:vercel

# Or deploy to Fly.io  
npm run deploy:fly
```

## 📊 Admin Features

- Real-time game monitoring
- User management and analytics
- Odds control and manipulation
- Financial tracking
- System status monitoring

## 🧪 Testing

```bash
npm test
```

## 📞 Support

For support, contact [your-email].
