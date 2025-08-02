# Semantic Model MCP Server

A Model Context Protocol (MCP) server for connecting to Microsoft Fabric and Power BI semantic models. This server provides tools to browse workspaces, list datasets, retrieve model definitions (TMDL/TMSL), and execute DAX queries against semantic models.

## Features

- **Browse Power BI Workspaces**: List all available workspaces in your tenant
- **Dataset Management**: List and explore datasets within workspaces
- **Model Definition Retrieval**: Get TMDL (Tabular Model Definition Language) and TMSL (Tabular Model Scripting Language) definitions
- **DAX Query Execution**: Run DAX queries against semantic models and get results
- **Workspace Navigation**: Get workspace IDs and navigate between different environments

## Prerequisites

- Python 3.8 or higher
- Access to Microsoft Fabric/Power BI Premium workspace
- Valid Microsoft authentication (Azure AD)
- .NET Framework dependencies for Analysis Services libraries

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox/tools/SemanticModelMCPServer
```

### 2. Create Virtual Environment

```bash
python -m venv .venv
```

### 3. Activate Virtual Environment

**Windows:**
```powershell
.\.venv\Scripts\activate
```

**macOS/Linux:**
```bash
source .venv/bin/activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure MCP Client

Add the server configuration to your MCP client settings (e.g., Claude Desktop `mcp.json`):

```json
{
    "servers": {
        "semantic_model_mcp_server": {
            "command": "./.venv/Scripts/python",
            "args": ["server.py"]
        }
    }
}
```

## Authentication

The server uses Azure Active Directory authentication. Ensure you have:

1. Valid credentials for your Microsoft tenant
2. Access to the Power BI/Fabric workspaces you want to query
3. Permissions to read semantic models and execute DAX queries

## Available Tools

### 1. List Power BI Workspaces
```
#semantic_model_mcp_server list workspaces
```

### 2. List Datasets in Workspace
```
#semantic_model_mcp_server list datasets in [workspace_name]
```

### 3. Get Workspace ID
```
#semantic_model_mcp_server get workspace id for [workspace_name]
```

### 4. Get Model Definition
```
#semantic_model_mcp_server get TMDL definition for [workspace_name] and [dataset_name]
```

### 5. Execute DAX Query
```
#semantic_model_mcp_server run DAX query against [dataset_name] in [workspace_name]
```

## Usage Examples

### Example 1: Explore Available Workspaces
```
#semantic_model_mcp_server list workspaces
```

### Example 2: Get Model Definition
```
#semantic_model_mcp_server get the TMDL definition for the DAX Performance Tuner Testing workspace and the Contoso 100M semantic model
```

### Example 3: Execute DAX Query
```
#semantic_model_mcp_server run a DAX query to count rows in the fact table
```

### Example 4: Analyze Data by Year
```
#semantic_model_mcp_server run a DAX query sum quantity by year
```

## Model Context Protocol (MCP)

This server implements the Model Context Protocol, allowing AI assistants and other tools to:

- **Discover** available semantic models and workspaces
- **Inspect** model structure and metadata
- **Query** data using DAX expressions
- **Retrieve** complete model definitions for analysis

## Technical Architecture

- **FastMCP Framework**: Built using the FastMCP Python framework
- **Analysis Services**: Leverages Microsoft Analysis Services .NET libraries
- **XMLA Endpoint**: Connects to Power BI via XMLA endpoints
- **Authentication**: Uses Microsoft Identity Client for secure authentication

## Supported Data Sources

- Power BI Premium workspaces
- Microsoft Fabric semantic models
- Analysis Services tabular models
- Any XMLA-compatible endpoint

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure you have valid Azure AD credentials and workspace access
2. **Connection Timeouts**: Check network connectivity and workspace availability
3. **Permission Denied**: Verify you have read permissions on the target workspace and semantic model

### Debug Mode

To run in debug mode for troubleshooting:

```bash
python debug.py
```

## Contributing

Contributions are welcome! Please see the main [fabric-toolbox repository](https://github.com/microsoft/fabric-toolbox) for contribution guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Related Tools

- [DAX Performance Testing](../DAXPerformanceTesting/) - Performance testing framework for DAX queries
- [Microsoft Fabric Management](../MicrosoftFabricMgmt/) - PowerShell module for Fabric administration
- [Fabric Load Test Tool](../FabricLoadTestTool/) - Load testing tools for Fabric workloads