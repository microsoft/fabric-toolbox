// Example demonstrating the enhanced connector mapping functionality

import { 
  sampleADFLinkedServices, 
  sampleSupportedConnectors, 
  testUtils, 
  validationHelpers 
} from '../lib/testHelpers';
import { connectorService } from '../services/connectorService';

/**
 * Example: Complete flow of enhanced connector mapping
 */
export async function demonstrateEnhancedMapping() {
  console.log('🚀 Demonstrating Enhanced Connector Mapping\n');

  // Step 1: Initialize connector service with mock data
  console.log('1️⃣ Initializing connector service...');
  
  // Mock the static connector data loading
  (connectorService as any).supportedConnectors = new Map();
  sampleSupportedConnectors.forEach(connector => {
    (connectorService as any).supportedConnectors.set(connector.type, connector);
  });
  (connectorService as any).initialized = true;
  
  console.log(`   ✅ Loaded ${sampleSupportedConnectors.length} connector types`);

  // Step 2: Create mock ADF components
  console.log('\n2️⃣ Creating mock ADF components...');
  
  const sqlComponent = testUtils.createMockADFComponent(
    sampleADFLinkedServices.sqlServer
  );
  
  const restComponent = testUtils.createMockADFComponent(
    sampleADFLinkedServices.restService
  );
  
  const blobComponent = testUtils.createMockADFComponent(
    sampleADFLinkedServices.azureBlob
  );

  console.log(`   ✅ Created ${3} mock components`);

  // Step 3: Demonstrate auto-mapping of connector types
  console.log('\n3️⃣ Demonstrating auto-mapping...');
  
  const sqlConnectorType = (connectorService as any).getConnectorType?.('SqlServer') || 'SQL';
  const restConnectorType = (connectorService as any).getConnectorType?.('RestService') || 'RestService';
  const blobConnectorType = (connectorService as any).getConnectorType?.('AzureBlobStorage') || 'AzureBlobs';
  
  console.log(`   SQL Server → ${sqlConnectorType}`);
  console.log(`   REST Service → ${restConnectorType}`);
  console.log(`   Azure Blob → ${blobConnectorType}`);

  // Step 4: Build default connection details
  console.log('\n4️⃣ Building default connection details...');
  
  const sqlConnectionDetails = connectorService.buildDefaultConnectionDetails(
    sampleADFLinkedServices.sqlServer,
    sqlConnectorType
  );
  
  const restConnectionDetails = connectorService.buildDefaultConnectionDetails(
    sampleADFLinkedServices.restService,
    restConnectorType
  );
  
  const blobConnectionDetails = connectorService.buildDefaultConnectionDetails(
    sampleADFLinkedServices.azureBlob,
    blobConnectorType
  );

  console.log('   SQL:', JSON.stringify(sqlConnectionDetails, null, 2));
  console.log('   REST:', JSON.stringify(restConnectionDetails, null, 2));
  console.log('   Blob:', JSON.stringify(blobConnectionDetails, null, 2));

  // Step 5: Validate configurations
  console.log('\n5️⃣ Validating configurations...');
  
  const sqlValidation = connectorService.validateConnectionDetails(sqlConnectorType, sqlConnectionDetails);
  const restValidation = connectorService.validateConnectionDetails(restConnectorType, restConnectionDetails);
  const blobValidation = connectorService.validateConnectionDetails(blobConnectorType, blobConnectionDetails);
  
  console.log(`   SQL: ${sqlValidation.isValid ? '✅' : '❌'} ${sqlValidation.errors.length} errors, ${sqlValidation.warnings.length} warnings`);
  console.log(`   REST: ${restValidation.isValid ? '✅' : '❌'} ${restValidation.errors.length} errors, ${restValidation.warnings.length} warnings`);
  console.log(`   Blob: ${blobValidation.isValid ? '✅' : '❌'} ${blobValidation.errors.length} errors, ${blobValidation.warnings.length} warnings`);

  // Step 6: Demonstrate user customization
  console.log('\n6️⃣ Demonstrating user customization...');
  
  // User changes connector type
  const customizedComponent = {
    ...sqlComponent,
    fabricTarget: {
      ...sqlComponent.fabricTarget!,
      connectorType: 'Web', // User changed from SQL to Web
      connectionDetails: {
        url: 'https://custom-api.example.com' // User provided custom URL
      },
      credentialType: 'OAuth2',
      privacyLevel: 'Organizational' as const
    }
  };

  console.log('   User customization applied:');
  console.log(`     • Connector type: SQL → Web`);
  console.log(`     • Connection details: Custom URL provided`);
  console.log(`     • Credential type: OAuth2`);
  console.log(`     • Privacy level: Organizational`);

  // Step 7: Validate customized configuration
  console.log('\n7️⃣ Validating customized configuration...');
  
  const customValidation = connectorService.validateConnectionDetails(
    customizedComponent.fabricTarget!.connectorType!, 
    customizedComponent.fabricTarget!.connectionDetails!
  );
  
  console.log(`   Custom config: ${customValidation.isValid ? '✅' : '❌'} ${customValidation.errors.length} errors, ${customValidation.warnings.length} warnings`);
  
  if (customValidation.errors.length > 0) {
    console.log('   Errors:', customValidation.errors);
  }

  // Step 8: Show similar connector type finding
  console.log('\n8️⃣ Demonstrating similar connector type finding...');
  
  const similarTypes = connectorService.findSimilarConnectorTypes('MySQLDatabase', 3);
  console.log(`   Similar to 'MySQLDatabase': ${similarTypes.join(', ')}`);
  
  const fallbackTypes = connectorService.findSimilarConnectorTypes('Unknown', 3);
  console.log(`   Similar to 'Unknown': ${fallbackTypes.join(', ')}`);

  console.log('\n✨ Enhanced mapping demonstration complete!');
  
  return {
    autoMapped: [
      { component: 'SQL Server', connectorType: sqlConnectorType, connectionDetails: sqlConnectionDetails },
      { component: 'REST Service', connectorType: restConnectorType, connectionDetails: restConnectionDetails },
      { component: 'Azure Blob', connectorType: blobConnectorType, connectionDetails: blobConnectionDetails }
    ],
    customized: customizedComponent,
    validations: { sqlValidation, restValidation, blobValidation, customValidation }
  };
}

