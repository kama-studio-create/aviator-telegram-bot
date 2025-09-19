const crypto = require('crypto');

/**
 * Provably Fair System for Aviator Game
 * 
 * This system ensures that:
 * 1. Game results are predetermined and cannot be manipulated
 * 2. Players can verify any game result independently
 * 3. The house edge is transparent and consistent
 * 4. Results follow a proper distribution curve
 */
class ProvablyFair {
  /**
   * Generate a cryptographically secure server seed
   * @returns {string} 64-character hexadecimal string
   */
  static generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a client seed (can be user-provided or random)
   * @returns {string} Random alphanumeric string
   */
  static generateClientSeed() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Create a SHA256 hash of the server seed (for pre-revealing)
   * @param {string} serverSeed - The server seed to hash
   * @returns {string} SHA256 hash in hexadecimal
   */
  static hashServerSeed(serverSeed) {
    return crypto.createHash('sha256').update(serverSeed).digest('hex');
  }

  /**
   * Calculate the crash point using HMAC-SHA256
   * @param {string} serverSeed - Server seed (64 hex characters)
   * @param {string} clientSeed - Client seed (any string)
   * @param {number} nonce - Game round number (incrementing integer)
   * @param {number} houseEdge - House edge percentage (default 0.02 = 2%)
   * @returns {number} Crash multiplier (1.00 to 1000.00)
   */
  static calculateCrashPoint(serverSeed, clientSeed, nonce, houseEdge = 0.02) {
    // Validate inputs
    if (!serverSeed || !clientSeed || typeof nonce !== 'number') {
      throw new Error('Invalid parameters for crash point calculation');
    }

    // Create HMAC-SHA256 hash
    const hash = crypto
      .createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');

    // Take first 8 characters (32 bits) and convert to integer
    const hashInt = parseInt(hash.substr(0, 8), 16);
    
    // Calculate raw crash point using the formula
    const e = Math.pow(2, 32); // 2^32
    const rawCrashPoint = e / (e - hashInt);
    
    // Apply house edge
    const crashPoint = rawCrashPoint * (1 - houseEdge);
    
    // Ensure minimum 1.00x and reasonable maximum
    return Math.max(1.00, Math.min(crashPoint, 1000.00));
  }

