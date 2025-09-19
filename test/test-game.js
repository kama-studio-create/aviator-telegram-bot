#!/usr/bin/env node

/**
 * Aviator Game Testing Utility
 * Test your game functionality before going live
 */

const http = require('http');
const io = require('socket.io-client');

const API_BASE = 'http://localhost:3000';

class GameTester {
  constructor() {
    this.socket = null;
    this.users = [];
    this.gameState = null;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      error: '\x1b[31m',   // Red
      warning: '\x1b[33m', // Yellow
      game: '\x1b[35m'     // Magenta
    };
    
    const reset = '\x1b[0m';
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[type]}[${timestamp}] ${message}${reset}`);
  }

  async makeRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${API_BASE}${endpoint}`;
      const method = options.method || 'GET';
      const data = options.data ? JSON.stringify(options.data) : null;
      
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          ...options.headers
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve({ status: res.statusCode, data: response });
          } catch (error) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      
      if (data) {
        req.write(data);
      }
      
      req.end();
    });
  }

  async testServerConnection() {
    this.log('Testing server connection...', 'info');
    
    try {
      const response = await this.makeRequest('/health');
      if (response.status === 200) {
        this.log('✅ Server is running and healthy', 'success');
        return true;
      } else {
        this.log(`❌ Server returned status ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Cannot connect to server: ${error.message}`, 'error');
      this.log('💡 Make sure server is running with: npm run dev', 'warning');
      return false;
    }
  }

  async testUserRegistration() {
    this.log('Testing user registration...', 'info');
    
    const testUsers = [
      { telegramId: 123456789, username: 'testuser1', firstName: 'Test', lastName: 'User1' },
      { telegramId: 987654321, username: 'testuser2', firstName: 'Test', lastName: 'User2' },
      { telegramId: 555555555, username: 'testuser3', firstName: 'VIP', lastName: 'Player' }
    ];

    for (const userData of testUsers) {
      try {
        const response = await this.makeRequest('/api/register', {
          method: 'POST',
          data: userData
        });

        if (response.status === 200 && response.data.success) {
          this.users.push({ ...userData, ...response.data.user });
          this.log(`✅ Registered user: ${userData.firstName} (${userData.telegramId})`, 'success');
        } else {
          this.log(`❌ Failed to register user: ${userData.firstName}`, 'error');
          return false;
        }
      } catch (error) {
        this.log(`❌ Registration error: ${error.message}`, 'error');
        return false;
      }
    }

    return true;
  }

  async testWebSocketConnection() {
    this.log('Testing WebSocket connection...', 'info');
    
    return new Promise((resolve) => {
      this.socket = io(API_BASE);
      
      this.socket.on('connect', () => {
        this.log('✅ WebSocket connected', 'success');
        
        // Set up game state listener
        this.socket.on('gameState', (data) => {
          this.gameState = data;
          this.log(`🎮 Game State: ${data.state} - Flight #${data.gameId} - ${data.currentMultiplier}x`, 'game');
        });

        this.socket.on('betPlaced', (data) => {
          this.log(`💰 Bet placed: ${data.firstName} bet ${data.amount}⭐`, 'game');
        });

        this.socket.on('playerCashedOut', (data) => {
          this.log(`🎯 Cashout: ${data.firstName} cashed out ${data.payout}⭐ at ${data.multiplier}x`, 'game');
        });

        resolve(true);
      });
      
      this.socket.on('connect_error', (error) => {
        this.log(`❌ WebSocket connection failed: ${error.message}`, 'error');
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.socket.connected) {
          this.log('❌ WebSocket connection timeout', 'error');
          resolve(false);
        }
      }, 5000);
    });
  }

  async testGameFlow() {
    this.log('Testing complete game flow...', 'info');
    
    if (!this.socket || !this.socket.connected) {
      this.log('❌ WebSocket not connected', 'error');
      return false;
    }

    // Wait for betting phase
    await this.waitForGameState('betting');
    
    // Place some test bets
    const betResults = await this.testBetting();
    if (!betResults) return false;

    // Wait for flying phase
    await this.waitForGameState('flying');
    
    // Test cashouts
    const cashoutResults = await this.testCashouts();
    if (!cashoutResults) return false;

    // Wait for crash
    await this.waitForGameState('crashed');
    
    this.log('✅ Complete game flow tested successfully', 'success');
    return true;
  }

  async waitForGameState(targetState, timeout = 30000) {
    this.log(`⏳ Waiting for game state: ${targetState}`, 'info');
    
    return new Promise((resolve) => {
      if (this.gameState && this.gameState.state === targetState) {
        resolve(true);
        return;
      }

      const listener = (data) => {
        if (data.state === targetState) {
          this.socket.off('gameState', listener);
          resolve(true);
        }
      };

      this.socket.on('gameState', listener);
      
      // Timeout
      setTimeout(() => {
        this.socket.off('gameState', listener);
        this.log(`⚠️ Timeout waiting for ${targetState} state`, 'warning');
        resolve(false);
      }, timeout);
    });
  }

  async testBetting() {
    this.log('Testing bet placement...', 'info');
    
    const betPromises = this.users.slice(0, 2).map(async (user, index) => {
      const betAmount = [50, 100][index];
      
      try {
        const response = await this.makeRequest('/api/bet', {
          method: 'POST',
          data: { telegramId: user.telegramId, amount: betAmount }
        });

        if (response.status === 200 && response.data.success) {
          this.log(`✅ Bet placed: ${user.firstName} - ${betAmount}⭐`, 'success');
          user.betAmount = betAmount;
          user.newBalance = response.data.newBalance;
          return true;
        } else {
          this.log(`❌ Bet failed: ${user.firstName} - ${response.data.message}`, 'error');
          return false;
        }
      } catch (error) {
        this.log(`❌ Bet error: ${error.message}`, 'error');
        return false;
      }
    });

    const results = await Promise.all(betPromises);
    return results.every(result => result);
  }

  async testCashouts() {
    this.log('Testing cashout functionality...', 'info');
    
    // Wait a moment for multiplier to increase
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Cashout first user
    const user = this.users[0];
    if (!user.betAmount) return true; // No bet placed

    try {
      const response = await this.makeRequest('/api/cashout', {
        method: 'POST',
        data: { telegramId: user.telegramId }
      });

      if (response.status === 200 && response.data.success) {
        this.log(`✅ Cashout successful: ${user.firstName} - ${response.data.payout}⭐ at ${response.data.multiplier}x`, 'success');
        return true;
      } else {
        this.log(`❌ Cashout failed: ${response.data.message}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Cashout error: ${error.message}`, 'error');
      return false;
    }
  }

  async testAdminAPI() {
    this.log('Testing admin API...', 'info');
    
    // Test admin login
    try {
      const loginResponse = await this.makeRequest('/api/admin/login', {
        method: 'POST',
        data: { username: 'admin', password: 'admin123' }
      });

      if (loginResponse.status === 200 && loginResponse.data.success) {
        const token = loginResponse.data.token;
        this.log('✅ Admin login successful', 'success');

        // Test dashboard
        const dashboardResponse = await this.makeRequest('/api/admin/dashboard', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (dashboardResponse.status === 200) {
          this.log('✅ Admin dashboard accessible', 'success');
          return true;
        } else {
          this.log('❌ Admin dashboard failed', 'error');
          return false;
        }
      } else {
        this.log('❌ Admin login failed', 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Admin API error: ${error.message}`, 'error');
      return false;
    }
  }

  async testProvablyFair() {
    this.log('Testing provably fair system...', 'info');
    
    try {
      // Get recent game history
      const historyResponse = await this.makeRequest('/api/history?limit=5');
      
      if (historyResponse.status === 200 && historyResponse.data.history.length > 0) {
        const recentGame = historyResponse.data.history[0];
        
        // Test verification
        const verifyResponse = await this.makeRequest(`/api/verify/${recentGame.gameId}`);
        
        if (verifyResponse.status === 200 && verifyResponse.data.isValid) {
          this.log('✅ Provably fair verification successful', 'success');
          return true;
        } else {
          this.log('❌ Provably fair verification failed', 'error');
          return false;
        }
      } else {
        this.log('⚠️ No games to verify yet', 'warning');
        return true;
      }
    } catch (error) {
      this.log(`❌ Provably fair test error: ${error.message}`, 'error');
      return false;
    }
  }

  async testBonusSystem() {
    this.log('Testing bonus system...', 'info');
    
    const testUser = this.users[0];
    if (!testUser) return false;

    try {
      // Test daily bonus
      const bonusResponse = await this.makeRequest('/api/bonus/daily', {
        method: 'POST',
        data: { telegramId: testUser.telegramId }
      });

      if (bonusResponse.status === 200) {
        if (bonusResponse.data.success) {
          this.log(`✅ Daily bonus claimed: ${bonusResponse.data.bonus}⭐`, 'success');
        } else {
          this.log(`ℹ️ Daily bonus: ${bonusResponse.data.message}`, 'info');
        }
        return true;
      } else {
        this.log('❌ Daily bonus test failed', 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Bonus system error: ${error.message}`, 'error');
      return false;
    }
  }

  async runStressTest() {
    this.log('Running stress test...', 'warning');
    
    // Create many virtual users
    const virtualUsers = [];
    for (let i = 0; i < 20; i++) {
      virtualUsers.push({
        telegramId: 1000000 + i,
        username: `stressuser${i}`,
        firstName: `Stress${i}`,
        lastName: 'User'
      });
    }

    // Register all users quickly
    const registrationPromises = virtualUsers.map(user => 
      this.makeRequest('/api/register', {
        method: 'POST',
        data: user
      })
    );

    try {
      await Promise.all(registrationPromises);
      this.log('✅ Stress test: All users registered', 'success');
    } catch (error) {
      this.log(`❌ Stress test failed: ${error.message}`, 'error');
      return false;
    }

    return true;
  }

  generateTestReport(results) {
    this.log('', 'info');
    this.log('🧪 TEST REPORT', 'info');
    this.log('=====================================', 'info');
    
    const tests = [
      { name: 'Server Connection', result: results.serverConnection },
      { name: 'User Registration', result: results.userRegistration },
      { name: 'WebSocket Connection', result: results.websocketConnection },
      { name: 'Game Flow', result: results.gameFlow },
      { name: 'Admin API', result: results.adminAPI },
      { name: 'Provably Fair', result: results.provablyFair },
      { name: 'Bonus System', result: results.bonusSystem },
      { name: 'Stress Test', result: results.stressTest }
    ];

    tests.forEach(test => {
      const status = test.result ? '✅ PASS' : '❌ FAIL';
      const color = test.result ? 'success' : 'error';
      this.log(`${test.name.padEnd(20)} ${status}`, color);
    });

    const passedTests = tests.filter(t => t.result).length;
    const totalTests = tests.length;
    
    this.log('', 'info');
    this.log(`📊 Results: ${passedTests}/${totalTests} tests passed`, 'info');
    
    if (passedTests === totalTests) {
      this.log('🎉 ALL TESTS PASSED! Your game is ready for production!', 'success');
      this.log('', 'info');
      this.log('🚀 Next steps:', 'info');
      this.log('   1. Deploy to your hosting platform', 'info');
      this.log('   2. Update Web App URL in @BotFather', 'info');
      this.log('   3. Start with a small group of beta testers', 'info');
      this.log('   4. Monitor server logs and user feedback', 'info');
    } else {
      this.log('⚠️  Some tests failed. Please fix issues before deploying.', 'warning');
    }
  }

  async cleanup() {
    if (this.socket) {
      this.socket.disconnect();
      this.log('🧹 Cleaned up WebSocket connection', 'info');
    }
  }

  async runAllTests() {
    this.log('🚀 Starting comprehensive game testing...', 'info');
    this.log('', 'info');

    const results = {
      serverConnection: false,
      userRegistration: false,
      websocketConnection: false,
      gameFlow: false,
      adminAPI: false,
      provablyFair: false,
      bonusSystem: false,
      stressTest: false
    };

    try {
      // Test server connection first
      results.serverConnection = await this.testServerConnection();
      if (!results.serverConnection) {
        this.generateTestReport(results);
        return;
      }

      // Test user registration
      results.userRegistration = await this.testUserRegistration();
      
      // Test WebSocket connection
      results.websocketConnection = await this.testWebSocketConnection();
      
      // Test game flow (only if WebSocket works)
      if (results.websocketConnection) {
        results.gameFlow = await this.testGameFlow();
      }
      
      // Test admin API
      results.adminAPI = await this.testAdminAPI();
      
      // Test provably fair system
      results.provablyFair = await this.testProvablyFair();
      
      // Test bonus system
      results.bonusSystem = await this.testBonusSystem();
      
      // Run stress test
      results.stressTest = await this.runStressTest();

    } catch (error) {
      this.log(`❌ Unexpected error during testing: ${error.message}`, 'error');
    } finally {
      await this.cleanup();
      this.generateTestReport(results);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const tester = new GameTester();

  switch (command) {
    case 'connection':
      await tester.testServerConnection();
      break;
    case 'websocket':
      await tester.testWebSocketConnection();
      setTimeout(() => tester.cleanup(), 5000);
      break;
    case 'game':
      if (await tester.testServerConnection() && 
          await tester.testUserRegistration() && 
          await tester.testWebSocketConnection()) {
        await tester.testGameFlow();
      }
      await tester.cleanup();
      break;
    case 'admin':
      await tester.testAdminAPI();
      break;
    case 'stress':
      await tester.runStressTest();
      break;
    case 'quick':
      // Quick test - just essentials
      const results = {};
      results.serverConnection = await tester.testServerConnection();
      if (results.serverConnection) {
        results.userRegistration = await tester.testUserRegistration();
        results.adminAPI = await tester.testAdminAPI();
      }
      tester.generateTestReport(results);
      break;
    default:
      // Run all tests
      await tester.runAllTests();
  }
}

// Show usage if needed
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🧪 Aviator Game Testing Utility

Usage:
  node test-game.js [command]

Commands:
  (none)      Run all tests (comprehensive)
  quick       Run essential tests only
  connection  Test server connection
  websocket   Test WebSocket connection
  game        Test complete game flow
  admin       Test admin API
  stress      Run stress test
  
Examples:
  node test-game.js           # Run all tests
  node test-game.js quick     # Quick test
  node test-game.js game      # Test game functionality
  
Make sure your server is running before testing:
  npm run dev
`);
  } else {
    main().catch(console.error);
  }
}

module.exports = { GameTester };