# Semantic Model MCP Server

A Model Context Protocol (MCP) server for connecting to Microsoft Fabric and Power BI semantic models. This server provides tools to browse workspaces, list datasets, retrieve model definitions (TMSL), execute DAX queries, and create or modify semantic models against semantic models.

A tool designed for Semantic model authors to chat with your Semantic Model in VS Code Co-pilot using your own LLM!!!

Use your local compute rather than your Premium capacity.

This tool is most suited to be run in VS Code to be used as a *chat with your semantic model* feature using your own choice of LLM Server.

Co-pilot in VS Code has far fewer limitations than some MCP Clients and can also allow you to tweak/improve this code for yourself.

## Features

- **Browse Power BI Workspaces**: List all available workspaces in your tenant
- **Dataset Management**: List and explore datasets within workspaces
- **Model Definition Retrieval**: Get TMSL (Tabular Model Scripting Language) definitions
- **DAX Query Execution**: Run DAX queries against semantic models and get results
- **Model Creation & Editing**: Create new semantic models and update existing models using TMSL
- **Fabric Lakehouse Integration**: List lakehouses, Delta tables, and get SQL connection strings
- **DirectLake Model Support**: Create and manage DirectLake models connected to Fabric lakehouses
- **Workspace Navigation**: Get workspace IDs and navigate between different environments

## Prerequisites

- Python 3.8 or higher
- Access to Microsoft Fabric/Power BI Premium workspace
- Valid Microsoft authentication (Azure AD)
- .NET Framework dependencies for Analysis Services libraries

## Installation

### 1. Clone the Repository from Prod

```bash
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox/tools/SemanticModelMCPServer

or for the dev version

git clone --branch Semantic-Model-MCP-Server https://github.com/philseamark/fabric-toolbox.git
cd fabric-toolbox/tools/SemanticModelMCPServer
setup.bat

```
###
Run Setup.bat or run remaining steps


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

Check the server configuration to your MCP client settings (e.g., Claude Desktop `mcp.json`):

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

### 6. Open folder in VS Code

Check the server configuration to your MCP client settings (e.g., Claude Desktop `mcp.json`):

```bash
code .
```
### 7. Start the MCP Server

Open the mcp.json using VS Code from the .vscode folder and click the start button (look between lines 2 and 3)


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

### 6. Update Model using TMSL
```
#semantic_model_mcp_server update model [dataset_name] in [workspace_name] using TMSL definition
```

### 7. List Fabric Lakehouses
```
#semantic_model_mcp_server list lakehouses in [workspace_name]
```

### 8. List Delta Tables
```
#semantic_model_mcp_server list delta tables in lakehouse [lakehouse_name]
```

