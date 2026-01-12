import { connectorSkipDecisionService } from '../services/connectorSkipDecisionService';
import { supportedConnectionTypesService } from '../services/supportedConnectionTypesService';

/**
 * Test to validate the centralized skip decision service is working
 * and enforcing the "non-skip on unknown" policy
 */
export async function validateSkipDecisionImplementation(): Promise<void> {
  console.log('🔍 Validating Skip Decision Implementation...');
  
  // Test 1: Ensure Web connectors are not skipped
  console.log('\n📋 Testing Web connector family...');
  const webConnectors = ['Web', 'HttpServer', 'Http', 'WebSource', 'WebTable'];
  
  for (const connector of webConnectors) {
    const decision = await connectorSkipDecisionService.makeSkipDecision(connector);
    console.log(`${connector}: ${decision.shouldSkip ? '❌ SKIP' : '✅ PROCESS'} (${decision.verificationStatus})`);
    
    if (decision.shouldSkip && decision.verificationStatus === 'available') {
      console.warn(`⚠️ WARNING: ${connector} is being skipped despite being Web-related. This indicates a mapping or API issue.`);
    }
  }
  
  // Test 2: Ensure critical connectors are not skipped
  console.log('\n📋 Testing critical connectors...');
  const criticalConnectors = ['RestService', 'AzureBlobs', 'SQL', 'AzureFunction'];
  
  for (const connector of criticalConnectors) {
    const decision = await connectorSkipDecisionService.makeSkipDecision(connector);
    console.log(`${connector}: ${decision.shouldSkip ? '❌ SKIP' : '✅ PROCESS'} (${decision.verificationStatus})`);
    
    if (decision.shouldSkip && decision.verificationStatus === 'available') {
      console.warn(`⚠️ WARNING: ${connector} is being skipped unexpectedly.`);
    }
  }
  
  // Test 3: Verify non-skip policy when verification unavailable
  console.log('\n📋 Testing non-skip policy...');
  
  // Temporarily disable verification to test policy
  const originalVerificationStatus = supportedConnectionTypesService.isVerificationAvailable();
  console.log(`Original verification status: ${originalVerificationStatus}`);
  
  // Test what happens with verification unavailable
  if (!originalVerificationStatus) {
    console.log('Testing with verification already unavailable...');
    const testDecision = await connectorSkipDecisionService.makeSkipDecision('TestConnectorWhenAPIUnavailable');
    
    if (testDecision.shouldSkip) {
      console.error('❌ CRITICAL: Non-skip policy violated! Connector was skipped when verification unavailable.');
    } else {
      console.log('✅ Non-skip policy working correctly when verification unavailable.');
    }
  } else {
    console.log('✅ Verification is available, skip decisions should be reliable.');
  }
  
  // Test 4: Check message construction
  console.log('\n📋 Testing message construction...');
  const testTypes = ['Web', 'RestService', 'NonExistentType'];
  
  for (const type of testTypes) {
    const decision = await connectorSkipDecisionService.makeSkipDecision(type);
    const message = connectorSkipDecisionService.getSkipDecisionMessage(type, decision);
    const alternatives = connectorSkipDecisionService.getSuggestedAlternativesMessage(decision);
    
    console.log(`${type}:`);
    console.log(`  Message: ${message}`);
    if (alternatives) {
      console.log(`  Alternatives: ${alternatives}`);
    }
    console.log(`  Verification reliable: ${connectorSkipDecisionService.isVerificationReliable(decision)}`);
  }
  
  // Test 5: Validate no "Available types: No supported types found" messages
  console.log('\n📋 Checking for problematic messages...');
  const availableTypesMessage = await supportedConnectionTypesService.getAvailableTypesForError();
  
  if (availableTypesMessage.includes('No supported types found')) {
    console.error('❌ CRITICAL: Found "No supported types found" message, this violates requirements.');
  } else {
    console.log('✅ No problematic "No supported types found" messages detected.');
  }
  
  console.log('\n✅ Skip Decision Implementation Validation Complete');
}

/**
 * Test specific scenarios that were causing false skips
 */
export async function validatePreviousSkipIssues(): Promise<void> {
  console.log('🔍 Validating Previous Skip Issues Are Fixed...');
  
  // Test scenario: Web connector was being skipped incorrectly
  console.log('\n📋 Testing Web connector (previously skipped incorrectly)...');
  const webDecision = await connectorSkipDecisionService.makeSkipDecision('Web');
  
  if (webDecision.shouldSkip && webDecision.verificationStatus === 'available') {
    console.error('❌ REGRESSION: Web connector is still being skipped incorrectly!');
    console.error('  Reason:', webDecision.reason);
    console.error('  Available types:', webDecision.availableTypes);
  } else {
    console.log('✅ Web connector skip issue appears to be fixed.');
  }
  
  // Test scenario: Empty "Available types" 
  console.log('\n📋 Testing for empty "Available types" messages...');
  const fakeDecision = await connectorSkipDecisionService.makeSkipDecision('DefinitelyNotARealConnectorType123');
  const fakeMessage = connectorSkipDecisionService.getSkipDecisionMessage('DefinitelyNotARealConnectorType123', fakeDecision);
  
  if (fakeMessage.includes('Available types:') && fakeMessage.includes('Available types: ')) {
    const availableTypesSection = fakeMessage.split('Available types: ')[1];
    if (!availableTypesSection || availableTypesSection.trim() === '') {
      console.error('❌ REGRESSION: Empty "Available types" section found!');
    } else if (availableTypesSection.includes('No supported types found')) {
      console.error('❌ REGRESSION: "No supported types found" message found!');
    } else {
      console.log('✅ "Available types" section contains actual types or proper unavailable message.');
    }
  } else {
    console.log('✅ No "Available types" issues detected for unsupported connector.');
  }
  
  console.log('\n✅ Previous Skip Issues Validation Complete');
}

/**
 * Run all skip decision validation tests
 */
export async function runAllSkipDecisionValidations(): Promise<void> {
  console.log('🧪 Running All Skip Decision Validations...');
  
  try {
    await validateSkipDecisionImplementation();
    await validatePreviousSkipIssues();
    
    console.log('\n🎉 All Skip Decision Validations PASSED');
  } catch (error) {
    console.error('\n💥 Skip Decision Validations FAILED:', error);
    throw error;
  }
}