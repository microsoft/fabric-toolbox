from fastmcp import FastMCP
import logging
import clr
import os
import json
import sys
from typing import List, Optional
from core.auth import get_access_token
from core.azure_token_manager import get_cached_azure_token, clear_token_cache
from tools.fabric_metadata import list_workspaces, list_datasets, get_workspace_id, list_notebooks, list_delta_tables, list_lakehouses, list_lakehouse_files, get_lakehouse_sql_connection_string as fabric_get_lakehouse_sql_connection_string
from tools.microsoft_learn import search_microsoft_learn, get_microsoft_learn_paths, get_microsoft_learn_modules, get_microsoft_learn_content
import urllib.parse
from src.helper import count_nodes_with_name
from src.tmsl_validator import validate_tmsl_structure
import time
from datetime import datetime, timedelta
from prompts import register_prompts

# Try to import pyodbc - it's needed for SQL Analytics Endpoint queries
try:
    import pyodbc
except ImportError:
    pyodbc = None

mcp = FastMCP(
    name="Model Browser", 
    instructions="""
    ## Available Tools:
    - List Power BI Workspaces
    - List Power BI Datasets
    - List Power BI Notebooks
    - List Fabric Lakehouses
    - List Fabric Delta Tables
    - List Fabric Data Pipelines
    - Get Power BI Workspace ID
    - Get Model Definition
    - Execute DAX Queries
    - Update Model using TMSL (Enhanced with Validation)
    - Generate DirectLake TMSL Template (NEW)
    - Validate TMSL Structure (Built into update tool)
    - Search Microsoft Learn Content (NEW)
    - Get Microsoft Learn Learning Paths (NEW)
    - Get Microsoft Learn Modules (NEW)
    - Get Microsoft Learn Content by URL (NEW)

    ## Microsoft Learn Research Capabilities (NEW):
    You now have access to Microsoft Learn documentation and research articles via the new MS Learn functions.
    Use these tools to research and provide authoritative information about:
    - **DAX (Data Analysis Expressions)** - Functions, syntax, best practices, and examples
    - **TMSL (Tabular Model Scripting Language)** - Model definitions, schema updates, and scripting
      **IMPORTANT**: Always refer to https://learn.microsoft.com/en-us/analysis-services/tmsl/tmsl-reference-tabular-objects for authoritative TMSL syntax and schema validation
    - **DirectLake** - Implementation guides, best practices, and troubleshooting
    - **Power BI** - Features, configuration, and advanced techniques
    - **Microsoft Fabric** - Data engineering, analytics, and integration patterns
    - **Analysis Services** - Tabular models, performance optimization, and administration
    - **Data modeling** - Star schema design, relationships, and performance tuning
    - **Write T-SQL** - Writing Transact-SQL statements
    
    When users ask questions about these topics, ALWAYS search Microsoft Learn first to provide the most 
    current and authoritative Microsoft documentation before giving general advice.

    ## Usage:
    - You can ask questions about Power BI workspaces, datasets, notebooks, and models.
    - You can explore Fabric lakehouses and Delta Tables.
    - You can search Microsoft Learn documentation and training content for authoritative answers.
    - Use the tools to retrieve information about your Power BI and Fabric environment.
    - The tools will return JSON formatted data for easy parsing.
    
    ## Example Queries:
    - "Can you get a list of workspaces?"
    - "Can you list notebooks in workspace X?"
    - "Show me the lakehouses in this workspace"
    - "Search Microsoft Learn for DirectLake best practices"
    - "Find DAX documentation for time intelligence functions"
    - "Research TMSL syntax for creating DirectLake models"
    - "Look up Power BI performance optimization techniques"
    - "List all Delta Tables in lakehouse Y"
    - "Show me the data pipelines in this workspace"

    ## Fabric Lakehouse Support:
    - Use `list_fabric_lakehouses` to see all lakehouses in a workspace
    - Use `list_fabric_delta_tables` to see Delta Tables in a specific lakehouse
    - If you don't specify a lakehouse ID, the tool will use the first lakehouse found
    - Delta Tables are the primary table format used in Fabric lakehouses

    ## Fabric Data Pipeline Support:
    - Use `list_fabric_pipelines` to see all Data Pipelines in a workspace
    - Data Pipelines are ETL/ELT workflows that can orchestrate data movement and transformation
    - The tool returns pipeline information including ID, name, description, and workspace details
    - Useful for discovering available data processing workflows in your Fabric workspace

    ## Note:
    - Ensure you have the necessary permissions to access Power BI and Fabric resources.
    - The tools will return errors if access tokens are not valid or if resources are not found.
    - The tools are designed to work with the Power BI REST API, Fabric REST API, and Microsoft Analysis Services.
    - The model definition tool retrieves a TMSL definition for Analysis Services Models.

    ## TMSL Definitions:
    - TMSL (Tabular Model Scripting Language) is used to define and manage tabular models in Analysis Services.
    - The `get_model_definition` tool retrieves a TMSL definition for the specified model in the given workspace.

    ## Getting Model Definitions:
    - Use the `get_model_definition` tool to retrieve the TMSL definition of a model.
    - You can specify the workspace name and dataset name to get the model definition.
    - The tool will return the TMSL definition as a string, which can be used for further analysis or updates.
    - Do not look at models that have the same name as a lakehouse.  This is likely a Default model so should be ignored.

    ## Running a DAX Query:
    - You can execute DAX queries against the Power BI model using the `execute_dax_query` tool.
    - Make sure you use the correct dataset name, not the dataset ID.
    - Provide the DAX query, the workspace name, and the dataset name to get results.
    - The results will be returned in JSON format for easy consumption.
    - **IMPORTANT**: When returning a single value, use braces {} around the expression as a table constructor:
      - CORRECT: EVALUATE {COUNTROWS(table)}
      - INCORRECT: EVALUATE COUNTROWS(table)
    - Do not use DAX queries to learn about columns in Lakehouse tables.
    - NEVER use DAX queries when the user asks for SQL/T-SQL queries.

    ## Running a T-SQL query against the Lakehouse SQL Analytics Endpoint
    - Use the `query_lakehouse_sql_endpoint` tool to run T-SQL queries against the Lakehouse SQL Analytics Endpoint.
    - This is the ONLY tool to use for SQL queries - never use execute_dax_query for SQL requests.
    - If this fails, do not follow up with a DAX Query.
    - Use this tool to validate table schemas, column names, and data types before creating DirectLake models.
    
    ## SQL Query Schema Considerations ##
    - **Table Naming**: Lakehouse tables can be queried using different naming patterns:
      * **Pattern 1**: `SELECT * FROM table_name` (when lakehouse has no default schema)
      * **Pattern 2**: `SELECT * FROM dbo.table_name` (when lakehouse is schema-enabled with dbo as default)
      * **Pattern 3**: `SELECT * FROM dbo_table_name` (tables prefixed with schema in their actual name)
    - **Schema Detection**: Check lakehouse properties - if `"defaultSchema": "dbo"` exists, use schema-qualified names
    - **Best Practice**: Try the table name as returned by `list_fabric_delta_tables` first, then try with schema prefix if needed
    - **Common Patterns**:
      * Tables named like `dbo_TableName` → Query as `FROM dbo_TableName`
      * Tables in schema-enabled lakehouse → Query as `FROM dbo.TableName` or `FROM schema.TableName`
    - **INFORMATION_SCHEMA queries**: Always work regardless of schema setup:
      * `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'table_name'`

    ## 🚀 ENHANCED DirectLake Model Creation - NO MORE TRIAL AND ERROR! ##
    
    **🆕 RECOMMENDED APPROACH - Use generate_directlake_tmsl_template first!**
    1. **Step 1**: Use `generate_directlake_tmsl_template` to auto-generate valid TMSL
    2. **Step 2**: Use `update_model_using_tmsl` with `validate_only=True` to pre-validate
    3. **Step 3**: Use `update_model_using_tmsl` with `validate_only=False` to deploy
    
    **Benefits of new approach:**
    - ✅ Automatic schema validation against lakehouse tables
    - ✅ Pre-validated TMSL structure with all required components
    - ✅ Proper data type mapping from SQL to DirectLake
    - ✅ Built-in validation before deployment
    - ✅ Detailed error messages with fix suggestions
    
    ## Enhanced TMSL Validation ##
    The `update_model_using_tmsl` tool now includes comprehensive validation that catches:
    
    **🚨 CRITICAL ERRORS (Prevent Deployment Failures):**
    - ❌ Missing expressions block with DatabaseQuery
    - ❌ Table-level "mode": "directLake" property (BREAKS DEPLOYMENT!)
    - ❌ Missing partitions arrays
    - ❌ Incorrect partition mode placement
    - ❌ Invalid TMSL JSON syntax
    
    **⚠️ WARNINGS (May Cause Issues):**
    - Missing Sql.Database() in DatabaseQuery expression
    - Incorrect expressionSource values
    - Suboptimal TMSL structure
    
    **💡 AUTOMATIC SUGGESTIONS:**
    - Specific fixes for each error type
    - Code examples for corrections
    - References to required TMSL structure
    
    ## Validation-First Workflow ##
    ```
    # 1. Generate template (auto-validates schemas)
    template = generate_directlake_tmsl_template(workspace_id, lakehouse_id, ["table1", "table2"], "MyModel")
    
    # 2. Validate before deployment
    validation = update_model_using_tmsl(workspace, model_name, template, validate_only=True)
    
    # 3. Deploy if validation passes
    result = update_model_using_tmsl(workspace, model_name, template, validate_only=False)
    ```

    ## Updating the model:
    - The MCP Server uses TMSL scripts to update the model.
    - The `get_model_definition` tool retrieves the TMSL definition for a specified model.  Use this to get the current model structure.
    - The `update_model_using_tmsl` tool allows you to update the TMSL definition for a specified dataset in a Power BI workspace.
    - **NEW**: Enhanced with pre-validation and detailed error reporting
    - **NEW**: Use `validate_only=True` to test TMSL without deploying
    - Provide the workspace name, dataset name, and the new TMSL definition as a string.
    - The tool will return a success message or an error if the update fails.
    - Use this tool to modify the structure of your Power BI models dynamically.
    - eg. to add measures, calculated columns, or modify relationships in the model.
    - Note:
    - if you are updating the entire model, ensure the TMSL definition includes the `createOrReplace` for the database object.
    - if you are only updating a table, include the `createOrReplace` for the table object.
    - if you are only updating, adding or deleting a measure, only script the createOrReplace for the table object and not the entire database object if you can and be sure to include the columns.
    
    ## The model hierarchy ##
    - **Database**: The top-level container for the model.
    - **Model**: Represents the entire model within the database.   
    - **Table**: Represents a table in the model, containing columns and measures.
    - **Column**: Represents a column in a table, which can be a data column or a calculated column.
    - **Measure**: Represents a calculation or aggregation based on the data in the model.  
    - **Partition**: Represents a partition of data within a table, often used for performance optimization.

    ## Creating TMSL for a new DirectLake semantic model ##
    - **RECOMMENDED**: Use `generate_directlake_tmsl_template` for automatic generation
    - **ALTERNATIVE**: You can use the file stored in the tmsl_model_template.json as an example to create a new DirectLake model.
    - You will need to change the model name, dataset name, and workspace name to match your environment.
    
    ## 🚨 CRITICAL DIRECTLAKE REQUIREMENTS - VALIDATION ENFORCED! 🚨 ##

    **The validation system now automatically checks for these critical requirements:**

    **MANDATORY #1: TABLE MODE RESTRICTION**  
    - ❌ **NEVER ADD**: "mode": "directLake" at the table level (AUTOMATICALLY DETECTED AND BLOCKED)
    - ✅ ONLY ADD: "mode": "directLake" in the partition object inside partitions array
    - 🚫 TABLE LEVEL: { "name": "TableName", "mode": "directLake" } ← VALIDATION ERROR!
    - ✅ PARTITION LEVEL: { "name": "Partition", "mode": "directLake", "source": {...} } ← VALIDATED!

    **MANDATORY #2: EXPRESSIONS BLOCK**
    - ❌ NEVER FORGET: Every DirectLake model MUST have an "expressions" section (AUTOMATICALLY CHECKED)
    - ✅ ALWAYS ADD: expressions block with "DatabaseQuery" using Sql.Database() function
    - 🔧 FORMAT: expressions array with name:"DatabaseQuery", kind:"m", expression array

    **MANDATORY #3: TABLE STRUCTURE**
    - ✅ Table objects should ONLY have: name, source, columns, partitions, measures (optional)
    - ❌ Table objects should NEVER have: mode, defaultMode, or any mode-related properties (BLOCKED BY VALIDATION)
    
    ## DirectLake Model Creation Checklist - NOW AUTOMATED! ##
    The validation system automatically verifies ALL of these:
    1. ✅ Model has "expressions" section with "DatabaseQuery" M expression
    2. ✅ Sql.Database() function with connection string and SQL Analytics Endpoint ID
    3. ✅ Each table has "partitions" array with at least one partition
    4. ✅ Each partition has "mode": "directLake" (NOT at table level!)
    5. ✅ Each partition has "expressionSource": "DatabaseQuery"
    6. ✅ All column names and data types validated against actual lakehouse tables
    7. ✅ **CRITICAL**: No table object has "mode": "directLake" property (BLOCKED!)
    8. ✅ Table objects only contain: name, source, columns, partitions, measures (no mode properties)
    
    ## Common DirectLake Mistakes - NOW PREVENTED! ##
    The validation system prevents these errors:
    - 🚫 Missing expressions block entirely (VALIDATION ERROR)
    - 🚫 **CRITICAL ERROR**: Adding "mode": "directLake" to table object (BLOCKED!)
    - 🚫 Using lakehouse name instead of SQL Analytics Endpoint ID in Sql.Database() (DETECTED)
    - 🚫 Missing partitions array (VALIDATION ERROR)
    - 🚫 Wrong expressionSource value (WARNING PROVIDED)
    
    ## 🚨 NEVER ADD MODE TO TABLE OBJECTS - NOW ENFORCED! 🚨 ##
    - ❌ WRONG: { "name": "TableName", "mode": "directLake", "source": {...} } ← VALIDATION BLOCKS THIS!
    - ✅ CORRECT: { "name": "TableName", "source": {...}, "partitions": [{"mode": "directLake"}] } ← VALIDATION PASSES!
    
    ## Step-by-Step DirectLake Creation Process - ENHANCED! ##
    1. **NEW**: Use `generate_directlake_tmsl_template` to auto-generate valid TMSL
    2. **OPTIONAL**: Use `update_model_using_tmsl` with `validate_only=True` to pre-validate
    3. **TRADITIONAL**: Get lakehouse SQL connection details using get_lakehouse_sql_connection_string
    4. **TRADITIONAL**: Validate table schema using query_lakehouse_sql_endpoint 
    5. **ENHANCED**: Create TMSL with expressions block and proper partition structure (or use template)
    6. **ENHANCED**: Deploy using update_model_using_tmsl with automatic validation
    7. Test with execute_dax_query but only against the model name that got created.  Do not query a different model
    
    ## Notes for creating a new DirectLake Model ##
    - **RECOMMENDED**: Use the new `generate_directlake_tmsl_template` tool for automatic generation
    - To create a new model, you can use the `update_model_using_tmsl` tool with a TMSL definition that includes the `createOrReplace` for the database object.
    - **NEW**: Enhanced validation prevents common mistakes before deployment
    - The TMSL definition should include the structure of the model, including tables, columns, and measures.
    - Ensure you provide a valid dataset name and workspace name when creating a new model.
    - The tool will return a success message or an error if the creation fails.
    - Notes:
    - The TMSL definition should be a valid JSON string.
    - **IMPORTANT**: The Sql.Database function takes two arguments: (1) SQL Analytics Endpoint connection string, (2) SQL Analytics Endpoint ID (NOT the lakehouse name or lakehouse ID).
    - Use `get_lakehouse_sql_connection_string` tool to get the correct endpoint ID for the Sql.Database function.
    - Do not use the same name for the model as the Lakehouse, as this can cause conflicts.
    - Relationships ONLY need the following five properties: `name` , `fromTable` ,  `fromColumn` , `toTable` , `toColumn`
    - Do NOT use the crossFilterBehavior property in relationships for DirectLake models.
    - When creating a new model, ensure each table only uses columns from the lakehouse tables and not any other source.  Validate if needed that the table names are not the same as any other source.
    - Do not create a column called rowNumber or rowNum, as this is a reserved name in DirectLake models.
    - When creating a new Directlake model, save the TMSL definition to a file for future reference or updates in the models subfolder.
    - Do not attempt to modify an existing semantic model when asked to create a new semantic model.  This would be bad and may overwrite another model
    
    ## DirectLake Model Creation Checklist - FINAL VERIFICATION NOW AUTOMATED! ##
    The enhanced validation system automatically verifies ALL of these before deployment:
    1. ✅ Model has "expressions" section with "DatabaseQuery" M expression ← AUTOMATICALLY CHECKED!
    2. ✅ Sql.Database() function with connection string and SQL Analytics Endpoint ID
    3. ✅ Each table has "partitions" array with at least one partition
    4. ✅ Each partition has "mode": "directLake" (NOT at table level!) ← AUTOMATICALLY ENFORCED!
    5. ✅ Each partition has "expressionSource": "DatabaseQuery"
    6. ✅ All column names and data types validated against actual lakehouse tables
    7. ✅ **DEPLOYMENT BREAKER**: No table object has "mode": "directLake" property (BLOCKED!) ← AUTOMATICALLY PREVENTED!
    8. ✅ **STRUCTURE CHECK**: Table objects only have allowed properties: name, source, columns, partitions, measures
    
    ## 🚨 TOP 3 MISTAKES NOW PREVENTED BY VALIDATION! 🚨
    1. Missing expressions block = VALIDATION ERROR with fix suggestion
    2. **Table-level "mode": "directLake" = BLOCKED before deployment with detailed error**
    3. Wrong partition structure = VALIDATION ERROR with structure guidance
    4. Wrong Sql.Database arguments = DETECTED with correction suggestion
    
    ## 🚫 FORBIDDEN TABLE PROPERTIES - NOW ENFORCED! 🚫
    **The validation system blocks these properties in table objects:**
    - "mode": "directLake" ← VALIDATION ERROR
    - "defaultMode": "directLake" ← VALIDATION ERROR  
    - Any mode-related property ← VALIDATION ERROR
    
    ## CRITICAL: Schema Validation Before Model Creation ##
    - **ENHANCED**: The `generate_directlake_tmsl_template` tool automatically validates schemas
    - **TRADITIONAL**: Use the `query_lakehouse_sql_endpoint` tool to validate table schemas manually
    - Do not query all the data in the Lakehouse table - this is not needed and can be slow, especially for large tables.  Use the TOP 5 or similar queries to validate the structure.
    - DirectLake models must exactly match the source Delta table schema - any mismatch will cause deployment failures
    - **Schema-Aware Query Examples**:
      * `"SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'your_table_name'"` (works with any schema setup)
      * `"SELECT TOP 5 * FROM your_table_name"` (use exact table name from list_fabric_delta_tables)
      * `"SELECT TOP 5 * FROM dbo.your_table_name"` (if lakehouse has defaultSchema: "dbo")
      * `"SHOW TABLES"` (to see all available tables and their naming patterns)
      * `"SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES"` (to see schema structure)
    - Column names are case-sensitive and must match exactly
    - Data types must be compatible between Delta Lake and DirectLake
    - Never assume column names or structures - always validate first
    - **Troubleshooting**: If a query fails with "object not found", try alternative schema patterns (with/without dbo prefix)
    
    ## Example Enhanced Workflow ##
    ```
    # NEW RECOMMENDED APPROACH:
    1. template = generate_directlake_tmsl_template(workspace_id, lakehouse_id, ["dim_Date", "fact_Sales"], "MyModel")
    2. validation = update_model_using_tmsl(workspace, "MyModel", template, validate_only=True)  
    3. result = update_model_using_tmsl(workspace, "MyModel", template, validate_only=False)
    
    # TRADITIONAL APPROACH WITH VALIDATION:
    1. connection_info = get_lakehouse_sql_connection_string(workspace_id, lakehouse_id)
    2. schema_check = query_lakehouse_sql_endpoint(workspace_id, "INFORMATION_SCHEMA query")
    3. tmsl = create_manual_tmsl_definition()
    4. validation = update_model_using_tmsl(workspace, model, tmsl, validate_only=True)
    5. deployment = update_model_using_tmsl(workspace, model, tmsl, validate_only=False)
    ```

"""
)

