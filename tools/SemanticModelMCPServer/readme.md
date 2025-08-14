# Semantic Model MCP Server (v0.3.0)

A Model Context Protocol (MCP) server for connecting to Microsoft Fabric and Power BI semantic models. This server provides tools to browse workspaces, list datasets, retrieve model definitions (TMSL), execute DAX queries, and create or modify semantic models against semantic models.

**🆕 NEW: Best Practice Analyzer** - Now includes comprehensive analysis of semantic models against 71 industry best practice rules!

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
- **SQL Analytics Endpoint**: Query lakehouse tables using SQL for schema validation and data exploration
- **Microsoft Learn Integration**: Search and access official Microsoft documentation, tutorials, and best practices
- **TMSL Validation**: Enhanced TMSL structure validation with detailed error reporting
- **Workspace Navigation**: Get workspace IDs and navigate between different environments
- **🆕 Best Practice Analyzer (BPA)**: Comprehensive analysis of semantic models against industry best practices and Microsoft recommendations
- **🆕 Power BI Desktop Detection**: Automatically detect and connect to local Power BI Desktop instances for development and testing

## 🎯 Best Practice Analyzer (BPA)

The Semantic Model MCP Server now includes a powerful **Best Practice Analyzer** that evaluates your semantic models against 71 comprehensive rules covering industry best practices and Microsoft recommendations.

### What is the BPA?

The Best Practice Analyzer automatically scans your semantic models (TMSL definitions) and identifies potential issues across multiple categories:

- **🚀 Performance** - Optimization recommendations for better query performance
- **💎 DAX Expressions** - Best practices for DAX syntax and patterns  
- **🔧 Maintenance** - Rules for model maintainability and documentation
- **📝 Naming Conventions** - Consistent naming standards
- **🎨 Formatting** - Proper formatting and display properties
- **⚠️ Error Prevention** - Common pitfalls and anti-patterns to avoid

### BPA Severity Levels

| Level | Name | Description | Example Issues |
|-------|------|-------------|----------------|
| 🔴 **ERROR (3)** | Critical | Must fix immediately | DAX syntax errors, model structure issues |
| 🟡 **WARNING (2)** | Important | Should address soon | Performance issues, suboptimal patterns |
| 🟢 **INFO (1)** | Suggestion | Continuous improvement | Formatting, documentation enhancements |

### BPA Tools Available

#### 1. **Analyze Deployed Models**
```
#semantic_model_mcp_server analyze my [dataset_name] model for best practice violations
```

#### 2. **Analyze TMSL During Development**
```
#semantic_model_mcp_server run BPA analysis on this TMSL definition before deployment
```
*Note: Automatically handles JSON formatting issues including carriage returns, escaped quotes, and nested JSON strings.*

#### 3. **Generate Comprehensive Reports**
```
#semantic_model_mcp_server generate a detailed BPA report for [dataset_name]
```

#### 4. **Filter by Severity**
```
#semantic_model_mcp_server show me only critical BPA errors in my model
#semantic_model_mcp_server get all WARNING level BPA issues
```

#### 5. **Filter by Category**
```
#semantic_model_mcp_server show me all performance-related BPA violations
#semantic_model_mcp_server get DAX expression issues from BPA analysis
```

#### 6. **Get BPA Information**
```
#semantic_model_mcp_server what BPA rule categories are available?
#semantic_model_mcp_server show me a summary of loaded BPA rules
```

### Common BPA Violations and Fixes

#### 🚀 Performance Issues

**❌ Problem**: Using `double` data type for financial amounts
```json
"dataType": "double"
```
**✅ Solution**: Use `decimal` data type instead
```json
"dataType": "decimal"
```

**❌ Problem**: Foreign keys not hidden from end users
```json
"isHidden": false
```
**✅ Solution**: Hide foreign key columns
```json
"isHidden": true
```

#### 💎 DAX Expression Issues

**❌ Problem**: Using "/" operator for division
```dax
Average Price = [Total Sales] / [Total Quantity]
```
**✅ Solution**: Use DIVIDE() function to handle divide-by-zero
```dax
Average Price = DIVIDE([Total Sales], [Total Quantity])
```

**❌ Problem**: Unqualified column references
```dax
Total Sales = SUM(SalesAmount)
```
**✅ Solution**: Use fully qualified column references
```dax
Total Sales = SUM(Sales[SalesAmount])
```

#### 🎨 Formatting Issues

**❌ Problem**: Missing format strings on measures
```json
{
  "name": "Total Sales",
  "expression": "SUM(Sales[SalesAmount])"
}
```
**✅ Solution**: Add appropriate format string
```json
{
  "name": "Total Sales", 
  "expression": "SUM(Sales[SalesAmount])",
  "formatString": "#,0"
}
```