### 9. Get Lakehouse SQL Connection
```
#semantic_model_mcp_server get SQL connection string for lakehouse [lakehouse_name]
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

### Example 5: Create a DirectLake Model
```
#semantic_model_mcp_server create a DirectLake model using tables from the GeneratedData lakehouse
```

### Example 6: Update Model Schema
```
#semantic_model_mcp_server add a new calculated column to the sales table in my model
```

## Getting Started: Chat Prompt Examples

Once you have the MCP server running in VS Code, you can start chatting with your semantic models using these example prompts. Simply type these into your VS Code chat and the AI will use the MCP server to interact with your data:

### 🔍 **Discovery & Exploration**

**"What workspaces do I have access to?"**
```
#semantic_model_mcp_server list all my Power BI workspaces
```

**"Show me all the datasets in my main workspace"**
```
#semantic_model_mcp_server list datasets in [Your Workspace Name]
```

**"What's the structure of my sales model?"**
```
#semantic_model_mcp_server get the TMDL definition for [Workspace Name] and [Dataset Name]
```

### 📊 **Basic Data Analysis**

**"How many rows are in my fact table?"**
```
#semantic_model_mcp_server run a DAX query to count rows in the fact table
```

**"What are my top product categories by sales?"**
```
#semantic_model_mcp_server run a DAX query to show sales amount by product category, ordered by highest sales
```

**"Show me sales trends by year"**
```
#semantic_model_mcp_server run a DAX query to sum sales amount by year
```

### 🎯 **Specific Business Questions**

**"What was our best performing month last year?"**
```
#semantic_model_mcp_server run a DAX query to find the month with highest sales in 2023
```

**"Which customers bought the most products?"**
```
#semantic_model_mcp_server run a DAX query to show top 10 customers by total quantity purchased
```

**"What's our profit margin by product category?"**
```
#semantic_model_mcp_server run a DAX query to calculate profit margin percentage by product category
```

### 🔬 **Advanced Analytics**

**"Show me year-over-year growth for each product category"**
```
#semantic_model_mcp_server create a DAX query that calculates YoY growth percentage for sales by category
```

**"What's the average order value by customer segment?"**
```
#semantic_model_mcp_server run a DAX query to calculate average order value grouped by customer segment
```

**"Find products that haven't sold in the last 6 months"**
```
#semantic_model_mcp_server write a DAX query to identify products with no sales in the last 180 days
```

### 🛠️ **Model Creation & Management**

**"Create a new DirectLake model from my lakehouse tables"**
```
#semantic_model_mcp_server create a DirectLake model using the business tables from my GeneratedData lakehouse
```

**"Add a new measure to my existing model"**
```
#semantic_model_mcp_server add a Total Profit measure to my sales model that calculates SalesAmount minus TotalCost
```

**"Update my model to include a new table"**
```
#semantic_model_mcp_server modify my semantic model to include the new customer demographics table
```

**"Create relationships between tables in my model"**
```
#semantic_model_mcp_server add a relationship between the sales table and the new product category table
```

### 🏗️ **Fabric Lakehouse Integration**

**"What lakehouses are available in my workspace?"**
```
#semantic_model_mcp_server list all lakehouses in my workspace
```

**"Show me the Delta tables in my lakehouse"**
```
#semantic_model_mcp_server list all Delta tables in the GeneratedData lakehouse
```

**"Get the SQL connection string for my lakehouse"**
```
#semantic_model_mcp_server get the SQL endpoint connection for my lakehouse
```

### 🛠️ **Model Optimization**

**"What measures are defined in my model?"**
```
#semantic_model_mcp_server get the TMDL definition and show me all the measures
```

**"Are there any relationships I should be aware of?"**
```
#semantic_model_mcp_server show me the relationships in my semantic model
```

**"What tables are hidden in my model?"**
```
#semantic_model_mcp_server analyze the TMDL definition and list any hidden tables or columns
```

### 💡 **Tips for Better Prompts**

1. **Be Specific**: Include workspace names and dataset names when you know them
2. **Use Natural Language**: The AI can translate your business questions into DAX queries
3. **Ask for Explanations**: Add "and explain the results" to understand what the data means
4. **Request Visualizations**: Ask "create a summary table" or "format the results nicely"
5. **Build on Previous Queries**: Reference earlier results to dive deeper into insights

### 🚀 **Getting Started Workflow**

1. **Start with Discovery**: `"What workspaces do I have access to?"`
2. **Explore Your Data**: `"Show me the structure of my [dataset name] model"`
3. **Ask Simple Questions**: `"How many rows of data do I have?"`
4. **Progress to Business Questions**: `"What are my top selling products?"`
5. **Dive into Analysis**: `"Show me trends and patterns in my sales data"`

### 📝 **Example Full Conversation**

```
You: "What workspaces do I have access to?"
AI: [Lists your workspaces using the MCP server]

You: "Show me the datasets in my 'Sales Analytics' workspace"
AI: [Lists datasets in that workspace]

You: "Get the structure of my 'Sales Model' dataset"
AI: [Retrieves TMDL definition showing tables, measures, relationships]

You: "Create a DirectLake model using the tables from my GeneratedData lakehouse"
AI: [Uses MCP server to list lakehouse tables and creates TMSL definition for DirectLake model]

You: "Now add a calculated measure for profit margin to this model"
AI: [Modifies the TMSL to include new measure and updates the model]

You: "Show me the relationships in this new model"
AI: [Retrieves updated TMSL definition and displays the relationships]

You: "That's interesting - can you show me the trend for the 'Electronics' category over time?"
AI: [Creates and runs a more specific DAX query for Electronics trends]
```

Remember: The AI assistant will use the MCP server tools automatically when you mention data analysis, DAX queries, or semantic model exploration in your prompts!

## Model Context Protocol (MCP)

This server implements the Model Context Protocol, allowing AI assistants and other tools to:

- **Discover** available semantic models and workspaces
- **Inspect** model structure and metadata
- **Query** data using DAX expressions
- **Create** new semantic models from Fabric lakehouses or other data sources
- **Modify** existing models by updating TMSL definitions
- **Manage** DirectLake models connected to Fabric lakehouses
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
- Fabric Lakehouses and Delta Tables
- DirectLake storage mode
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