# Register all MCP prompts from the prompts module
register_prompts(mcp)

@mcp.tool
def list_powerbi_workspaces() -> str:
    """Lists available Power BI workspaces for the current user."""
    return list_workspaces()

@mcp.tool
def list_powerbi_datasets(workspace_id: str) -> str:
    """Lists all datasets in a specified Power BI workspace."""
    return list_datasets(workspace_id)

@mcp.tool
def get_powerbi_workspace_id(workspace_name: str) -> str:
    """Gets the workspace ID for a given workspace name."""
    return get_workspace_id(workspace_name)

@mcp.tool
def list_powerbi_notebooks(workspace_id: str) -> str:
    """Lists all notebooks in a specified Power BI workspace."""
    return list_notebooks(workspace_id)

@mcp.tool
def list_fabric_lakehouses(workspace_id: str) -> str:
    """Lists all lakehouses in a specified Fabric workspace."""
    return list_lakehouses(workspace_id)

@mcp.tool
def list_fabric_delta_tables(workspace_id: str, lakehouse_id: str = None) -> str:
    """Lists all Delta Tables in a specified Fabric Lakehouse.
    If lakehouse_id is not provided, will use the first lakehouse found in the workspace.
    This function now supports both regular lakehouses and schema-enabled lakehouses by automatically
    falling back to SQL Analytics Endpoint queries when the Fabric API returns an error for schema-enabled lakehouses.
    """
    return list_delta_tables(workspace_id, lakehouse_id)

