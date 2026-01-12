import { connectorMappingService } from '../services/connectorMappingService';

// Test function to validate the enhanced connector mapping
export function testConnectorMapping() {
  console.log('Testing enhanced connector mapping...');
  
  // Test cases for common ADF connector types
  const testCases = [
    { adfType: 'RestService', expectedFabric: 'RestService' },
    { adfType: 'AzureFunction', expectedFabric: 'AzureFunction' },
    { adfType: 'SqlServer', expectedFabric: 'SQL' },
    { adfType: 'AzureBlobStorage', expectedFabric: 'AzureBlobs' },
    { adfType: 'Http', expectedFabric: 'Web' },
    { adfType: 'MySql', expectedFabric: 'MySql' },
    { adfType: 'PostgreSql', expectedFabric: 'PostgreSQL' }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    const result = connectorMappingService.getFabricConnectorType(testCase.adfType);
    if (result === testCase.expectedFabric) {
      console.log(`✅ ${testCase.adfType} -> ${result} (Expected: ${testCase.expectedFabric})`);
      passedTests++;
    } else {
      console.log(`❌ ${testCase.adfType} -> ${result} (Expected: ${testCase.expectedFabric})`);
      failedTests++;
    }
  }

  // Test that Generic is only used as fallback
  const unknownType = connectorMappingService.getFabricConnectorType('UnknownConnectorType');
  if (unknownType === 'Generic') {
    console.log(`✅ Unknown type correctly defaults to Generic`);
    passedTests++;
  } else {
    console.log(`❌ Unknown type should default to Generic but got: ${unknownType}`);
    failedTests++;
  }

  console.log(`\nTest Summary: ${passedTests} passed, ${failedTests} failed`);
  
  // Test connection details mapping for RestService
  const mockADFRestService = {
    properties: {
      type: 'RestService',
      typeProperties: {
        url: 'https://api.example.com',
        authenticationType: 'Anonymous'
      }
    }
  };

  const connectionDetails = connectorMappingService.buildConnectionDetails(
    mockADFRestService,
    'RestService'
  );

  console.log('\nTesting RestService connection details mapping:');
  console.log('Input ADF:', mockADFRestService.properties.typeProperties);
  console.log('Output connectionDetails:', connectionDetails);

  if (connectionDetails.baseUrl === 'https://api.example.com') {
    console.log('✅ RestService URL mapping successful');
    passedTests++;
  } else {
    console.log('❌ RestService URL mapping failed');
    failedTests++;
  }

  return { passedTests, failedTests, totalTests: passedTests + failedTests };
}

// Export for use in testing
export { connectorMappingService };