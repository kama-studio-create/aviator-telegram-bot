const crypto = require('crypto');

// Provably Fair Implementation (same as in server)
class ProvablyFair {
  static generateServerSeed() {
    return crypto.randomBytes(32).toString('hex');
  }

  static generateClientSeed() {
    return Math.random().toString(36).substring(2, 15);
  }

  static generateHashedServerSeed(serverSeed) {
    return crypto.createHash('sha256').update(serverSeed).digest('hex');
  }

  static calculateCrashPoint(serverSeed, clientSeed, nonce) {
    const hash = crypto
      .createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');

    // Convert first 8 characters of hash to integer
    const hashInt = parseInt(hash.substr(0, 8), 16);
    
    // Apply house edge formula
    const e = Math.pow(2, 32);
    const houseEdge = 0.02; // 2%
    const crashPoint = (e / (e - hashInt)) * (1 - houseEdge);
    
    // Ensure minimum 1.00x and reasonable maximum
    return Math.max(1.00, Math.min(crashPoint, 1000.00));
  }

  static verifyCrashPoint(serverSeed, clientSeed, nonce, crashPoint) {
    const calculatedCrash = this.calculateCrashPoint(serverSeed, clientSeed, nonce);
    return Math.abs(calculatedCrash - crashPoint) < 0.01;
  }
}

// Test Functions
function testBasicFunctionality() {
  console.log('🧪 Testing Basic Functionality...\n');
  
  // Test 1: Seed Generation
  const serverSeed = ProvablyFair.generateServerSeed();
  const clientSeed = ProvablyFair.generateClientSeed();
  const hashedServerSeed = ProvablyFair.generateHashedServerSeed(serverSeed);
  
  console.log(`✅ Server Seed Generated: ${serverSeed.length === 64 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Client Seed Generated: ${clientSeed.length > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Hashed Server Seed: ${hashedServerSeed.length === 64 ? 'PASS' : 'FAIL'}`);
  
  // Test 2: Crash Point Calculation
  const gameId = 1;
  const crashPoint = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, gameId);
  
  console.log(`✅ Crash Point Calculated: ${crashPoint >= 1.00 && crashPoint <= 1000.00 ? 'PASS' : 'FAIL'}`);
  console.log(`   Crash Point: ${crashPoint.toFixed(2)}x`);
  
  // Test 3: Verification
  const isValid = ProvablyFair.verifyCrashPoint(serverSeed, clientSeed, gameId, crashPoint);
  
  console.log(`✅ Verification: ${isValid ? 'PASS' : 'FAIL'}\n`);
  
  return {
    serverSeed,
    clientSeed,
    hashedServerSeed,
    gameId,
    crashPoint,
    isValid
  };
}

function testConsistency() {
  console.log('🔄 Testing Consistency...\n');
  
  const serverSeed = 'test_server_seed_12345678901234567890123456789012';
  const clientSeed = 'test_client_seed';
  
  // Calculate same crash point multiple times
  const results = [];
  for (let i = 0; i < 5; i++) {
    const crashPoint = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, 1);
    results.push(crashPoint);
  }
  
  const allSame = results.every(result => Math.abs(result - results[0]) < 0.001);
  console.log(`✅ Consistency Test: ${allSame ? 'PASS' : 'FAIL'}`);
  console.log(`   All results: ${results.map(r => r.toFixed(2)).join(', ')}\n`);
  
  return allSame;
}

