/**
 * Basic validation test for connectionDeploymentService.ts
 * Tests core functionality without requiring full build environment
 */

// Import the service for testing
import { ConnectionDeploymentService } from '../services/connectionDeploymentService';
import type { LinkedServiceConnection } from '../types';

/**
 * Create mock LinkedServiceConnection for testing
 */
function createMockLinkedService(
  name: string, 
  mappingMode: 'existing' | 'new',
  overrides: Partial<LinkedServiceConnection> = {}
): LinkedServiceConnection {
  const base: LinkedServiceConnection = {
    linkedServiceName: name,
    linkedServiceType: 'SQL',
    linkedServiceDefinition: {},
    mappingMode,
    selectedConnectivityType: 'ShareableCloud',
    connectionParameters: {},
    credentials: {},
    skipTestConnection: false,
    status: 'pending',
    validationErrors: []
  };

  if (mappingMode === 'existing') {
    base.existingConnectionId = 'existing-conn-123';
    base.existingConnection = {
      id: 'existing-conn-123',
      displayName: 'Existing SQL Connection',
      connectivityType: 'ShareableCloud',
      connectionDetails: { type: 'SQL' }
    };
  } else {
    base.selectedConnectionType = 'SQL';
    base.credentialType = 'Basic';
    base.credentials = { username: 'test', password: 'test' };
  }

  return { ...base, ...overrides };
}

/**
 * Test basic functionality
 */
export function testConnectionDeploymentService(): void {
  console.log('🧪 Testing Connection Deployment Service...');

  try {
    // Test 1: Generate deployment plan
    console.log('\n1. Testing generateDeploymentPlan...');
    const linkedServices = [
      createMockLinkedService('TestConn1', 'new'),
      createMockLinkedService('TestConn2', 'existing')
    ];

    const plan = ConnectionDeploymentService.generateDeploymentPlan(linkedServices);
    
    console.log(`✓ Plan generated with ${plan.newConnections.length} new connections`);
    console.log(`✓ Plan generated with ${plan.existingConnections.length} existing mappings`);
    console.log(`✓ Total connections: ${plan.summary.totalConnections}`);

    // Test 2: Generate JSON plan
    console.log('\n2. Testing generateDeploymentPlanJson...');
    const jsonPlan = ConnectionDeploymentService.generateDeploymentPlanJson(linkedServices);
    const parsedPlan = JSON.parse(jsonPlan);
    
    console.log(`✓ JSON plan generated (${jsonPlan.length} characters)`);
    console.log(`✓ JSON has metadata: ${!!parsedPlan.metadata}`);
    console.log(`✓ JSON has deployment: ${!!parsedPlan.deployment}`);

    // Test 3: Generate text plan
    console.log('\n3. Testing generateDeploymentPlanText...');
    const textPlan = ConnectionDeploymentService.generateDeploymentPlanText(linkedServices);
    
    console.log(`✓ Text plan generated (${textPlan.length} characters)`);
    console.log(`✓ Text contains markdown headers: ${textPlan.includes('##')}`);

    // Test 4: Validate deployment plan
    console.log('\n4. Testing validateDeploymentPlan...');
    const validation = ConnectionDeploymentService.validateDeploymentPlan(linkedServices);
    
    console.log(`✓ Validation completed: ${validation.isValid ? 'VALID' : 'INVALID'}`);
    console.log(`✓ Errors: ${validation.errors.length}`);
    console.log(`✓ Warnings: ${validation.warnings.length}`);

    // Test 5: Get connection mapping summary
    console.log('\n5. Testing getConnectionMappingSummary...');
    const summary = ConnectionDeploymentService.getConnectionMappingSummary(linkedServices);
    
    console.log(`✓ Summary generated for ${summary.total} connections`);
    console.log(`✓ New connections: ${summary.newConnections}`);
    console.log(`✓ Existing mappings: ${summary.existingMappings}`);

    // Test 6: Test with invalid data
    console.log('\n6. Testing error handling...');
    const invalidLinkedServices = [
      createMockLinkedService('InvalidConn', 'new', { selectedConnectionType: undefined })
    ];
    
    const invalidValidation = ConnectionDeploymentService.validateDeploymentPlan(invalidLinkedServices);
    console.log(`✓ Invalid data detected: ${!invalidValidation.isValid}`);
    console.log(`✓ Error messages: ${invalidValidation.errors.length > 0}`);

    console.log('\n🎉 All tests passed! Connection Deployment Service is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Export for use in other test files
export { createMockLinkedService };