  /**
   * Verify a crash point calculation
   * @param {string} serverSeed - Original server seed
   * @param {string} clientSeed - Original client seed  
   * @param {number} nonce - Game round number
   * @param {number} expectedCrashPoint - The crash point to verify
   * @param {number} houseEdge - House edge used (default 0.02)
   * @returns {boolean} True if verification passes
   */
  static verifyCrashPoint(serverSeed, clientSeed, nonce, expectedCrashPoint, houseEdge = 0.02) {
    try {
      const calculatedCrash = this.calculateCrashPoint(serverSeed, clientSeed, nonce, houseEdge);
      const difference = Math.abs(calculatedCrash - expectedCrashPoint);
      
      // Allow for small floating point differences (< 0.01)
      return difference < 0.01;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }

  /**
   * Generate a complete game seed set
   * @returns {object} Object containing serverSeed, clientSeed, and hashedServerSeed
   */
  static generateGameSeeds() {
    const serverSeed = this.generateServerSeed();
    const clientSeed = this.generateClientSeed();
    const hashedServerSeed = this.hashServerSeed(serverSeed);

    return {
      serverSeed,
      clientSeed,
      hashedServerSeed
    };
  }

  /**
   * Generate multiple crash points for batch verification
   * @param {string} serverSeed - Server seed
   * @param {string} clientSeed - Client seed
   * @param {number} startNonce - Starting nonce
   * @param {number} count - Number of crash points to generate
   * @param {number} houseEdge - House edge (default 0.02)
   * @returns {Array} Array of crash points
   */
  static generateBatch(serverSeed, clientSeed, startNonce, count, houseEdge = 0.02) {
    const results = [];
    
    for (let i = 0; i < count; i++) {
      const nonce = startNonce + i;
      const crashPoint = this.calculateCrashPoint(serverSeed, clientSeed, nonce, houseEdge);
      
      results.push({
        nonce,
        crashPoint: parseFloat(crashPoint.toFixed(2))
      });
    }
    
    return results;
  }

  /**
   * Analyze crash point distribution
   * @param {Array} crashPoints - Array of crash points to analyze
   * @returns {object} Distribution statistics
   */
  static analyzeDistribution(crashPoints) {
    if (!crashPoints || crashPoints.length === 0) {
      throw new Error('No crash points provided for analysis');
    }

    const sorted = [...crashPoints].sort((a, b) => a - b);
    const total = crashPoints.length;
    
    // Distribution buckets
    const low = crashPoints.filter(cp => cp >= 1.00 && cp < 2.00).length;
    const medium = crashPoints.filter(cp => cp >= 2.00 && cp < 5.00).length;
    const high = crashPoints.filter(cp => cp >= 5.00 && cp < 10.00).length;
    const veryHigh = crashPoints.filter(cp => cp >= 10.00).length;
    
    // Statistical measures
    const sum = crashPoints.reduce((a, b) => a + b, 0);
    const average = sum / total;
    const median = sorted[Math.floor(total / 2)];
    const min = sorted[0];
    const max = sorted[total - 1];
    
    // Percentiles
    const p90 = sorted[Math.floor(total * 0.9)];
    const p95 = sorted[Math.floor(total * 0.95)];
    const p99 = sorted[Math.floor(total * 0.99)];
    
    // Calculate actual RTP
    const actualRTP = 1 / average;
    
    return {
      total,
      average: parseFloat(average.toFixed(4)),
      median: parseFloat(median.toFixed(2)),
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2)),
      percentiles: {
        p90: parseFloat(p90.toFixed(2)),
        p95: parseFloat(p95.toFixed(2)),
        p99: parseFloat(p99.toFixed(2))
      },
      distribution: {
        low: { count: low, percentage: parseFloat((low / total * 100).toFixed(1)) },
        medium: { count: medium, percentage: parseFloat((medium / total * 100).toFixed(1)) },
        high: { count: high, percentage: parseFloat((high / total * 100).toFixed(1)) },
        veryHigh: { count: veryHigh, percentage: parseFloat((veryHigh / total * 100).toFixed(1)) }
      },
      rtp: {
        actual: parseFloat((actualRTP * 100).toFixed(2)),
        theoretical: 98.0 // 2% house edge
      }
    };
  }

  /**
   * Create a verification object for a game
   * @param {number} gameId - Game ID/nonce
   * @param {string} serverSeed - Server seed used
   * @param {string} clientSeed - Client seed used
   * @param {number} crashPoint - Actual crash point
   * @param {number} houseEdge - House edge applied
   * @returns {object} Verification data
   */
  static createVerification(gameId, serverSeed, clientSeed, crashPoint, houseEdge = 0.02) {
    const hashedServerSeed = this.hashServerSeed(serverSeed);
    const calculatedCrash = this.calculateCrashPoint(serverSeed, clientSeed, gameId, houseEdge);
    const isValid = this.verifyCrashPoint(serverSeed, clientSeed, gameId, crashPoint, houseEdge);
    
    return {
      gameId,
      serverSeed,
      hashedServerSeed,
      clientSeed,
      nonce: gameId,
      crashPoint: parseFloat(crashPoint.toFixed(2)),
      calculatedCrash: parseFloat(calculatedCrash.toFixed(2)),
      houseEdge: houseEdge,
      isValid,
      timestamp: new Date().toISOString(),
      verificationSteps: {
        step1: `Create HMAC-SHA256 hash of "${clientSeed}:${gameId}" using server seed as key`,
        step2: `Take first 8 characters of hash and convert to integer`,
        step3: `Apply formula: (2^32 / (2^32 - hash_int)) * (1 - ${houseEdge})`,
        step4: `Result should equal ${crashPoint}x`
      }
    };
  }

  /**
   * Generate seeds for testing purposes
   * @param {number} count - Number of seed pairs to generate
   * @returns {Array} Array of seed objects
   */
  static generateTestSeeds(count = 10) {
    const seeds = [];
    
    for (let i = 0; i < count; i++) {
      seeds.push(this.generateGameSeeds());
    }
    
    return seeds;
  }

  /**
   * Validate server seed format
   * @param {string} serverSeed - Server seed to validate
   * @returns {boolean} True if valid format
   */
  static isValidServerSeed(serverSeed) {
    return typeof serverSeed === 'string' && 
           serverSeed.length === 64 && 
           /^[a-f0-9]+$/i.test(serverSeed);
  }

  /**
   * Validate client seed format
   * @param {string} clientSeed - Client seed to validate
   * @returns {boolean} True if valid format
   */
  static isValidClientSeed(clientSeed) {
    return typeof clientSeed === 'string' && 
           clientSeed.length > 0 && 
           clientSeed.length <= 100;
  }

  /**
   * Generate a verification URL for external verification
   * @param {object} gameData - Game verification data
   * @returns {string} URL for third-party verification
   */
  static generateVerificationUrl(gameData) {
    const params = new URLSearchParams({
      serverSeed: gameData.serverSeed,
      clientSeed: gameData.clientSeed,
      nonce: gameData.gameId,
      crashPoint: gameData.crashPoint
    });
    
    return `https://aviator-verify.com/verify?${params.toString()}`;
  }

  /**
   * Quick test of the provably fair system
   * @returns {object} Test results
   */
  static runQuickTest() {
    console.log('🧪 Running Provably Fair Quick Test...\n');
    
    const testResults = {
      seedGeneration: false,
      crashCalculation: false,
      verification: false,
      consistency: false,
      distribution: false
    };

    try {
      // Test 1: Seed generation
      const serverSeed = this.generateServerSeed();
      const clientSeed = this.generateClientSeed();
      const hashedSeed = this.hashServerSeed(serverSeed);
      
      testResults.seedGeneration = this.isValidServerSeed(serverSeed) && 
                                  this.isValidClientSeed(clientSeed) && 
                                  hashedSeed.length === 64;
      
      console.log(`✅ Seed Generation: ${testResults.seedGeneration ? 'PASS' : 'FAIL'}`);

      // Test 2: Crash calculation
      const crashPoint = this.calculateCrashPoint(serverSeed, clientSeed, 1);
      testResults.crashCalculation = crashPoint >= 1.00 && crashPoint <= 1000.00;
      
      console.log(`✅ Crash Calculation: ${testResults.crashCalculation ? 'PASS' : 'FAIL'}`);
      console.log(`   Generated crash point: ${crashPoint.toFixed(2)}x`);

      // Test 3: Verification
      testResults.verification = this.verifyCrashPoint(serverSeed, clientSeed, 1, crashPoint);
      
      console.log(`✅ Verification: ${testResults.verification ? 'PASS' : 'FAIL'}`);

      // Test 4: Consistency (same inputs = same output)
      const crashPoint2 = this.calculateCrashPoint(serverSeed, clientSeed, 1);
      testResults.consistency = Math.abs(crashPoint - crashPoint2) < 0.001;
      
      console.log(`✅ Consistency: ${testResults.consistency ? 'PASS' : 'FAIL'}`);

      // Test 5: Distribution (small sample)
      const sampleSize = 1000;
      const crashes = [];
      
      for (let i = 1; i <= sampleSize; i++) {
        const testSeed = this.generateServerSeed();
        const testClient = this.generateClientSeed();
        crashes.push(this.calculateCrashPoint(testSeed, testClient, i));
      }
      
      const stats = this.analyzeDistribution(crashes);
      const rtpDifference = Math.abs(stats.rtp.actual - stats.rtp.theoretical);
      testResults.distribution = rtpDifference < 2.0; // Allow 2% variance
      
      console.log(`✅ Distribution: ${testResults.distribution ? 'PASS' : 'FAIL'}`);
      console.log(`   Average crash: ${stats.average}x`);
      console.log(`   Actual RTP: ${stats.rtp.actual}%`);
      console.log(`   Low (1-2x): ${stats.distribution.low.percentage}%`);
      console.log(`   Medium (2-5x): ${stats.distribution.medium.percentage}%`);
      console.log(`   High (5x+): ${(stats.distribution.high.percentage + stats.distribution.veryHigh.percentage).toFixed(1)}%`);

      const allTestsPassed = Object.values(testResults).every(result => result === true);
      
      console.log(`\n🎯 Overall Result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
      console.log(`🚀 System Status: ${allTestsPassed ? 'READY FOR PRODUCTION' : 'NEEDS ATTENTION'}\n`);
      
      return {
        allTestsPassed,
        testResults,
        sampleStats: stats,
        testSeeds: {
          serverSeed,
          clientSeed,
          hashedSeed,
          crashPoint
        }
      };
      
    } catch (error) {
      console.error('❌ Test Error:', error.message);
      return {
        allTestsPassed: false,
        error: error.message
      };
    }
  }
}

module.exports = ProvablyFair;