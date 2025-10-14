/**
 * Test runner for the Copy Activity fix validation
 */

import { runCopyActivityValidation } from './copy-activity-fix-validation';

async function runTest() {
  console.log('🚀 Starting Copy Activity Fix Validation Test...\n');
  
  const result = runCopyActivityValidation();
  
  console.log('\n📊 VALIDATION SUMMARY:');
  console.log('='.repeat(50));
  console.log(`✅ Success: ${result.success}`);
  console.log(`❌ Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log('\n🚨 ERRORS FOUND:');
    result.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (result.success) {
    console.log('🎉 ALL TESTS PASSED! The Copy Activity bug fix is working correctly.');
    console.log('✨ Fabric Pipeline Copy Activities will no longer include invalid inputs/outputs arrays.');
  } else {
    console.log('❌ SOME TESTS FAILED. Please review the errors above.');
  }
  
  return result.success;
}

// Run the test
if (require.main === module) {
  runTest().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });
}

export { runTest };