### BPA Integration Workflow

#### 🔄 **Development Workflow with BPA**
```
1. Generate TMSL template
   → #semantic_model_mcp_server generate DirectLake TMSL template

2. Analyze before deployment  
   → #semantic_model_mcp_server run BPA analysis on TMSL

3. Fix violations
   → Address critical errors and warnings

4. Deploy model
   → #semantic_model_mcp_server update model with validated TMSL

5. Final verification
   → #semantic_model_mcp_server analyze deployed model with BPA
```

#### 🚨 **Quality Gates**
```
1. Check for critical errors
   → #semantic_model_mcp_server get ERROR level BPA violations

2. Review performance issues
   → #semantic_model_mcp_server show performance-related BPA issues

3. Ensure documentation standards
   → #semantic_model_mcp_server check maintenance category violations
```

### BPA Usage Examples

#### **Example 1: Complete Model Health Check**
```
You: "Analyze my Sales Model for best practice violations"
AI: [Runs BPA analysis and shows violations by category and severity]

You: "Show me only the critical errors"
AI: [Filters to ERROR level violations with specific recommendations]

You: "Generate a detailed BPA report"  
AI: [Creates comprehensive report with all findings]
```

#### **Example 2: Performance Optimization**
```
You: "My model is slow - what performance issues does BPA find?"
AI: [Analyzes model and highlights performance-related violations]

You: "Show me the specific DAX expressions that need fixing"
AI: [Filters to DAX expression category with examples]

You: "Research best practices for the issues you found"
AI: [Uses Microsoft Learn integration to provide authoritative guidance]
```

#### **Example 3: Development Quality Assurance**
```
You: "I'm about to deploy this TMSL - run BPA analysis first"
AI: [Analyzes TMSL definition before deployment]

You: "Fix the critical issues and update the TMSL"
AI: [Applies BPA recommendations and validates changes]

You: "Now deploy the corrected model"
AI: [Deploys with confidence knowing BPA requirements are met]
```

### BPA Rule Categories in Detail

#### 🚀 **Performance (24 rules)**
- Avoid floating point data types
- Hide foreign keys and optimize column properties  
- Partition large tables appropriately
- Minimize calculated columns and use star schema
- Optimize relationships and avoid excessive bi-directional connections
- Reduce Power Query transformations

#### 💎 **DAX Expressions (11 rules)**  
- Use fully qualified column references
- Use unqualified measure references
- Prefer DIVIDE() over "/" operator
- Avoid IFERROR() function for performance
- Use TREATAS instead of INTERSECT
- Proper time intelligence patterns

#### 🔧 **Maintenance (9 rules)**
- Ensure all tables have relationships
- Add descriptions to visible objects
- Remove unused perspectives and calculation groups
- Clean up orphaned objects

#### 📝 **Naming Conventions (3 rules)**
- No special characters in object names
- Trim whitespace from names
- Consistent naming patterns

#### 🎨 **Formatting (17 rules)**
- Provide format strings for measures and date columns
- Mark primary keys appropriately
- Set proper data categories
- Hide fact table columns used in measures
- Use consistent capitalization

#### ⚠️ **Error Prevention (7 rules)**
- Avoid common anti-patterns
- Prevent deployment-breaking configurations
- Catch syntax and structure issues early

### Advanced BPA Features

#### **Automated Quality Pipelines**
Integrate BPA into your CI/CD workflows:
```
# Quality gate: No critical errors
if (bpa_errors > 0) block_deployment()

# Performance threshold
if (performance_violations > threshold) require_review()

# Documentation standards  
if (missing_descriptions > limit) require_documentation()
```

#### **Continuous Model Health Monitoring**
```
# Weekly health checks
#semantic_model_mcp_server generate weekly BPA report for all models

# Track improvements over time
#semantic_model_mcp_server compare current BPA results with last month

# Identify organization-wide patterns
#semantic_model_mcp_server analyze BPA trends across workspace
```

#### **Integration with Microsoft Learn**
The BPA seamlessly integrates with Microsoft Learn research:
```
You: "I have performance violations - research the best practices"
AI: [Uses BPA results + Microsoft Learn to provide authoritative guidance]

You: "Find official documentation for the DAX issues BPA found"
AI: [Searches Microsoft Learn for specific DAX patterns and recommendations]
```

### Getting Started with BPA

