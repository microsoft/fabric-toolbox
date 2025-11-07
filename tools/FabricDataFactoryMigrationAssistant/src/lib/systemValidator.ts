/**
 * Simple validation runner to check system integration
 * This can be called from components to verify the refactored system works
 */

import { integrationTests } from '../lib/integrationTests';

/**
 * Validate the refactored system is working correctly
 */
export async function validateRefactoredSystem(): Promise<boolean> {
  try {
    console.log('🔍 Validating refactored supported connection types system...');
    
    const results = await integrationTests.runIntegrationTests();
    
    if (results.failed === 0) {
      console.log('✅ All validation tests passed - refactored system is working correctly');
      return true;
    } else {
      console.warn(`⚠️ ${results.failed} validation tests failed - system may have issues`);
      return false;
    }
  } catch (error) {
    console.error('❌ System validation failed with error:', error);
    return false;
  }
}

/**
 * Run a quick smoke test of core functionality
 */
export async function runSmokeTest(): Promise<boolean> {
  try {
    console.log('🧪 Running smoke test...');
    
    // Test safe sorting
    const sortResult = integrationTests.testSafeSorting();
    if (!sortResult) {
      console.error('❌ Smoke test failed: Safe sorting');
      return false;
    }
    
    // Test type mappings
    const mappingResult = integrationTests.testTypeMappings();
    if (!mappingResult) {
      console.error('❌ Smoke test failed: Type mappings');
      return false;
    }
    
    console.log('✅ Smoke test passed');
    return true;
  } catch (error) {
    console.error('❌ Smoke test failed with error:', error);
    return false;
  }
}

export { integrationTests };