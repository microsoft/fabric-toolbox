# MCP Prompts

This folder contains all MCP (Model Context Protocol) prompts for the Semantic Model MCP Server.

## Organization

- **`mcp_prompts.py`** - Main prompts file containing all prompt definitions
- **`__init__.py`** - Package initialization file that exports the `register_prompts` function

## Prompt Categories

The prompts are organized into logical categories:

### 🔍 **Basic Exploration**
- `ask_about_workspaces` - List Power BI workspaces
- `ask_about_datasets` - List datasets in a workspace
- `ask_about_lakehouses` - List Fabric lakehouses
- `ask_about_delta_tables` - List Delta tables in a lakehouse
- `explore_workspace` - Comprehensive workspace overview

### 📊 **Semantic Model Analysis**
- `analyze_model_structure` - Get TMSL definition and explain model structure
- `sample_dax_queries` - Get useful DAX query examples
- `compare_models` - Compare two semantic models
- `data_lineage_exploration` - Explore data lineage from lakehouse to models

### ⚡ **Model Optimization**
- `model_optimization_suggestions` - Analyze and suggest optimizations
- `model_performance_analysis` - Performance analysis and recommendations
- `create_calculated_measure` - Add new measures to models
- `troubleshoot_model_issues` - General model troubleshooting

### 🔒 **Security & Governance**
- `workspace_security_overview` - Security-focused workspace analysis

### 🏠 **Lakehouse & SQL Analytics**
- `validate_lakehouse_schema` - Validate table schemas for DirectLake
- `explore_lakehouse_data` - Query lakehouse data with SQL
- `lakehouse_sql_examples` - Get useful SQL query examples

### 🚀 **DirectLake Models**
- `create_directlake_model` - Create new DirectLake models
- `migrate_to_directlake` - Migrate existing models to DirectLake
- `compare_lakehouse_to_model` - Compare lakehouse schemas with models

### 🛠️ **Troubleshooting**
- `debug_connection_issues` - Authentication and connection troubleshooting
- `troubleshoot_tmsl_errors` - TMSL deployment error troubleshooting

### 🎯 **Best Practice Analyzer (BPA)**
- `analyze_model_for_bpa` - Run BPA analysis on a deployed model
- `analyze_tmsl_for_bpa` - Run BPA analysis on TMSL definition
- `get_bpa_critical_issues` - Find critical BPA violations
- `get_bpa_performance_issues` - Find performance-related BPA issues
- `get_bpa_dax_issues` - Find DAX expression BPA issues
- `generate_bpa_summary` - Get overview of BPA rules and categories
- `fix_bpa_violations` - Get guidance on fixing BPA violations

### 🖥️ **Power BI Desktop Integration**
- `detect_local_powerbi` - Detect running Power BI Desktop instances
- `test_local_powerbi_connection` - Test connection to local instances
- `analyze_local_model_bpa` - Run BPA on local Power BI Desktop models
- `local_development_workflow` - Get local development workflow guidance
- `troubleshoot_local_connection` - Troubleshoot local connection issues
- `local_testing_workflow` - Set up local testing workflows

## Usage

The prompts are automatically registered when the server starts. Users can access them through their MCP client to get guided assistance with common tasks.

## Adding New Prompts

To add new prompts:

1. Add the prompt function to `mcp_prompts.py` within the `register_prompts()` function
2. Use the `@mcp.prompt` decorator
3. Provide a clear docstring describing the prompt's purpose
4. Return a helpful prompt string that guides the user
5. Consider which category the prompt belongs to and group it accordingly

## Best Practices

- **Clear Documentation**: Each prompt should have a descriptive docstring
- **User-Friendly Language**: Prompt responses should be conversational and helpful
- **Logical Grouping**: Group related prompts together in the file
- **Specific Guidance**: Prompts should provide specific, actionable guidance
- **Consistent Formatting**: Follow the established pattern for prompt definitions
