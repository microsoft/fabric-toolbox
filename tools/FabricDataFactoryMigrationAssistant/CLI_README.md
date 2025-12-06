# ADF to Fabric Migration CLI Tool

A standalone command-line application for migrating Azure Data Factory (ADF) pipelines to Microsoft Fabric Data Pipelines.

## Features

- **Analyze**: Parse ARM templates and check component compatibility
- **Profile**: Generate comprehensive migration analysis reports
- **Migrate**: End-to-end automated migration with Fabric API integration

## Installation

### Prerequisites

- Python 3.8 or higher
- Azure CLI (for authentication)
- Access to Microsoft Fabric workspace

### Setup

```bash
# Navigate to the tool directory
cd tools/FabricDataFactoryMigrationAssistant

# Install the adf_fabric_migrator library
pip install -e .

# Install additional dependencies for CLI
pip install requests

# Login to Azure (for Fabric API access)
az login
```

## Usage

### 1. Analyze ARM Template

Check compatibility and see what components will be migrated:

```bash
python cli_migrator.py analyze path/to/adf_template.json
```

**Output:**
- Component summary (supported/partially supported/unsupported)
- Detailed component list with warnings and suggestions
- Connector mapping analysis with confidence levels

### 2. Generate Migration Profile

Create a comprehensive migration report:

```bash
# Display profile in console
python cli_migrator.py profile path/to/adf_template.json

# Save profile to JSON file
python cli_migrator.py profile path/to/adf_template.json --output migration_profile.json
```

**Profile includes:**
- Metrics (pipelines, activities, datasets, etc.)
- Dependency graphs
- Migration insights and recommendations
- Component breakdown

### 3. Perform Migration

Migrate ADF components to Fabric workspace:

```bash
# Dry run (shows what would be done without making changes)
python cli_migrator.py migrate path/to/adf_template.json \
  --workspace-id <your-workspace-id> \
  --dry-run

# Full migration
python cli_migrator.py migrate path/to/adf_template.json \
  --workspace-id <your-workspace-id>

# Migration with custom connection config
python cli_migrator.py migrate path/to/adf_template.json \
  --workspace-id <your-workspace-id> \
  --connection-config connections.json

# Migration with Databricks to Trident Notebook transformation
python cli_migrator.py migrate path/to/adf_template.json \
  --workspace-id <your-workspace-id> \
  --databricks-to-trident
```

**Migration steps:**
1. Parse ARM template
2. Create Fabric connections (from LinkedServices)
3. Create Variable Library (from Global Parameters)
4. Transform and deploy pipelines

**Options:**
- `--skip-connections`: Skip connection creation
- `--skip-pipelines`: Skip pipeline deployment
- `--skip-global-params`: Skip global parameter migration
- `--connection-config <path>`: Path to connection configuration JSON
- `--databricks-to-trident`: Transform DatabricksNotebook to TridentNotebook
- `--dry-run`: Preview migration without making changes

## Connection Configuration

To provide connection-specific settings, create a JSON file:

```json
{
  "MyAzureSqlLS": {
    "connectionType": "AzureSqlDatabase",
    "connectionDetails": {
      "server": "myserver.database.windows.net",
      "database": "mydb"
    }
  },
  "MyBlobStorageLS": {
    "connectionType": "AzureBlobStorage",
    "connectionDetails": {
      "accountName": "mystorageaccount"
    }
  }
}
```

Then use it in migration:

```bash
python cli_migrator.py migrate template.json \
  --workspace-id abc123 \
  --connection-config connections.json
```

## Authentication

The CLI tool uses Azure CLI for authentication. Ensure you're logged in:

```bash
az login
```

The tool automatically retrieves the access token for Fabric API calls.

## Examples

### Example 1: Quick Analysis

```bash
# Analyze template and see what's supported
python cli_migrator.py analyze my_datafactory.json
```

### Example 2: Migration with Preview

```bash
# First, do a dry run to see what would happen
python cli_migrator.py migrate my_datafactory.json \
  --workspace-id abc-123-def \
  --dry-run

# If everything looks good, run the actual migration
python cli_migrator.py migrate my_datafactory.json \
  --workspace-id abc-123-def
```

### Example 3: Selective Migration

```bash
# Only create connections (skip pipelines)
python cli_migrator.py migrate my_datafactory.json \
  --workspace-id abc-123-def \
  --skip-pipelines

# Later, deploy pipelines with existing connections
python cli_migrator.py migrate my_datafactory.json \
  --workspace-id abc-123-def \
  --skip-connections
```

### Example 4: Databricks Migration

```bash
# Migrate with Databricks to Trident Notebook transformation
python cli_migrator.py migrate my_datafactory.json \
  --workspace-id abc-123-def \
  --databricks-to-trident
```

## Output and Logging

The CLI tool provides:
- **Console output**: Human-readable progress and results
- **Log file**: Detailed logs saved as `adf_migration_YYYYMMDD_HHMMSS.log`

## Supported Components

### Pipelines
- ✅ All ADF pipeline structures
- ✅ 20+ activity types (Copy, Lookup, GetMetadata, etc.)
- ✅ Parameters and variables
- ✅ Control flow (ForEach, IfCondition, etc.)

### Datasets
- ✅ Embedded as source/sink within activities
- ⚠️ Some dataset types may need manual configuration

### Linked Services
- ✅ 50+ connector types
- ✅ Automatic mapping to Fabric connections
- ⚠️ Credentials need to be configured in Fabric

### Global Parameters
- ✅ Migrated to Fabric Variable Libraries
- ✅ Expression rewriting in pipelines

### Triggers
- ✅ Schedule triggers
- ⚠️ Other trigger types may need manual setup

## Limitations

- **Managed Identity**: Converted to Workspace Identity (requires manual permission setup)
- **Mapping Data Flows**: Not supported (use Fabric Dataflow Gen2)
- **Custom Activities**: May require additional configuration
- **Connection Credentials**: Must be configured manually in Fabric after creation

## Troubleshooting

### Authentication Errors

```bash
# Ensure you're logged in
az login

# Verify access token
az account get-access-token --resource https://api.fabric.microsoft.com
```

### Missing Dependencies

```bash
# Install all dependencies
pip install -e .
pip install requests
```

### API Errors

Check the log file for detailed error messages:
```bash
cat adf_migration_*.log
```

## Advanced Usage

### Programmatic Usage

You can also use the library programmatically:

```python
from adf_fabric_migrator import ADFParser, PipelineTransformer

# Parse ARM template
parser = ADFParser()
components = parser.parse_arm_template_file("template.json")

# Transform pipeline
transformer = PipelineTransformer()
for component in components:
    if component.type.value == "pipeline":
        fabric_def = transformer.transform_pipeline_definition(
            component.definition,
            component.name
        )
```

See `example_usage.py` for more examples.

## Contributing

This tool is part of the [Fabric Toolbox](https://github.com/microsoft/fabric-toolbox) project. Contributions welcome!

## License

MIT License - see LICENSE file for details.
