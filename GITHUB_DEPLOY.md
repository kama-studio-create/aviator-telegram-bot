# 🚀 GITHUB DEPLOYMENT GUIDE

## Your project is now ready to push to GitHub!

### ✅ **What We've Done:**
- ✅ Initialized git repository
- ✅ Added all files to git (excluding .env for security)
- ✅ Made initial commit

### 📋 **Next Steps:**

## **Step 1: Create GitHub Repository**
1. Go to **https://github.com**
2. Click **"New"** or **"Create repository"**
3. Repository name: `aviator-telegram-bot`
4. Description: `Complete Telegram Aviator crash game with Render.com deployment`
5. Set as **Public** (required for free Render.com deployment)
6. **DON'T** initialize with README (we already have one)
7. Click **"Create repository"**

## **Step 2: Connect and Push to GitHub**

### Option A: Using HTTPS (Recommended)
```bash
# Add GitHub as remote origin
git remote add origin https://github.com/YOUR_USERNAME/aviator-telegram-bot.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Option B: Using SSH (if you have SSH keys set up)
```bash
# Add GitHub as remote origin
git remote add origin git@github.com:YOUR_USERNAME/aviator-telegram-bot.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## **Step 3: Verify Upload**
- Go to your GitHub repository
- You should see all your files
- ✅ Make sure `.env` is NOT visible (security)
- ✅ Verify `README.md` displays properly

## **Step 4: Deploy to Render.com**
1. Go to **https://render.com**
2. Sign up/login with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect your `aviator-telegram-bot` repository
5. Configure:
   - **Name**: aviator-telegram-bot
   - **Environment**: Node
   - **Build Command**: npm install
   - **Start Command**: npm start
6. Add environment variables (see RENDER_DEPLOY.md)
7. Click **"Create Web Service"**

## **🔧 Important Notes:**

### **Environment Variables for Render:**
```
BOT_TOKEN=your_actual_telegram_bot_token
ADMIN_SECRET=your_strong_admin_password
WEB_APP_URL=https://your-service-name.onrender.com
JWT_SECRET=your_generated_jwt_secret_from_guide
```

### **After Deployment:**
1. Get your Render.com URL: `https://your-service-name.onrender.com`
2. Update `WEB_APP_URL` in Render environment variables
3. Configure Telegram bot with @BotFather:
   - Send: `/setmenubutton`
   - Button text: `🎮 Play Aviator`
   - Web App URL: Your Render.com URL

## **🎯 Quick Commands Summary:**

```bash
# 1. Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/aviator-telegram-bot.git

# 2. Push to GitHub
git branch -M main
git push -u origin main

# 3. Future updates
git add .
git commit -m "Your update message"
git push
```

## **📱 Final Steps:**
1. ✅ Push to GitHub
2. ✅ Deploy on Render.com  
3. ✅ Configure environment variables
4. ✅ Set Telegram Web App URL
5. ✅ Test your bot!

Your Aviator Telegram Bot will be live at:
- **Game**: https://your-service.onrender.com
- **Admin**: https://your-service.onrender.com/admin

🎮 **Ready for takeoff!** 🛩️✨
