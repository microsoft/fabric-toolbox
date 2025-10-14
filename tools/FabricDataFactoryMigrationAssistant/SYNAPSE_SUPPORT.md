# Microsoft Synapse Workspace ARM Template Support

## Overview

The ADF to Fabric Migration Assistant now supports migration from both **Azure Data Factory** and **Microsoft Synapse Workspace** ARM templates. This enhancement allows users to migrate pipelines, linked services, datasets, triggers, and integration runtimes from Synapse Analytics workspaces to Microsoft Fabric.

## Supported Synapse Resources

The application can now parse and migrate the following Synapse workspace resource types:

### Core Components
- **Pipelines** (`Microsoft.Synapse/workspaces/pipelines`)
- **Linked Services** (`Microsoft.Synapse/workspaces/linkedServices`)
- **Datasets** (`Microsoft.Synapse/workspaces/datasets`)
- **Triggers** (`Microsoft.Synapse/workspaces/triggers`)
- **Integration Runtimes** (`Microsoft.Synapse/workspaces/integrationRuntimes`)
- **Dataflows** (`Microsoft.Synapse/workspaces/dataflows`)

### ARM Template Parsing

The application now handles both naming conventions:

**Azure Data Factory:**
```json
{
  "name": "[concat(parameters('factoryName'), '/LinkedServiceName')]",
  "type": "Microsoft.DataFactory/factories/linkedServices"
}
```

**Synapse Workspace:**
```json
{
  "name": "[concat(parameters('workspaceName'), '/LinkedServiceName')]",
  "type": "Microsoft.Synapse/workspaces/linkedServices"
}
```

## Key Features

### 1. Automatic Resource Type Detection
The parser automatically detects whether the ARM template is from:
- Azure Data Factory (uses `factoryName` parameter)
- Synapse Workspace (uses `workspaceName` parameter)

### 2. Component Name Extraction
Correctly extracts component names from both formats:
- Input: `[concat(parameters('workspaceName'), '/AzurePostgreSql1')]`
- Output: `AzurePostgreSql1`

### 3. Metadata Preservation
Synapse resources include additional metadata:
- `synapseWorkspace: true` flag for identification
- Original ARM resource type and name preservation
- Source workspace context

## Migration Flow

1. **Upload**: Users can upload Synapse ARM templates exported from Azure Synapse Analytics
2. **Parse**: Application automatically detects and parses Synapse resource types
3. **Validate**: Compatibility validation for Synapse components to Fabric equivalents
4. **Map**: Component mapping from Synapse to Fabric resources
5. **Deploy**: Migration to Microsoft Fabric using existing deployment logic

## Compatibility Notes

### Supported Migrations
- ✅ Synapse Pipelines → Fabric Data Pipelines
- ✅ Synapse Linked Services → Fabric Connections
- ✅ Synapse Integration Runtimes → Fabric Gateways
- ✅ Synapse Triggers → Fabric Schedules
- ✅ Synapse Datasets → Embedded in Fabric Pipeline Activities

### Considerations
- **Synapse SQL Pools**: Not directly supported; custom activity handling required
- **Spark Pools**: May require Fabric Spark compute configuration
- **Synapse Notebooks**: Require separate migration to Fabric Notebooks
- **Synapse Dataflows**: Limited support; consider Fabric Dataflow Gen2

## Usage

### Upload Synapse ARM Template
1. Export ARM template from your Synapse workspace
2. Upload the JSON file to the migration assistant
3. The application will automatically detect Synapse resources

### Expected ARM Template Structure
```json
{
  "$schema": "...",
  "contentVersion": "...",
  "parameters": {
    "workspaceName": {
      "type": "string",
      "metadata": {
        "description": "Specifies the name of the Azure Synapse workspace."
      }
    }
  },
  "resources": [
    {
      "type": "Microsoft.Synapse/workspaces/linkedServices",
      "name": "[concat(parameters('workspaceName'), '/AzurePostgreSql1')]",
      "properties": {
        // LinkedService properties
      }
    }
  ]
}
```

## Technical Implementation

### Parser Updates
- Enhanced `parseARMExpression()` function in `src/lib/validation.ts`
- Added `parseSynapseResource()` method in `src/services/adfParserService.ts`
- Support for both `factoryName` and `workspaceName` parameter patterns

### Resource Mapping
- Synapse resource types mapped to standard component types
- Consistent validation rules applied
- Metadata preservation for source tracking

## Logging and Debugging

The application provides detailed logging for Synapse resource parsing:

```
Parsing Synapse Linked Service AzurePostgreSql1:
  originalName: [concat(parameters('workspaceName'), '/AzurePostgreSql1')]
  extractedName: AzurePostgreSql1
  type: AzurePostgreSql
  hasConnectVia: false
  connectViaRef: none
```

## Future Enhancements

### Planned Features
- **Synapse SQL Script** migration support
- **Spark Job Definition** conversion to Fabric Spark
- **Synapse ML Pipeline** integration
- **Enhanced dataflow** migration capabilities

### Integration Opportunities
- **Direct Synapse Workspace** connection (API-based)
- **Bulk workspace** migration support
- **Incremental migration** capabilities
- **Validation reporting** enhancements

## Troubleshooting

### Common Issues

**Issue**: LinkedService name not extracted correctly
**Solution**: Verify ARM template uses standard Synapse naming convention with `workspaceName` parameter

**Issue**: Resource type not recognized
**Solution**: Ensure resource type follows `Microsoft.Synapse/workspaces/{resourceType}` pattern

**Issue**: Migration validation failures
**Solution**: Review Synapse-specific components for Fabric compatibility

### Support Resources
- Review console logs for detailed parsing information
- Check validation warnings for compatibility issues
- Verify ARM template structure matches expected format

## Conclusion

The enhanced Synapse support significantly expands the migration capabilities of the ADF to Fabric Migration Assistant, enabling organizations to migrate from both Azure Data Factory and Azure Synapse Analytics to Microsoft Fabric with a unified tool.