function testDistribution() {
  console.log('📊 Testing Distribution...\n');
  
  const results = [];
  const numTests = 10000;
  
  console.log(`Running ${numTests} test flights...`);
  
  for (let i = 1; i <= numTests; i++) {
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = ProvablyFair.generateClientSeed();
    const crashPoint = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, i);
    results.push(crashPoint);
    
    // Progress indicator
    if (i % 1000 === 0) {
      process.stdout.write(`   Progress: ${(i/numTests*100).toFixed(1)}%\r`);
    }
  }
  
  console.log(''); // New line after progress
  
  // Analyze distribution
  const low = results.filter(r => r >= 1.00 && r < 2.00).length;
  const medium = results.filter(r => r >= 2.00 && r < 5.00).length;
  const high = results.filter(r => r >= 5.00 && r < 10.00).length;
  const veryHigh = results.filter(r => r >= 10.00).length;
  
  const lowPercent = (low / numTests * 100).toFixed(1);
  const mediumPercent = (medium / numTests * 100).toFixed(1);
  const highPercent = (high / numTests * 100).toFixed(1);
  const veryHighPercent = (veryHigh / numTests * 100).toFixed(1);
  
  console.log(`Distribution Analysis (${numTests} flights):`);
  console.log(`   1.00-2.00x: ${low} flights (${lowPercent}%) - Expected ~45%`);
  console.log(`   2.00-5.00x: ${medium} flights (${mediumPercent}%) - Expected ~35%`);
  console.log(`   5.00-10.00x: ${high} flights (${highPercent}%) - Expected ~15%`);
  console.log(`   10.00x+: ${veryHigh} flights (${veryHighPercent}%) - Expected ~5%`);
  
  const average = results.reduce((a, b) => a + b, 0) / results.length;
  const expectedRTP = 0.98;
  const actualRTP = 1 / average;
  
  console.log(`\n📈 RTP Analysis:`);
  console.log(`   Average Crash Point: ${average.toFixed(2)}x`);
  console.log(`   Expected RTP: ${(expectedRTP * 100).toFixed(1)}%`);
  console.log(`   Actual RTP: ${(actualRTP * 100).toFixed(1)}%`);
  console.log(`   Difference: ${Math.abs(expectedRTP - actualRTP) * 100 < 1 ? 'ACCEPTABLE' : 'NEEDS ADJUSTMENT'}`);
  
  // Volatility analysis
  const sortedResults = results.sort((a, b) => a - b);
  const median = sortedResults[Math.floor(numTests / 2)];
  const p90 = sortedResults[Math.floor(numTests * 0.9)];
  const p95 = sortedResults[Math.floor(numTests * 0.95)];
  const p99 = sortedResults[Math.floor(numTests * 0.99)];
  
  console.log(`\n📊 Percentile Analysis:`);
  console.log(`   Median (50%): ${median.toFixed(2)}x`);
  console.log(`   90th Percentile: ${p90.toFixed(2)}x`);
  console.log(`   95th Percentile: ${p95.toFixed(2)}x`);
  console.log(`   99th Percentile: ${p99.toFixed(2)}x`);
  console.log(`   Maximum: ${Math.max(...results).toFixed(2)}x\n`);
  
  return {
    low, medium, high, veryHigh,
    lowPercent, mediumPercent, highPercent, veryHighPercent,
    average, actualRTP, median, p90, p95, p99
  };
}

function testEdgeCases() {
  console.log('⚠️  Testing Edge Cases...\n');
  
  // Test with same seeds but different nonces
  const serverSeed = 'test_server_seed_12345678901234567890123456789012';
  const clientSeed = 'test_client_seed';
  
  console.log('Same seeds, different flight IDs:');
  const results = [];
  for (let nonce = 1; nonce <= 10; nonce++) {
    const crashPoint = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, nonce);
    results.push({ nonce, crashPoint });
    console.log(`   Flight ${nonce}: ${crashPoint.toFixed(2)}x`);
  }
  
  // Check if all different
  const allDifferent = results.every((r, i) => 
    results.every((r2, j) => i === j || Math.abs(r.crashPoint - r2.crashPoint) > 0.01)
  );
  
  console.log(`✅ All Different: ${allDifferent ? 'PASS' : 'FAIL'}`);
  
  // Test extreme values
  console.log('\nTesting extreme values:');
  const extremeTests = [
    { serverSeed: '0'.repeat(64), clientSeed: '0', nonce: 1 },
    { serverSeed: 'f'.repeat(64), clientSeed: 'z'.repeat(10), nonce: 999999 },
    { serverSeed: ProvablyFair.generateServerSeed(), clientSeed: '', nonce: 0 },
  ];
  
  extremeTests.forEach((test, i) => {
    try {
      const crashPoint = ProvablyFair.calculateCrashPoint(test.serverSeed, test.clientSeed, test.nonce);
      console.log(`   Extreme Test ${i + 1}: ${crashPoint.toFixed(2)}x - ${crashPoint >= 1.00 && crashPoint <= 1000.00 ? 'VALID' : 'INVALID'}`);
    } catch (error) {
      console.log(`   Extreme Test ${i + 1}: ERROR - ${error.message}`);
    }
  });
  
  console.log('');
  return allDifferent;
}

