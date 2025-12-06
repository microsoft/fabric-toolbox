# ADF to Fabric CLI - Quick Reference

## Installation

```bash
# Clone repo and navigate to tool
cd tools/FabricDataFactoryMigrationAssistant

# Run setup
./setup_cli.sh           # Linux/Mac
setup_cli.bat            # Windows

# Login to Azure
az login
```

## Commands

### Analyze
```bash
python cli_migrator.py analyze <template.json>
```
**Output:** Component compatibility, connector mapping, warnings

### Profile  
```bash
python cli_migrator.py profile <template.json> [--output file.json]
```
**Output:** Metrics, insights, recommendations, dependency graphs

### Migrate
```bash
python cli_migrator.py migrate <template.json> \
  --workspace-id <id> \
  [--dry-run] \
  [--connection-config config.json] \
  [--databricks-to-trident] \
  [--skip-connections] \
  [--skip-pipelines] \
  [--skip-global-params]
```
**Output:** Created connections, deployed pipelines, variable libraries

## Common Workflows

### Preview Migration
```bash
# See what would happen without making changes
python cli_migrator.py migrate template.json \
  --workspace-id abc-123 \
  --dry-run
```

### Staged Migration
```bash
# 1. Create connections first
python cli_migrator.py migrate template.json \
  --workspace-id abc-123 \
  --skip-pipelines

# 2. Deploy pipelines later
python cli_migrator.py migrate template.json \
  --workspace-id abc-123 \
  --skip-connections
```

### Full Migration
```bash
python cli_migrator.py migrate template.json \
  --workspace-id abc-123 \
  --connection-config connections.json
```

## Configuration Files

### Connection Config (`connections.json`)
```json
{
  "MyAzureSqlLS": {
    "connectionType": "AzureSqlDatabase",
    "connectionDetails": {
      "server": "myserver.database.windows.net",
      "database": "mydb"
    }
  }
}
```

## Exit Codes

- `0` - Success
- `1` - Error (see log file for details)

## Log Files

Location: `adf_migration_YYYYMMDD_HHMMSS.log`

View recent logs:
```bash
tail -f adf_migration_*.log
```

## Troubleshooting

### Authentication Issues
```bash
# Re-login
az login

# Verify token
az account get-access-token --resource https://api.fabric.microsoft.com
```

### Component Not Supported
Check the analyze output for compatibility status and suggestions.

### Connection Creation Failed
Verify connection details in config file and ensure you have workspace permissions.

## Help

```bash
# General help
python cli_migrator.py --help

# Command-specific help
python cli_migrator.py analyze --help
python cli_migrator.py profile --help
python cli_migrator.py migrate --help
```

## Examples

See `demo_cli.py` for interactive walkthrough:
```bash
python demo_cli.py
```

## Documentation

- **CLI_README.md** - Complete user guide
- **CLI_OVERVIEW.md** - Architecture and design
- **connection_config_example.json** - Sample configurations
