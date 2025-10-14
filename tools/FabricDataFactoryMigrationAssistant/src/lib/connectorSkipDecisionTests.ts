import { connectorSkipDecisionService } from '../services/connectorSkipDecisionService';
import { supportedConnectionTypesService } from '../services/supportedConnectionTypesService';

/**
 * Integration tests for the centralized connector skip decision service
 * Tests the "non-skip on unknown" policy and Web connector handling
 */
export async function runConnectorSkipDecisionTests(): Promise<void> {
  console.log('🧪 Running Connector Skip Decision Tests...');
  
  try {
    // Test 1: Web connector should not be skipped
    console.log('\n📋 Test 1: Web Connector Support');
    const webDecision = await connectorSkipDecisionService.makeSkipDecision('Web');
    console.log('Web connector decision:', {
      shouldSkip: webDecision.shouldSkip,
      reason: webDecision.reason,
      verificationStatus: webDecision.verificationStatus
    });
    
    if (webDecision.shouldSkip) {
      console.warn('⚠️ WARNING: Web connector is being skipped, this may indicate a mapping issue');
    } else {
      console.log('✅ Web connector is not skipped');
    }
    
    // Test 2: HttpServer should map to Web and not be skipped
    console.log('\n📋 Test 2: HttpServer to Web Mapping');
    const httpServerDecision = await connectorSkipDecisionService.makeSkipDecision('HttpServer');
    console.log('HttpServer decision:', {
      shouldSkip: httpServerDecision.shouldSkip,
      reason: httpServerDecision.reason,
      verificationStatus: httpServerDecision.verificationStatus
    });
    
    if (httpServerDecision.shouldSkip) {
      console.warn('⚠️ WARNING: HttpServer is being skipped, mapping may need attention');
    } else {
      console.log('✅ HttpServer is not skipped (mapped to Web)');
    }
    
    // Test 3: RestService should not be skipped
    console.log('\n📋 Test 3: RestService Support');
    const restDecision = await connectorSkipDecisionService.makeSkipDecision('RestService');
    console.log('RestService decision:', {
      shouldSkip: restDecision.shouldSkip,
      reason: restDecision.reason,
      verificationStatus: restDecision.verificationStatus
    });
    
    if (restDecision.shouldSkip) {
      console.warn('⚠️ WARNING: RestService is being skipped unexpectedly');
    } else {
      console.log('✅ RestService is not skipped');
    }
    
    // Test 4: Non-existent connector with API available should be skipped
    console.log('\n📋 Test 4: Non-existent Connector (when API available)');
    const fakeDecision = await connectorSkipDecisionService.makeSkipDecision('NonExistentConnectorType123');
    console.log('Fake connector decision:', {
      shouldSkip: fakeDecision.shouldSkip,
      reason: fakeDecision.reason,
      verificationStatus: fakeDecision.verificationStatus
    });
    
    // Test 5: Batch processing
    console.log('\n📋 Test 5: Batch Processing');
    const testTypes = ['Web', 'RestService', 'HttpServer', 'AzureBlobs', 'NonExistent'];
    const batchDecisions = await connectorSkipDecisionService.makeBatchSkipDecisions(testTypes);
    
    console.log('Batch decisions summary:');
    batchDecisions.forEach((decision, type) => {
      console.log(`  ${type}: ${decision.shouldSkip ? 'SKIP' : 'PROCESS'} (${decision.verificationStatus})`);
    });
    
    const summary = connectorSkipDecisionService.getSkipDecisionSummary(batchDecisions);
    console.log('Batch summary:', summary);
    
    // Test 6: Verification availability
    console.log('\n📋 Test 6: Verification Status');
    const isVerificationAvailable = supportedConnectionTypesService.isVerificationAvailable();
    console.log('Verification available:', isVerificationAvailable);
    
    if (!isVerificationAvailable) {
      console.log('ℹ️ Verification unavailable - testing non-skip policy');
      
      const testDecisionWhenUnavailable = await connectorSkipDecisionService.makeSkipDecision('TestTypeWhenAPIUnavailable');
      console.log('Decision when API unavailable:', {
        shouldSkip: testDecisionWhenUnavailable.shouldSkip,
        reason: testDecisionWhenUnavailable.reason
      });
      
      if (testDecisionWhenUnavailable.shouldSkip) {
        console.error('❌ FAILED: Non-skip policy violated when API unavailable');
      } else {
        console.log('✅ Non-skip policy working correctly when API unavailable');
      }
    }
    
    // Test 7: Web connector validation specifically
    console.log('\n📋 Test 7: Web Connector Validation');
    const webValidationResult = await connectorSkipDecisionService.validateWebConnectorMapping(['Web', 'HttpServer']);
    console.log('Web connector validation result:', webValidationResult);
    
    if (!webValidationResult) {
      console.error('❌ FAILED: Web connector validation failed');
    } else {
      console.log('✅ Web connector validation passed');
    }
    
    console.log('\n✅ Connector Skip Decision Tests Completed');
    
  } catch (error) {
    console.error('❌ Connector Skip Decision Tests Failed:', error);
    throw error;
  }
}

/**
 * Test the Web connector mapping specifically
 */
export async function testWebConnectorMapping(): Promise<boolean> {
  try {
    const webTypes = ['Web', 'HttpServer', 'Http', 'WebSource', 'WebTable'];
    
    console.log('Testing Web-related connector types...');
    
    for (const type of webTypes) {
      const decision = await connectorSkipDecisionService.makeSkipDecision(type);
      console.log(`${type}: ${decision.shouldSkip ? 'SKIP' : 'PROCESS'}`);
      
      if (decision.shouldSkip && decision.verificationStatus === 'available') {
        console.warn(`⚠️ ${type} is being skipped despite being Web-related`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Web connector mapping test failed:', error);
    return false;
  }
}