1. **🔍 Start with Analysis**: `"Analyze my model for best practice violations"`
2. **🚨 Focus on Critical**: `"Show me only ERROR level BPA issues"`  
3. **🎯 Target Categories**: `"What performance improvements does BPA suggest?"`
4. **📚 Research Solutions**: `"Find Microsoft documentation for these BPA violations"`
5. **✅ Verify Fixes**: `"Re-analyze the model after applying BPA recommendations"`

The Best Practice Analyzer ensures your semantic models follow Microsoft's recommended patterns and industry standards, resulting in better performance, maintainability, and user experience! 🎉

## Prerequisites

- Python 3.8 or higher
- Access to Microsoft Fabric/Power BI Premium workspace
- Valid Microsoft authentication (Azure AD)
- .NET Framework dependencies for Analysis Services libraries

- If you have access to Premium models in VS Code Copilot Chat, I recommend using Claude Sonnet 4 in ASK mode

## 🖥️ Power BI Desktop Integration

The Semantic Model MCP Server now includes powerful **Power BI Desktop Detection** capabilities that enable seamless integration with local Power BI Desktop instances for development and testing workflows.

### What is Power BI Desktop Detection?

This feature automatically discovers running Power BI Desktop processes and their associated Analysis Services instances, enabling you to:

- **Connect to Local Models**: Access semantic models currently open in Power BI Desktop
- **Development Testing**: Test changes against local instances before publishing
- **Local BPA Analysis**: Run Best Practice Analyzer against models in development
- **Debugging**: Analyze and troubleshoot models during development

### Key Capabilities

#### 🔍 **Automatic Discovery**
- Detects all running Power BI Desktop processes
- Identifies Analysis Services port numbers for each instance
- Locates .pbix files currently open
- Generates ready-to-use connection strings

#### 🔌 **Connection Testing**
- Validates connectivity to local Analysis Services instances
- Tests authentication and access
- Provides detailed connection diagnostics

#### 🎯 **Development Integration**
- Use BPA tools with local models
- Execute DAX queries against local instances
- Analyze TMSL definitions from local Power BI Desktop models

### Available Tools

#### 1. **Detect Running Instances**
```
#semantic_model_mcp_server detect local Power BI Desktop instances
```

#### 2. **Test Local Connections**
```
#semantic_model_mcp_server test connection to Power BI Desktop on port 55001
```

#### 3. **Local BPA Analysis**
```
#semantic_model_mcp_server analyze my local Power BI Desktop model for best practices
```

### How It Works

Power BI Desktop runs a local Analysis Services instance for each open .pbix file:

- **Process Detection**: Scans for `PBIDesktop.exe` and `msmdsrv.exe` processes
- **Port Discovery**: Identifies dynamic ports (typically > 50000)
- **Connection Strings**: Formats as `Data Source=localhost:{port}`
- **File Association**: Links processes to their corresponding .pbix files

### Use Cases

#### 🚀 **Development Workflow**
1. Open your .pbix file in Power BI Desktop
2. Use the MCP server to detect the local instance
3. Run BPA analysis during development
4. Test DAX queries before publishing
5. Validate model changes locally

#### 🧪 **Testing & Validation**
- Verify model performance with local data
- Test new calculations and measures
- Validate relationships and hierarchies
- Check formatting and display properties

#### 🔧 **Debugging & Troubleshooting**
- Analyze models that won't publish
- Debug DAX expression issues
- Investigate performance problems
- Validate TMSL structure before deployment

### Example Workflow

```bash
# 1. Detect local Power BI Desktop instances
instances = detect_local_powerbi_desktop()

# 2. Get connection information
# Result: localhost:55001 (example port)

# 3. Test the connection
test_result = test_local_powerbi_connection(55001)

# 4. Run BPA analysis on local model
# Use the connection string with existing BPA tools

# 5. Execute DAX queries for testing
# Use local connection for development queries
```

## Installation

### 1. Clone the Repository from Prod

```bash
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox/tools/SemanticModelMCPServer
setup.bat

or for the dev version

git clone --branch Semantic-Model-MCP-Server https://github.com/philseamark/fabric-toolbox.git
cd fabric-toolbox/tools/SemanticModelMCPServer
setup.bat

```

### 2. Start the MCP Server

Open the mcp.json using VS Code from the .vscode folder and click the start button (look between lines 2 and 3)

[![Start your MCP Server](./images/start_mcp_server.png)]

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
#semantic_model_mcp_server get TMSL definition for [workspace_name] and [dataset_name]
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

### 10. Research Microsoft Learn Documentation
```
#semantic_model_mcp_server search Microsoft Learn for DirectLake best practices
```

### 11. Query Lakehouse with SQL
```
#semantic_model_mcp_server run SQL query against lakehouse to validate table schemas
```

