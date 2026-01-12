/**
 * Simple integration test for the supported connection types service
 * This file serves as a basic validation of the refactored system
 */

import { supportedConnectionTypesService, toFabricTypeName, safeSorted } from '../services/supportedConnectionTypesService';
import { connectorSkipDecisionService } from '../services/connectorSkipDecisionService';
import { componentValidationService } from '../services/componentValidationService';
import { runConnectorSkipDecisionTests, testWebConnectorMapping } from './connectorSkipDecisionTests';
import { ADFComponent } from '../types';

/**
 * Test the safe sorting function to ensure it handles undefined values
 */
export function testSafeSorting(): boolean {
  try {
    // Test with mixed valid and undefined values
    const testArray: (string | undefined)[] = ['zebra', undefined, 'apple', undefined, 'banana', ''];
    const result = safeSorted(testArray);
    
    // Should return only non-empty strings, sorted
    const expected = ['apple', 'banana', 'zebra'];
    
    const isValid = JSON.stringify(result) === JSON.stringify(expected);
    console.log('Safe sorting test:', isValid ? 'PASSED' : 'FAILED', { result, expected });
    return isValid;
  } catch (error) {
    console.error('Safe sorting test FAILED with error:', error);
    return false;
  }
}

/**
 * Test the ADF to Fabric type mapping
 */
export function testTypeMappings(): boolean {
  try {
    const testCases = [
      { input: 'RestService', expected: 'RestService' },
      { input: 'HttpServer', expected: 'Web' },
      { input: 'Http', expected: 'Web' },
      { input: 'Web', expected: 'Web' },
      { input: 'WebSource', expected: 'Web' },
      { input: 'WebTable', expected: 'Web' },
      { input: 'AzureBlobStorage', expected: 'AzureBlobs' },
      { input: 'UnknownType', expected: 'UnknownType' } // Should pass through unchanged
    ];
    
    let allPassed = true;
    for (const testCase of testCases) {
      const result = toFabricTypeName(testCase.input);
      const passed = result === testCase.expected;
      if (!passed) {
        console.error(`Type mapping test FAILED: ${testCase.input} -> ${result}, expected ${testCase.expected}`);
        allPassed = false;
      }
    }
    
    if (allPassed) {
      console.log('Type mapping test: PASSED');
    }
    
    return allPassed;
  } catch (error) {
    console.error('Type mapping test FAILED with error:', error);
    return false;
  }
}

/**
 * Test component validation service with a sample component
 */
export async function testComponentValidation(): Promise<boolean> {
  try {
    // Create a sample linked service component
    const sampleComponent: ADFComponent = {
      name: 'TestRestService',
      type: 'linkedService',
      definition: {
        properties: {
          type: 'RestService',
          typeProperties: {
            url: 'https://api.example.com'
          }
        }
      },
      isSelected: true,
      compatibilityStatus: 'supported',
      warnings: []
    };
    
    // Validate the component
    const validation = await componentValidationService.validateComponent(sampleComponent);
    
    // Should return a status and warnings array
    const isValid = validation.compatibilityStatus && Array.isArray(validation.warnings);
    console.log('Component validation test:', isValid ? 'PASSED' : 'FAILED', {
      status: validation.compatibilityStatus,
      warningsCount: validation.warnings.length
    });
    
    return isValid;
  } catch (error) {
    console.error('Component validation test FAILED with error:', error);
    return false;
  }
}

/**
 * Test the supported connection types service basic functionality
 */
export async function testSupportedConnectionTypesService(): Promise<boolean> {
  try {
    // Test that the service can handle unavailable verification gracefully
    const verificationAvailable = supportedConnectionTypesService.isVerificationAvailable();
    console.log('Verification available:', verificationAvailable);
    
    // Test getting display list (should not throw)
    const displayList = await supportedConnectionTypesService.getDisplayList();
    console.log('Display list length:', displayList.length);
    
    // Test support check for a common type
    const isRestServiceSupported = await supportedConnectionTypesService.isSupported('RestService');
    console.log('RestService supported:', isRestServiceSupported);
    
    // Should complete without throwing
    console.log('Supported connection types service test: PASSED');
    return true;
  } catch (error) {
    console.error('Supported connection types service test FAILED with error:', error);
    return false;
  }
}

/**
 * Run all integration tests including the new centralized skip decision tests
 */
export async function runIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('=== Running Integration Tests ===');
  
  const tests = [
    { name: 'Safe Sorting', test: () => Promise.resolve(testSafeSorting()) },
    { name: 'Type Mappings', test: () => Promise.resolve(testTypeMappings()) },
    { name: 'Component Validation', test: testComponentValidation },
    { name: 'Supported Connection Types Service', test: testSupportedConnectionTypesService },
    { name: 'Connector Skip Decision Service', test: async () => {
      try {
        await runConnectorSkipDecisionTests();
        return true;
      } catch (error) {
        console.error('Connector Skip Decision Tests failed:', error);
        return false;
      }
    }},
    { name: 'Web Connector Mapping', test: testWebConnectorMapping }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const { name, test } of tests) {
    try {
      console.log(`\n--- Testing: ${name} ---`);
      const result = await test();
      if (result) {
        passed++;
        console.log(`✅ ${name}: PASSED`);
      } else {
        failed++;
        console.log(`❌ ${name}: FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${name}: FAILED with error:`, error);
    }
  }
  
  console.log(`\n=== Test Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  return { passed, failed };
}

// Export individual test functions for selective testing
export const integrationTests = {
  testSafeSorting,
  testTypeMappings,
  testComponentValidation,
  testSupportedConnectionTypesService,
  runConnectorSkipDecisionTests,
  testWebConnectorMapping,
  runIntegrationTests
};