/**
 * Example: App Context state updates
 */
export function demonstrateAppContextUpdates() {
  console.log('🔄 Demonstrating App Context State Updates\n');

  // Mock app state
  const mockAppState = {
    adfComponents: [
      testUtils.createMockADFComponent(sampleADFLinkedServices.sqlServer, { connectorType: 'SQL' }),
      testUtils.createMockADFComponent(sampleADFLinkedServices.restService, { connectorType: 'RestService' })
    ]
  };

  console.log('Initial state:', mockAppState.adfComponents.map(c => ({
    name: c.name,
    connectorType: c.fabricTarget?.connectorType
  })));

  // Simulate UPDATE_CONNECTOR_TYPE action
  const updateConnectorTypeAction = {
    type: 'UPDATE_CONNECTOR_TYPE' as const,
    payload: { index: 0, connectorType: 'Web' }
  };

  console.log('\nAction:', updateConnectorTypeAction);
  console.log('Expected result: SQL Server connector type changes from SQL to Web');

  // Simulate UPDATE_CONNECTION_DETAILS action
  const updateConnectionDetailsAction = {
    type: 'UPDATE_CONNECTION_DETAILS' as const,
    payload: { 
      index: 1, 
      connectionDetails: { 
        baseUrl: 'https://api.custom.com',
        authenticationType: 'OAuth2'
      }
    }
  };

  console.log('\nAction:', updateConnectionDetailsAction);
  console.log('Expected result: REST Service gets custom connection details');

  // Simulate UPDATE_CONNECTOR_CONFIGURATION action
  const updateConfigAction = {
    type: 'UPDATE_CONNECTOR_CONFIGURATION' as const,
    payload: {
      index: 0,
      updates: {
        connectorType: 'SharePoint',
        connectionDetails: { sharePointSiteUrl: 'https://company.sharepoint.com' },
        credentialType: 'WorkspaceIdentity',
        privacyLevel: 'Private' as const
      }
    }
  };

  console.log('\nAction:', updateConfigAction);
  console.log('Expected result: Complete configuration update for SQL Server component');

  return {
    mockState: mockAppState,
    actions: [updateConnectorTypeAction, updateConnectionDetailsAction, updateConfigAction]
  };
}

/**
 * Example: Deployment plan with user customizations
 */
export function demonstrateDeploymentPlan() {
  console.log('📋 Demonstrating Deployment Plan with User Customizations\n');

  const components = [
    testUtils.createMockADFComponent(sampleADFLinkedServices.sqlServer, {
      connectorType: 'SQL',
      connectionDetails: { server: 'custom-server.database.windows.net', database: 'CustomDB' },
      credentialType: 'ServicePrincipal',
      privacyLevel: 'Organizational'
    }),
    testUtils.createMockADFComponent(sampleADFLinkedServices.restService, {
      connectorType: 'RestService',
      connectionDetails: { baseUrl: 'https://custom-api.example.com' },
      credentialType: 'OAuth2',
      privacyLevel: 'Public'
    })
  ];

  const deploymentPlan = {
    workspaceId: 'test-workspace',
    timestamp: new Date().toISOString(),
    deploymentOrder: 'Gateways -> Connectors -> Variables -> Pipelines -> Schedules',
    components: {
      connectors: components.map(component => ({
        method: 'POST',
        endpoint: 'https://api.fabric.microsoft.com/v1/connections',
        payload: {
          displayName: component.fabricTarget?.name,
          connectorType: component.fabricTarget?.connectorType,
          connectionDetails: component.fabricTarget?.connectionDetails,
          privacyLevel: component.fabricTarget?.privacyLevel
        },
        originalName: component.name,
        targetName: component.fabricTarget?.name,
        userConfigured: Boolean(component.fabricTarget?.connectionDetails)
      }))
    }
  };

  console.log('Deployment Plan:');
  console.log(JSON.stringify(deploymentPlan, null, 2));

  console.log('\n✅ User customizations preserved in deployment plan');
  console.log('   • Custom connection details included');
  console.log('   • User-selected connector types used');
  console.log('   • Authentication and privacy preferences applied');

  return deploymentPlan;
}

// Export all demonstrations
export const enhancedMappingExamples = {
  demonstrateEnhancedMapping,
  demonstrateAppContextUpdates,
  demonstrateDeploymentPlan
};