### 12. Generate DirectLake TMSL Template
```
#semantic_model_mcp_server generate DirectLake TMSL template for tables in [lakehouse_name]
```

### 13. 🆕 Best Practice Analyzer Tools
```
#semantic_model_mcp_server analyze my model for best practice violations
#semantic_model_mcp_server generate BPA report for [dataset_name]
#semantic_model_mcp_server show me critical BPA errors
#semantic_model_mcp_server get performance-related BPA issues
```

## Usage Examples

### Example 1: Explore Available Workspaces
```
#semantic_model_mcp_server list workspaces
```

### Example 2: Get Model Definition
```
#semantic_model_mcp_server get the TMSL definition for the DAX Performance Tuner Testing workspace and the Contoso 100M semantic model
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
#semantic_model_mcp_server get the TMSL definition for [Workspace Name] and [Dataset Name]
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

**"Validate table schemas before creating a DirectLake model"**
```
#semantic_model_mcp_server query the lakehouse SQL endpoint to check column names and data types for the sales table
```

### 📚 **Microsoft Learn Research & Documentation**

**"Find the latest DAX best practices"**
```
#semantic_model_mcp_server search Microsoft Learn for DAX performance optimization best practices
```

**"Research DirectLake implementation guidance"**
```
#semantic_model_mcp_server find Microsoft Learn articles about DirectLake requirements and limitations
```

**"Get TMSL syntax documentation"**
```
#semantic_model_mcp_server search Microsoft Learn for TMSL tabular object reference and examples
```

**"Find Power BI feature updates"**
```
#semantic_model_mcp_server search Microsoft Learn for the latest Power BI features and capabilities
```

**"Explore Microsoft Fabric learning paths"**
```
#semantic_model_mcp_server get Microsoft Learn learning paths for Microsoft Fabric data engineering
```

**"Research data modeling patterns"**
```
#semantic_model_mcp_server search Microsoft Learn for star schema design best practices and patterns
```

**"Find troubleshooting guides"**
```
#semantic_model_mcp_server search Microsoft Learn for Power BI performance troubleshooting guides
```

### 🛠️ **Model Optimization**

**"What measures are defined in my model?"**
```
#semantic_model_mcp_server get the TMSL definition and show me all the measures
```

**"Are there any relationships I should be aware of?"**
```
#semantic_model_mcp_server show me the relationships in my semantic model
```

**"What tables are hidden in my model?"**
```
#semantic_model_mcp_server analyze the TMSL definition and list any hidden tables or columns
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
6. **🆕 Ensure Quality**: `"Analyze my model for best practice violations"`

### 🎯 **Best Practice Analyzer Prompts**

**"Is my model following best practices?"**
```
#semantic_model_mcp_server analyze my [dataset name] model for best practice violations
```

**"What are the most critical issues in my model?"**
```
#semantic_model_mcp_server show me only ERROR level BPA violations in my model
```

**"How can I improve my model's performance?"**
```
#semantic_model_mcp_server get all performance-related BPA recommendations for my model
```

**"Check my DAX expressions for best practices"**
```
#semantic_model_mcp_server analyze DAX expressions in my model using BPA rules
```

**"Generate a quality report for my model"**
```
#semantic_model_mcp_server create a comprehensive BPA report for [dataset name]
```

**"What BPA categories should I focus on?"**
```
#semantic_model_mcp_server show me BPA violation counts by category and severity
```

**"Validate my TMSL before deployment"**
```
#semantic_model_mcp_server run BPA analysis on this TMSL definition to check for issues
```

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
- **Research** official Microsoft documentation and best practices via Microsoft Learn integration
- **Validate** table schemas using SQL Analytics Endpoint queries
- **Generate** DirectLake TMSL templates with proper structure validation
- **🆕 Analyze** semantic models for best practice compliance using comprehensive BPA rules
- **🆕 Report** on model quality with detailed violations and recommendations
- **🆕 Optimize** model performance through automated best practice analysis

## Technical Architecture

- **FastMCP Framework**: Built using the FastMCP Python framework
- **Analysis Services**: Leverages Microsoft Analysis Services .NET libraries
- **XMLA Endpoint**: Connects to Power BI via XMLA endpoints
- **Microsoft Learn API**: Integrates with Microsoft Learn for accessing official documentation and tutorials
- **SQL Analytics Endpoint**: Connects to Fabric lakehouse SQL endpoints for schema validation and data exploration
- **Authentication**: Uses Microsoft Identity Client for secure authentication
- **TMSL Validation**: Enhanced validation engine for Tabular Model Scripting Language

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