@mcp.tool
def debug_lakehouse_contents(workspace_id: str, lakehouse_id: str = None) -> str:
    """Debug function to check various API endpoints for lakehouse contents including files and items.
    """
    return list_lakehouse_files(workspace_id, lakehouse_id)

@mcp.tool
def get_lakehouse_sql_connection_string(workspace_id: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Gets the SQL endpoint connection string for a specified Fabric Lakehouse.
    You can specify either lakehouse_id or lakehouse_name to identify the lakehouse.
    Returns connection information including server name and connection string templates.
    """
    return fabric_get_lakehouse_sql_connection_string(workspace_id, lakehouse_id, lakehouse_name)

@mcp.tool
def clear_azure_token_cache() -> str:
    """Clears the Azure authentication token cache. 
    Useful for debugging authentication issues or forcing token refresh.
    """
    from core.azure_token_manager import clear_token_cache, get_token_cache_status
    
    # Get status before clearing
    status_before = get_token_cache_status()
    
    # Clear the cache
    clear_token_cache()
    
    # Get status after clearing
    status_after = get_token_cache_status()
    
    return f"Azure token cache cleared successfully. Had {len(status_before)} cached tokens, now has {len(status_after)} cached tokens."

@mcp.tool
def get_azure_token_status() -> str:
    """Gets the current status of the Azure token cache.
    Shows which tokens are cached, their expiration times, and validity status.
    """
    from core.azure_token_manager import get_token_cache_status
    import json
    
    status = get_token_cache_status()
    
    if not status:
        return "No Azure tokens currently cached."
    
    return json.dumps(status, indent=2)

@mcp.tool
def execute_dax_query(workspace_name:str, dataset_name: str, dax_query: str, dataset_id: str = None) -> list[dict]:
    """Executes a DAX query against the Power BI model.
    This tool connects to the specified Power BI workspace and dataset name, executes the provided DAX query,
    Use the dataset_name to specify the model to query and NOT the dataset ID.
    The function connects to the Power BI service using an access token, executes the DAX query,
    and returns the results.
    """  
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    
    try:
        #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
    except Exception as e:
        return [{"error": f"Failed to load required .NET assemblies: {str(e)}", "error_type": "assembly_load_error"}]

    try:
        from Microsoft.AnalysisServices.AdomdClient import AdomdConnection ,AdomdDataReader  # type: ignore
    except ImportError as e:
        return [{"error": f"Failed to import ADOMD libraries: {str(e)}", "error_type": "import_error"}]

    # Validate authentication
    access_token = get_access_token()
    if not access_token:
        return [{"error": "No valid access token available. Please check authentication.", "error_type": "authentication_error"}]

    # Validate required parameters
    if not workspace_name or not workspace_name.strip():
        return [{"error": "Workspace name is required and cannot be empty.", "error_type": "parameter_error"}]
    
    if not dataset_name or not dataset_name.strip():
        return [{"error": "Dataset name is required and cannot be empty.", "error_type": "parameter_error"}]
    
    if not dax_query or not dax_query.strip():
        return [{"error": "DAX query is required and cannot be empty.", "error_type": "parameter_error"}]

    workspace_name_encoded = urllib.parse.quote(workspace_name)
    # Use URL-encoded workspace name and standard XMLA connection format
    # The connection string format is: Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token};Catalog={dataset_name};
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token};Catalog={dataset_name};"

    connection = None
    try:
        # Attempt to establish connection
        connection = AdomdConnection(connection_string)
        connection.Open()
        
        # Execute the DAX query
        command = connection.CreateCommand()
        command.CommandText = dax_query
        reader: AdomdDataReader = command.ExecuteReader()
        
        results = []
        while reader.Read():
            row = {}
            for i in range(reader.FieldCount):
                # Handle different data types and null values
                value = reader.GetValue(i)
                if value is None or str(value) == "":
                    row[reader.GetName(i)] = None
                elif hasattr(value, 'isoformat'):  # DateTime objects
                    row[reader.GetName(i)] = value.isoformat()
                else:
                    row[reader.GetName(i)] = value
            results.append(row)
        
        reader.Close()
        return results
        
    except Exception as e:
        error_msg = str(e).lower()
        error_details = str(e)
        
        # Categorize different types of errors and provide helpful messages
        if "authentication" in error_msg or "unauthorized" in error_msg or "login" in error_msg:
            return [{"error": f"Authentication failed: {error_details}. Please check your access token and permissions.", "error_type": "authentication_error"}]
        elif "workspace" in error_msg or "not found" in error_msg:
            return [{"error": f"Workspace or dataset not found: {error_details}. Please verify workspace name '{workspace_name}' and dataset name '{dataset_name}' are correct.", "error_type": "not_found_error"}]
        elif "permission" in error_msg or "access" in error_msg or "forbidden" in error_msg:
            return [{"error": f"Permission denied: {error_details}. You may not have sufficient permissions to query this dataset.", "error_type": "permission_error"}]
        elif "syntax" in error_msg or "parse" in error_msg or "invalid" in error_msg:
            return [{"error": f"DAX query syntax error: {error_details}. Please check your DAX query syntax.", "error_type": "dax_syntax_error", "query": dax_query}]
        elif "timeout" in error_msg or "timed out" in error_msg:
            return [{"error": f"Query timeout: {error_details}. The query took too long to execute.", "error_type": "timeout_error"}]
        elif "connection" in error_msg or "network" in error_msg:
            return [{"error": f"Connection error: {error_details}. Please check your network connection and try again.", "error_type": "connection_error"}]
        else:
            return [{"error": f"Unexpected error executing DAX query: {error_details}", "error_type": "general_error", "query": dax_query}]
    
    finally:
        # Ensure connection is always closed
        try:
            if connection is not None and hasattr(connection, 'State') and connection.State == 1:  # ConnectionState.Open = 1
                connection.Close()
        except Exception as cleanup_error:
            print(f"Warning: Error during connection cleanup: {cleanup_error}")
            # Don't return error here as it would mask the main error

# Internal helper function for SQL queries (not exposed as MCP tool)
def _internal_query_lakehouse_sql_endpoint(workspace_id: str, sql_query: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Executes a SQL query against a Fabric Lakehouse SQL Analytics Endpoint to validate table schemas and data.
    This tool connects to the specified Fabric Lakehouse SQL Analytics Endpoint and executes the provided SQL query.
    Use this tool to:
    - Validate actual column names and data types in lakehouse tables
    - Query table schemas before creating DirectLake models
    - Inspect data samples from lakehouse tables
    - Verify table structures match your model expectations
    
    Args:
        workspace_id: The Fabric workspace ID containing the lakehouse
        sql_query: The SQL query to execute (e.g., "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'date'")
        lakehouse_id: Optional specific lakehouse ID to query
        lakehouse_name: Optional lakehouse name to query (alternative to lakehouse_id)
    
    Returns:
        JSON string containing query results or error message
    
    Example queries for schema validation:
    - "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_1'"
    - "SELECT TOP 5 * FROM date"
    - "SHOW TABLES"
    """
    import json

    # Get cached or fresh authentication token
    token_struct, success, error = get_cached_azure_token("https://database.windows.net/.default")
    if not success:
        return json.dumps({
            "success": False,
            "error": f"Authentication failed: {error}"
        }, indent=2)

    # Check if pyodbc is available
    if pyodbc is None:
        return json.dumps({
            "success": False,
            "error": "pyodbc is not installed. Please install it using: pip install pyodbc"
        }, indent=2)
    
    try:
        # Get the SQL Analytics Endpoint connection string
        connection_info = fabric_get_lakehouse_sql_connection_string(workspace_id, lakehouse_id, lakehouse_name)
        
        if "error" in connection_info.lower():
            return f"Error getting connection string: {connection_info}"
        
        # Parse the connection info to get the server and endpoint ID
        connection_data = json.loads(connection_info)
        server_name = connection_data.get("sql_endpoint", {}).get("server_name")
        endpoint_id = connection_data.get("sql_endpoint", {}).get("endpoint_id")
        
        if not server_name or not endpoint_id:
            return "Error: Could not retrieve SQL Analytics Endpoint information"
        
        # Build connection string for SQL Analytics Endpoint
        # For Fabric SQL Analytics Endpoints, use the lakehouse name as the database
        lakehouse_name = connection_data.get("lakehouse_name")
        if not lakehouse_name:
            return json.dumps({
                "success": False,
                "error": "Could not determine lakehouse name for database connection"
            }, indent=2)
        
        # Try different ODBC drivers in order of preference
        available_drivers = [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server", 
            "SQL Server"
        ]
        
        # Detect which driver is available
        available_driver = None
        available_pyodbc_drivers = pyodbc.drivers()
        
        for driver in available_drivers:
            if driver in available_pyodbc_drivers:
                available_driver = driver
                break
        
        if not available_driver:
            return json.dumps({
                "success": False,
                "error": "No compatible ODBC driver found. Please install ODBC Driver for SQL Server.",
                "available_drivers": list(available_pyodbc_drivers),
                "looking_for": available_drivers
            }, indent=2)
        
        connection_string = (
            f"Driver={{{available_driver}}};"
            f"Server={server_name};"
            f"Database={lakehouse_name};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=30;"
        )
        
        # Debug: log connection attempt
        print(f"Attempting connection with driver: {available_driver}")
        print(f"Connection string: {connection_string}")
        
        # Execute the query using ActiveDirectoryInteractive authentication
        with pyodbc.connect(connection_string, attrs_before={1256  : token_struct}) as conn:
            cursor = conn.cursor()
            cursor.execute(sql_query)
            
            # Get column names
            columns = [column[0] for column in cursor.description]
            
            # Fetch results
            rows = cursor.fetchall()
            
            # Convert to list of dictionaries
            results = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    # Handle special data types
                    if hasattr(value, 'isoformat'):  # datetime objects
                        row_dict[columns[i]] = value.isoformat()
                    elif isinstance(value, (bytes, bytearray)):  # binary data
                        row_dict[columns[i]] = str(value)
                    else:
                        row_dict[columns[i]] = value
                results.append(row_dict)
            
            return json.dumps({
                "success": True,
                "query": sql_query,
                "columns": columns,
                "row_count": len(results),
                "results": results[:100],  # Limit to first 100 rows to avoid large responses
                "note": f"Showing first 100 rows out of {len(results)} total rows" if len(results) > 100 else None
            }, indent=2)
            
    except pyodbc.Error as e:
        error_details = str(e)
        return json.dumps({
            "success": False,
            "error": f"SQL Error: {error_details}",
            "query": sql_query,
            "debug_info": {
                "server_name": server_name if 'server_name' in locals() else "Not available",
                "lakehouse_name": lakehouse_name if 'lakehouse_name' in locals() else "Not available",
                "available_driver": available_driver if 'available_driver' in locals() else "Not detected",
                "connection_string": connection_string if 'connection_string' in locals() else "Not available"
            }
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Connection Error: {str(e)}",
            "query": sql_query,
            "debug_info": {
                "connection_info": connection_info if 'connection_info' in locals() else "Not available"
            }
        }, indent=2)

@mcp.tool
def query_lakehouse_sql_endpoint(workspace_id: str, sql_query: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Executes a SQL query against a Fabric Lakehouse SQL Analytics Endpoint to validate table schemas and data.
    This tool connects to the specified Fabric Lakehouse SQL Analytics Endpoint and executes the provided SQL query.
    Use this tool to:
    - Validate actual column names and data types in lakehouse tables
    - Query table schemas before creating DirectLake models
    - Inspect data samples from lakehouse tables
    - Verify table structures match your model expectations
    
    Args:
        workspace_id: The Fabric workspace ID containing the lakehouse
        sql_query: The SQL query to execute (e.g., "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'date'")
        lakehouse_id: Optional specific lakehouse ID to query
        lakehouse_name: Optional lakehouse name to query (alternative to lakehouse_id)
    
    Returns:
        JSON string containing query results or error message
    
    Example queries for schema validation:
    - "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_1'"
    - "SELECT TOP 5 * FROM date"
    - "SHOW TABLES"
    """
    return _internal_query_lakehouse_sql_endpoint(workspace_id, sql_query, lakehouse_id, lakehouse_name)

@mcp.tool
def generate_directlake_tmsl_template(workspace_id: str, lakehouse_id: str = None, lakehouse_name: str = None, table_names: Optional[List[str]] = None, model_name: str = "NewDirectLakeModel") -> str:
    """Generates a valid DirectLake TMSL template with proper structure and validated schemas.
    
    This helper tool automatically creates a complete DirectLake TMSL definition by:
    1. Connecting to the specified lakehouse
    2. Validating table schemas using SQL Analytics Endpoint
    3. Generating proper TMSL structure with all required components
    4. Including validation-ready partitions and expressions
    
    Args:
        workspace_id: The Fabric workspace ID containing the lakehouse
        lakehouse_id: Optional specific lakehouse ID
        lakehouse_name: Optional lakehouse name (alternative to lakehouse_id)
        table_names: List of table names to include (if not provided, suggests available tables)
        model_name: Name for the new DirectLake model
    
    Returns:
        Complete TMSL JSON string ready for use with update_model_using_tmsl
    """
    
    try:
        # Get lakehouse connection information
        connection_info = fabric_get_lakehouse_sql_connection_string(workspace_id, lakehouse_id, lakehouse_name)
        if "error" in connection_info.lower():
            return f"Error getting lakehouse connection: {connection_info}"
        
        connection_data = json.loads(connection_info)
        server_name = connection_data.get("sql_endpoint", {}).get("server_name")
        endpoint_id = connection_data.get("sql_endpoint", {}).get("endpoint_id")
        actual_lakehouse_name = connection_data.get("lakehouse_name")
        
        if not server_name or not endpoint_id:
            return "Error: Could not retrieve SQL Analytics Endpoint information"
        
        # If no table names provided, get available tables
        if not table_names:
            delta_tables_result = list_delta_tables(workspace_id, lakehouse_id)
            try:
                delta_tables = json.loads(delta_tables_result)
                available_tables = [table["name"] for table in delta_tables]
                return f"Available tables in lakehouse '{actual_lakehouse_name}':\n{json.dumps(available_tables, indent=2)}\n\nPlease call this function again with specific table_names parameter."
            except:
                return f"Error retrieving available tables: {delta_tables_result}"
        
        # Validate table schemas
        validated_tables = []
        for table_name in table_names:
            schema_query = f"SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table_name}' ORDER BY ORDINAL_POSITION"
            schema_result = _internal_query_lakehouse_sql_endpoint(workspace_id, schema_query, lakehouse_id, lakehouse_name)
            
            try:
                schema_data = json.loads(schema_result)
                if schema_data.get("success"):
                    columns = []
                    for col in schema_data.get("results", []):
                        # Map SQL types to DirectLake types
                        sql_type = col["DATA_TYPE"].lower()
                        if sql_type in ["varchar", "nvarchar", "char", "nchar", "text", "ntext"]:
                            dl_type = "string"
                        elif sql_type in ["int", "bigint", "smallint", "tinyint"]:
                            dl_type = "int64"
                        elif sql_type in ["decimal", "numeric", "float", "real", "money", "smallmoney"]:
                            dl_type = "decimal"
                        elif sql_type in ["datetime", "datetime2", "date", "time", "smalldatetime"]:
                            dl_type = "dateTime"
                        elif sql_type in ["bit"]:
                            dl_type = "boolean"
                        else:
                            dl_type = "string"  # Default fallback
                        
                        columns.append({
                            "name": col["COLUMN_NAME"],
                            "dataType": dl_type,
                            "sourceColumn": col["COLUMN_NAME"],
                            "lineageTag": f"{table_name}_{col['COLUMN_NAME']}",
                            "sourceLineageTag": col["COLUMN_NAME"],
                            "summarizeBy": "sum" if dl_type in ["int64", "decimal"] and "quantity" in col["COLUMN_NAME"].lower() else "none"
                        })
                    
                    validated_tables.append({
                        "name": table_name,
                        "columns": columns
                    })
                else:
                    return f"Error validating schema for table '{table_name}': {schema_data.get('error', 'Unknown error')}"
            except Exception as e:
                return f"Error processing schema for table '{table_name}': {str(e)}"
        
        # Generate complete TMSL structure
        tmsl_template = {
            "createOrReplace": {
                "object": {
                    "database": model_name
                },
                "database": {
                    "name": model_name,
                    "compatibilityLevel": 1604,
                    "model": {
                        "culture": "en-US",
                        "collation": "Latin1_General_100_BIN2_UTF8",
                        "dataAccessOptions": {
                            "legacyRedirects": True,
                            "returnErrorValuesAsNull": True
                        },
                        "defaultPowerBIDataSourceVersion": "powerBI_V3",
                        "sourceQueryCulture": "en-US",
                        "tables": [],
                        "expressions": [
                            {
                                "name": "DatabaseQuery",
                                "kind": "m",
                                "expression": [
                                    "let",
                                    f"    database = Sql.Database(\"{server_name}\", \"{endpoint_id}\")",
                                    "in",
                                    "    database"
                                ],
                                "lineageTag": "DatabaseQuery_expression",
                                "annotations": [
                                    {
                                        "name": "PBI_IncludeFutureArtifacts",
                                        "value": "False"
                                    }
                                ]
                            }
                        ],
                        "annotations": [
                            {
                                "name": "__PBI_TimeIntelligenceEnabled",
                                "value": "0"
                            },
                            {
                                "name": "PBI_QueryOrder",
                                "value": "[\"DatabaseQuery\"]"
                            },
                            {
                                "name": "PBI_ProTooling",
                                "value": "[\"WebModelingEdit\"]"
                            }
                        ]
                    }
                }
            }
        }
        
        # Add validated tables with proper DirectLake structure
        for table_info in validated_tables:
            table_def = {
                "name": table_info["name"],
                "lineageTag": f"{table_info['name']}_table",
                "sourceLineageTag": f"[dbo].[{table_info['name']}]",
                "columns": table_info["columns"],
                "partitions": [
                    {
                        "name": f"{table_info['name']}_partition",
                        "mode": "directLake",
                        "source": {
                            "type": "entity",
                            "entityName": table_info["name"],
                            "expressionSource": "DatabaseQuery"
                        }
                    }
                ]
            }
            tmsl_template["createOrReplace"]["database"]["model"]["tables"].append(table_def)
        
        return json.dumps(tmsl_template, indent=2)
        
    except Exception as e:
        return f"Error generating DirectLake TMSL template: {str(e)}"

@mcp.tool
def update_model_using_tmsl(workspace_name: str, dataset_name: str, tmsl_definition: str, validate_only: bool = False) -> str:
    """Updates the TMSL definition for an Analysis Services Model with enhanced validation.
    
    This tool connects to the specified Power BI workspace and dataset name, validates and updates the TMSL definition,
    and returns a success message or detailed error information if the update fails.
    
    Args:
        workspace_name: The Power BI workspace name
        dataset_name: The dataset/model name to update
        tmsl_definition: Valid TMSL JSON string
        validate_only: If True, only validates the TMSL without executing (default: False)
    
    Enhanced Features:
    - Pre-validates TMSL structure before sending to server
    - Checks for common DirectLake mistakes
    - Provides detailed error messages with suggestions
    - Validates required DirectLake components
    
    Returns:
        Success message or detailed error with suggestions for fixes
    """   
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")

    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server# type: ignore
    from Microsoft.AnalysisServices import XmlaResultCollection  # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"
    server = Server()
    
    try:
        server.Connect(connection_string)
        
        # Enhanced TMSL validation before processing
        validation_result = validate_tmsl_structure(tmsl_definition)
        if not validation_result["valid"]:
            return f"❌ TMSL Validation Failed:\n{validation_result['error']}\n\n💡 Suggestions:\n{validation_result['suggestions']}"
        
        # If validate_only is True, return validation success without executing
        if validate_only:
            return f"✅ TMSL Validation Passed:\n{validation_result['summary']}\n\n📋 Structure validated successfully - ready for deployment!"
        
        # Parse the TMSL definition to check its structure
        try:
            tmsl = json.loads(tmsl_definition)
        except json.JSONDecodeError as e:
            return f"Error: Invalid JSON in TMSL definition - {e}"
        
        databaseCount = count_nodes_with_name(tmsl, "database")
        tableCount = count_nodes_with_name(tmsl, "table")
        
        # Check if the tmsl_definition already has createOrReplace at the root level
        if "createOrReplace" in tmsl:
            # TMSL already has createOrReplace wrapper, use as-is
            final_tmsl = tmsl_definition
        elif databaseCount > 0:
            # TMSL contains database definition, wrap with createOrReplace for database
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name
                    },
                    "database": tmsl
                }
            })
        elif tableCount == 1:
            # TMSL contains single table definition, extract table name and wrap appropriately
            table_name = None
            if "name" in tmsl:
                table_name = tmsl["name"]
            elif isinstance(tmsl, dict):
                # Try to find table name in the structure
                for key, value in tmsl.items():
                    if key == "name" and isinstance(value, str):
                        table_name = value
                        break
            
            if not table_name:
                return "Error: Cannot determine table name from TMSL definition"
                
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name,
                        "table": table_name
                    },
                    "table": tmsl
                }
            })
        else:
            # Assume it's a general model update, wrap with database createOrReplace
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name
                    },
                    "database": tmsl
                }
            })

        retval: XmlaResultCollection = server.Execute(final_tmsl)
        
        # Check if the execution was successful by examining the XmlaResultCollection
        if retval is None:
            return f"TMSL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'. ✅"
        
        # Iterate through the XmlaResultCollection to check for errors or messages
        errors = []
        messages = []
        warnings = []
        
        for result in retval:
            # Check for errors in the result
            if hasattr(result, 'HasErrors') and result.HasErrors:
                if hasattr(result, 'Messages'):
                    for message in result.Messages:
                        if hasattr(message, 'MessageType'):
                            if str(message.MessageType).lower() == 'error':
                                errors.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                            elif str(message.MessageType).lower() == 'warning':
                                warnings.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                            else:
                                messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        else:
                            # If no MessageType, treat as general message
                            messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
            elif hasattr(result, 'Messages'):
                # No explicit errors, but check messages anyway
                for message in result.Messages:
                    if hasattr(message, 'MessageType'):
                        if str(message.MessageType).lower() == 'error':
                            errors.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        elif str(message.MessageType).lower() == 'warning':
                            warnings.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        else:
                            messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                    else:
                        messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
        
        # Determine the result based on what we found
        if errors:
            error_details = "; ".join(errors)
            return f"Error updating TMSL definition for dataset '{dataset_name}' in workspace '{workspace_name}': {error_details}"
        elif warnings:
            warning_details = "; ".join(warnings)
            success_msg = f"TMSL definition updated for dataset '{dataset_name}' in workspace '{workspace_name}' with warnings: {warning_details} ⚠️"
            if messages:
                success_msg += f" Additional info: {'; '.join(messages)}"
            return success_msg
        elif messages:
            message_details = "; ".join(messages)
            return f"TMSL definition updated for dataset '{dataset_name}' in workspace '{workspace_name}'. Server messages: {message_details} ✅"
        else:
            # No errors, warnings, or messages - successful execution
            return f"TMSL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'. ✅"
        
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON in TMSL definition - {e}"
    except ConnectionError as e:
        print(f"Connection error in update_model_using_tmsl: {e}")
        return f"Error connecting to Power BI service: {e}"
    except Exception as e:
        # Check if it's an Analysis Services specific error that might contain useful details
        error_message = str(e)
        print(f"Error in update_model_using_tmsl: {e}")
        
        # Provide more context for common error scenarios
        if "authentication" in error_message.lower() or "unauthorized" in error_message.lower():
            return f"Authentication error: {error_message}. Please check your access token and permissions."
        elif "not found" in error_message.lower():
            return f"Dataset or workspace not found: {error_message}. Please verify the workspace name '{workspace_name}' and dataset name '{dataset_name}' are correct."
        elif "permission" in error_message.lower() or "access" in error_message.lower():
            return f"Permission error: {error_message}. You may not have sufficient permissions to modify this dataset."
        else:
            return f"Error updating TMSL definition: {error_message}"
    finally:
        # Ensure server connection is always closed
        try:
            if server and hasattr(server, 'Connected') and server.Connected:
                server.Disconnect()
        except:
            pass  # Ignore errors during cleanup
    
@mcp.tool
def get_model_definition(workspace_name:str = None, dataset_name:str=None) -> str:
    """Gets TMSL definition for an Analysis Services Model.
    This tool connects to the specified Power BI workspace and dataset name, retrieves the model definition,
    and returns the TMSL definition as a string.
    The function connects to the Power BI service using an access token, retrieves the model definition,
    and returns the result.
    Note: The workspace_name and dataset_name should be valid names in the Power BI service.
    """
    

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
    
    from Microsoft.AnalysisServices.Tabular import Server,Database, JsonSerializer,SerializeOptions # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    # Use URL-encoded workspace name and standard XMLA connection format

    workspace_name = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token}"

    server: Server = Server()
    server.Connect(connection_string)
    database: Database = server.Databases.GetByName(dataset_name)

    options = SerializeOptions()
    options.IgnoreTimestamps = True

    tmsl_definition = JsonSerializer.SerializeDatabase(database, options)
    return tmsl_definition




# Microsoft Learn API Tools
@mcp.tool
def search_learn_microsoft_content(query: str, locale: str = "en-us", top: int = 10, content_type: str = None) -> str:
    """Search Microsoft Learn documentation and content.
    
    Args:
        query: Search query for Microsoft Learn content
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 10)
        content_type: Filter by content type (e.g., 'documentation', 'learning-path', 'module')
    
    Returns:
        JSON string with search results from Microsoft Learn
    """
    return search_microsoft_learn(query, locale, top, content_type)

@mcp.tool
def get_learn_microsoft_paths(locale: str = "en-us", top: int = 20) -> str:
    """Get Microsoft Learn learning paths.
    
    Args:
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 20)
    
    Returns:
        JSON string with learning paths from Microsoft Learn
    """
    return get_microsoft_learn_paths(locale, top)

@mcp.tool
def get_learn_microsoft_modules(locale: str = "en-us", top: int = 20, learning_path_id: str = None) -> str:
    """Get Microsoft Learn modules.
    
    Args:
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 20)
        learning_path_id: Filter by specific learning path ID
    
    Returns:
        JSON string with modules from Microsoft Learn
    """
    return get_microsoft_learn_modules(locale, top, learning_path_id)

@mcp.tool
def get_learn_microsoft_content(content_url: str, locale: str = "en-us") -> str:
    """Get specific Microsoft Learn content by URL.
    
    Args:
        content_url: Microsoft Learn content URL
        locale: Language locale (default: en-us)
    
    Returns:
        JSON string with content details from Microsoft Learn
    """
    return get_microsoft_learn_content(content_url, locale)

def main():
    """Main entry point for the Semantic Model MCP Server."""

    logging.info("Starting Semantic Model MCP Server")
    mcp.run()

if __name__ == "__main__":
    main()