function testSecurity() {
  console.log('🔒 Testing Security...\n');
  
  // Test hash collision resistance
  console.log('Testing hash collision resistance...');
  const hashSet = new Set();
  let collisions = 0;
  
  for (let i = 0; i < 1000; i++) {
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = ProvablyFair.generateClientSeed();
    const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${i}`).digest('hex');
    
    if (hashSet.has(hash)) {
      collisions++;
    } else {
      hashSet.add(hash);
    }
  }
  
  console.log(`✅ Hash Collision Test: ${collisions === 0 ? 'PASS' : 'FAIL'} (${collisions} collisions found)`);
  
  // Test predictability
  console.log('Testing predictability...');
  const predictions = [];
  const actual = [];
  
  for (let i = 1; i <= 100; i++) {
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = ProvablyFair.generateClientSeed();
    const crashPoint = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, i);
    
    actual.push(crashPoint);
    
    // Try to predict next value (should be impossible)
    const prediction = i > 1 ? actual[i-2] + (actual[i-2] - (actual[i-3] || 1)) : 2.0;
    predictions.push(prediction);
  }
  
  // Calculate correlation (should be close to 0)
  const correlation = calculateCorrelation(actual.slice(1), predictions.slice(1));
  const isPredictable = Math.abs(correlation) > 0.1;
  
  console.log(`✅ Predictability Test: ${!isPredictable ? 'PASS' : 'FAIL'} (correlation: ${correlation.toFixed(4)})`);
  
  console.log('');
  return { collisions: collisions === 0, predictable: !isPredictable };
}

function calculateCorrelation(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

function testPerformance() {
  console.log('⚡ Testing Performance...\n');
  
  const iterations = 10000;
  console.log(`Running ${iterations} crash point calculations...`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = ProvablyFair.generateClientSeed();
    ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, i);
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  const operationsPerSecond = Math.round(iterations / (duration / 1000));
  
  console.log(`✅ Performance Test: ${duration}ms for ${iterations} operations`);
  console.log(`   Operations per second: ${operationsPerSecond.toLocaleString()}`);
  console.log(`   Average time per operation: ${(duration / iterations).toFixed(2)}ms`);
  
  const isAcceptable = operationsPerSecond > 1000; // Should handle at least 1000 ops/sec
  console.log(`   Performance: ${isAcceptable ? 'ACCEPTABLE' : 'NEEDS OPTIMIZATION'}\n`);
  
  return { duration, operationsPerSecond, isAcceptable };
}

function runCompleteTest() {
  console.log('🛩️ AVIATOR PROVABLY FAIR TEST SUITE');
  console.log('====================================\n');
  
  const startTime = Date.now();
  
  // Run all tests
  const basicTest = testBasicFunctionality();
  const consistencyTest = testConsistency();
  const distributionTest = testDistribution();
  const edgeCaseTest = testEdgeCases();
  const securityTest = testSecurity();
  const performanceTest = testPerformance();
  
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  console.log('📋 COMPREHENSIVE TEST SUMMARY');
  console.log('==============================');
  console.log(`✅ Basic Functionality: ${basicTest.isValid ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Consistency: ${consistencyTest ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Distribution: ${Math.abs(distributionTest.actualRTP - 0.98) < 0.02 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Edge Cases: ${edgeCaseTest ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Security: ${securityTest.collisions && securityTest.predictable ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Performance: ${performanceTest.isAcceptable ? 'PASS' : 'FAIL'}`);
  console.log(`⏱️  Total Execution Time: ${totalDuration}ms\n`);
  
  // Overall assessment
  const allTestsPassed = basicTest.isValid && 
                        consistencyTest && 
                        Math.abs(distributionTest.actualRTP - 0.98) < 0.02 && 
                        edgeCaseTest && 
                        securityTest.collisions && 
                        securityTest.predictable && 
                        performanceTest.isAcceptable;
  
  console.log('🎯 OVERALL ASSESSMENT');
  console.log('=====================');
  console.log(`Status: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log(`System: ${allTestsPassed ? 'READY FOR PRODUCTION' : 'NEEDS ATTENTION'}\n`);
  
  // Sample verification data for users
  console.log('🔍 SAMPLE VERIFICATION DATA');
  console.log('============================');
  console.log(`Flight ID: ${basicTest.gameId}`);
  console.log(`Server Seed: ${basicTest.serverSeed}`);
  console.log(`Client Seed: ${basicTest.clientSeed}`);
  console.log(`Hashed Server Seed: ${basicTest.hashedServerSeed}`);
  console.log(`Crash Point: ${basicTest.crashPoint.toFixed(2)}x`);
  console.log(`Verification: ${basicTest.isValid ? 'VALID ✅' : 'INVALID ❌'}`);
  
  console.log('\n🔧 MANUAL VERIFICATION STEPS:');
  console.log('==============================');
  console.log('1. Create HMAC-SHA256 hash using server seed as key');
  console.log('2. Hash the string: "client_seed:flight_id"');
  console.log('3. Take first 8 characters of hex result');
  console.log('4. Convert to integer');
  console.log('5. Apply formula: (2^32 / (2^32 - hash_int)) * (1 - house_edge)');
  console.log('6. Result should match the crash point');
  
  console.log('\n📊 DISTRIBUTION SUMMARY:');
  console.log('========================');
  console.log(`Low multipliers (1.0-2.0x): ${distributionTest.lowPercent}%`);
  console.log(`Medium multipliers (2.0-5.0x): ${distributionTest.mediumPercent}%`);
  console.log(`High multipliers (5.0x+): ${(parseFloat(distributionTest.highPercent) + parseFloat(distributionTest.veryHighPercent)).toFixed(1)}%`);
  console.log(`Average crash point: ${distributionTest.average.toFixed(2)}x`);
  console.log(`Actual RTP: ${(distributionTest.actualRTP * 100).toFixed(2)}%`);
  
  console.log('\n🚀 READY FOR DEPLOYMENT!');
  console.log('=========================');
  
  if (allTestsPassed) {
    console.log('✅ Your Aviator bot is ready for production deployment!');
    console.log('✅ Provably fair system is working correctly');
    console.log('✅ All security checks passed');
    console.log('✅ Performance is acceptable');
    console.log('\n🎮 Next steps:');
    console.log('   1. Deploy to your hosting platform');
    console.log('   2. Configure your Telegram bot token');
    console.log('   3. Set up the web app URL with @BotFather');
    console.log('   4. Start with a small group of beta testers');
    console.log('   5. Monitor performance and user feedback');
  } else {
    console.log('⚠️  Some tests failed. Please review the results above.');
    console.log('⚠️  Do not deploy until all tests pass.');
  }
  
  return {
    allTestsPassed,
    basicTest,
    consistencyTest,
    distributionTest,
    edgeCaseTest,
    securityTest,
    performanceTest,
    totalDuration
  };
}

// Additional utility function for verification
function verifySpecificGame(serverSeed, clientSeed, gameId, expectedCrash) {
  console.log('\n🔍 VERIFYING SPECIFIC FLIGHT');
  console.log('============================');
  console.log(`Flight ID: ${gameId}`);
  console.log(`Server Seed: ${serverSeed}`);
  console.log(`Client Seed: ${clientSeed}`);
  console.log(`Expected Crash: ${expectedCrash}x`);
  
  const calculatedCrash = ProvablyFair.calculateCrashPoint(serverSeed, clientSeed, gameId);
  const isValid = Math.abs(calculatedCrash - expectedCrash) < 0.01;
  
  console.log(`Calculated Crash: ${calculatedCrash.toFixed(2)}x`);
  console.log(`Verification: ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);
  
  if (!isValid) {
    console.log(`Difference: ${Math.abs(calculatedCrash - expectedCrash).toFixed(4)}`);
  }
  
  return isValid;
}

// Run tests if this file is executed directly
if (require.main === module) {
  // Check if specific verification was requested
  const args = process.argv.slice(2);
  
  if (args.length >= 4 && args[0] === 'verify') {
    const [, serverSeed, clientSeed, gameId, expectedCrash] = args;
    verifySpecificGame(serverSeed, clientSeed, parseInt(gameId), parseFloat(expectedCrash));
  } else if (args[0] === 'quick') {
    // Run quick test (fewer iterations)
    console.log('🚀 RUNNING QUICK TEST SUITE\n');
    const basicTest = testBasicFunctionality();
    const consistencyTest = testConsistency();
    console.log(`✅ Quick Test Summary:`);
    console.log(`   Basic: ${basicTest.isValid ? 'PASS' : 'FAIL'}`);
    console.log(`   Consistency: ${consistencyTest ? 'PASS' : 'FAIL'}`);
  } else {
    // Run complete test suite
    runCompleteTest();
  }
}

module.exports = {
  ProvablyFair,
  testBasicFunctionality,
  testConsistency,
  testDistribution,
  testEdgeCases,
  testSecurity,
  testPerformance,
  runCompleteTest,
  verifySpecificGame
};