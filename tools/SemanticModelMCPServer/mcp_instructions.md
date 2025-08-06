# Model Browser MCP Server Instructions

A tool to browse and manage semantic models in Microsoft Fabric and Power BI.

## Available Tools:
    - List Power BI Workspaces
    - List Power BI Datasets
    - List Power BI Notebooks
    - List Fabric Lakehouses
    - List Fabric Delta Tables
    - Get Power BI Workspace ID
    - Get Model Definition
    - Execute DAX Queries
    - Update Model using TMSL

    ## Usage:
    - You can ask questions about Power BI workspaces, datasets, notebooks, and models.
    - You can explore Fabric lakehouses and Delta Tables.
    - Use the tools to retrieve information about your Power BI and Fabric environment.
    - The tools will return JSON formatted data for easy parsing.
    
    ## Example Queries:
    - "Can you get a list of workspaces?"
    - "Can you list notebooks in workspace X?"
    - "Show me the lakehouses in this workspace"
    - "List all Delta Tables in lakehouse Y"

    ## Fabric Lakehouse Support:
    - Use `list_fabric_lakehouses` to see all lakehouses in a workspace
    - Use `list_fabric_delta_tables` to see Delta Tables in a specific lakehouse
    - If you don't specify a lakehouse ID, the tool will use the first lakehouse found
    - Delta Tables are the primary table format used in Fabric lakehouses

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

    ## Updating the model:
    - The MCP Server uses TMSL sctripts to update the model.
    - The `get_model_definition` tool retrieves the TMSL definition for a specified model.  Use this to get the current model structure.
    - The `update_model_using_tmsl` tool allows you to update the TMSL definition for a specified dataset in a Power BI workspace.
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
    
    ## 🚨 CRITICAL DIRECTLAKE REQUIREMENTS - ALWAYS INCLUDE THESE! 🚨 ##
    
    **MANDATORY #1: EXPRESSIONS BLOCK**
    - ❌ NEVER FORGET: Every DirectLake model MUST have an "expressions" section
    - ✅ ALWAYS ADD: expressions block with "DatabaseQuery" using Sql.Database() function
    - 🔧 FORMAT: expressions array with name:"DatabaseQuery", kind:"m", expression array
    
    **MANDATORY #2: TABLE MODE RESTRICTION**  
    - ❌ NEVER ADD: "mode": "directLake" at the table level (this is INVALID)
    - ✅ ONLY ADD: "mode": "directLake" in the partition object inside partitions array
    - 🚫 TABLE LEVEL: { "name": "TableName", "mode": "directLake" } ← WRONG!
    - ✅ PARTITION LEVEL: { "name": "Partition", "mode": "directLake", "source": {...} } ← CORRECT!
    
    ## DirectLake Model Creation Checklist - VERIFY EVERY TIME ##
    Before creating any DirectLake model, ensure ALL of the following are included:
    1. ✅ Model has "expressions" section with "DatabaseQuery" M expression
    2. ✅ Sql.Database() function with connection string and SQL Analytics Endpoint ID
    3. ✅ Each table has "partitions" array with at least one partition
    4. ✅ Each partition has "mode": "directLake" (NOT at table level!)
    5. ✅ Each partition has "expressionSource": "DatabaseQuery"
    6. ✅ All column names and data types validated against actual lakehouse tables
    7. ✅ No table object has "mode": "directLake" property (INVALID!)
    
    ## Common DirectLake Mistakes to AVOID ##
    - 🚫 Missing expressions block entirely (model won't connect to data)
    - 🚫 Adding "mode": "directLake" to table object (causes deployment failure)
    - 🚫 Using lakehouse name instead of SQL Analytics Endpoint ID in Sql.Database()
    - 🚫 Missing partitions array (DirectLake requires partitions)
    - 🚫 Wrong expressionSource value (must be "DatabaseQuery")
    
    ## Step-by-Step DirectLake Creation Process ##
    1. Get lakehouse SQL connection details using get_lakehouse_sql_connection_string
    2. Validate table schema using query_lakehouse_sql_endpoint 
    3. Create TMSL with expressions block and proper partition structure
    4. Deploy using update_model_using_tmsl
    5. Test with execute_dax_query but only against the model name that got created.  Do not query a different model
    ## Notes for creating a new DirectLake Model ##
    - To create a new model, you can use the `update_model_using_tmsl` tool with a TMSL definition that includes the `createOrReplace` for the database object.
    - The TMSL definition should include the structure of the model, including tables, columns, and measures.
    - Ensure you provide a valid dataset name and workspace name when creating a new model.
    - The tool will return a success message or an error if the creation fails.
    - Notes:
    - The TMSL definition should be a valid JSON string.
    - **IMPORTANT**: The Sql.Database function takes two arguments: (1) SQL Analytics Endpoint connection string, (2) SQL Analytics Endpoint ID (NOT the lakehouse name or lakehouse ID).
    - Use `get_lakehouse_sql_connection_string` tool to get the correct endpoint ID for the Sql.Database function.
    - Do not use the same name for the model as the Lakehouse, as this can cause conflicts.
    - Relationships only need the following five properties: `name` , `fromTable` ,  `fromColumn` , `toTable` , `toColumn`
    - Do NOT use the crossFilterBehavior property in relationships.
    - When creating a new model, ensure each table only uses columns from the lakehouse tables and not any other source.  Validate if needed that the table names are not the same as any other source.
    - Do not create a column called rowNumber or rowNum, as this is a reserved name in DirectLake models.
    - When creating a new Directlake model, save the TMSL definition to a file for future reference or updates in the models subfolder.
    - Do not attempt to modify an existing semantic model when asked to create a new semantic model.  This would be bad and may overwrite another model
    
    ## DirectLake Model Creation Checklist - FINAL VERIFICATION ##
    Before deploying any DirectLake model, STOP and verify ALL of these:
    1. ✅ Model has "expressions" section with "DatabaseQuery" M expression ← CRITICAL!
    2. ✅ Sql.Database() function with connection string and SQL Analytics Endpoint ID
    3. ✅ Each table has "partitions" array with at least one partition
    4. ✅ Each partition has "mode": "directLake" (NOT at table level!) ← CRITICAL!
    5. ✅ Each partition has "expressionSource": "DatabaseQuery"
    6. ✅ All column names and data types validated against actual lakehouse tables
    7. ✅ No table object has "mode": "directLake" property (INVALID!) ← CRITICAL!
    
    ## 🚨 REMEMBER: These are the TOP 2 mistakes that break DirectLake models! 🚨
    1. Missing expressions block = Model can't connect to data
    2. Table-level "mode": "directLake" = Invalid TMSL causes deployment failure
    
    ## CRITICAL: Schema Validation Before Model Creation ##
    - **ALWAYS** validate the actual table schemas in the lakehouse BEFORE creating a DirectLake model
    - Use the `query_lakehouse_sql_endpoint` tool to validate column names, data types, and table structures
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
    
    ## Example TMSL Definition for a DirectLake model over Lakehouse tables##
    ## Use this example for guidance when creating a new model ##
    ```json
{
  "createOrReplace": {
    "object": {
      "database": "Example Model"
    },
    "database": {
      "name": "Example Model",
      "id": "4dbcfae6-144f-414b-8c7f-9add626cf5dc",
      "compatibilityLevel": 1604,
      "model": {
        "culture": "en-US",
        "collation": "Latin1_General_100_BIN2_UTF8",
        "dataAccessOptions": {
          "legacyRedirects": true,
          "returnErrorValuesAsNull": true
        },
        "defaultPowerBIDataSourceVersion": "powerBI_V3",
        "sourceQueryCulture": "en-US",
        "tables": [
          {
            "name": "adw_DimDate",
            "lineageTag": "72a8001e-4368-4544-ae91-ccfcad4c3b6b",
            "sourceLineageTag": "[dbo].[adw_DimDate]",
            "dataCategory": "Time",
            "columns": [
              {
                "name": "DateKey",
                "dataType": "int64",
                "sourceColumn": "DateKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "942052a9-3c25-4fdb-8222-98b32821d6a5",
                "sourceLineageTag": "DateKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Date",
                "dataType": "dateTime",
                "isKey": true,
                "sourceColumn": "Date",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "bbc33e32-7291-4de0-8644-81c0f8de27e8",
                "sourceLineageTag": "Date",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DayNumberOfWeek",
                "dataType": "int64",
                "sourceColumn": "DayNumberOfWeek",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "a4c4ed9b-11ce-4cf4-86a1-de3c5380dc51",
                "sourceLineageTag": "DayNumberOfWeek",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DayOfWeek",
                "dataType": "string",
                "sourceColumn": "DayOfWeek",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "f13b1b9f-47ab-4cf0-b56f-ba6f3b64de28",
                "sourceLineageTag": "DayOfWeek",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DayNumberOfMonth",
                "dataType": "int64",
                "sourceColumn": "DayNumberOfMonth",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "92a05de6-ae0a-4f66-99d3-d360e22d1589",
                "sourceLineageTag": "DayNumberOfMonth",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DayNumberOfYear",
                "dataType": "int64",
                "sourceColumn": "DayNumberOfYear",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "23476486-e036-46f4-a0a5-05ae2c6002bc",
                "sourceLineageTag": "DayNumberOfYear",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "WeekNumberOfYear",
                "dataType": "int64",
                "sourceColumn": "WeekNumberOfYear",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "0c0bfbf3-e272-45dd-b847-50f17214d640",
                "sourceLineageTag": "WeekNumberOfYear",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "MonthName",
                "dataType": "string",
                "sourceColumn": "MonthName",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "8963e1c5-27de-4a7d-ad66-67b52377fb32",
                "sourceLineageTag": "MonthName",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "MonthNumberOfYear",
                "dataType": "int64",
                "sourceColumn": "MonthNumberOfYear",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "e681c7d5-c679-4163-afc0-84e223ac0392",
                "sourceLineageTag": "MonthNumberOfYear",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "CalendarQuarter",
                "dataType": "int64",
                "sourceColumn": "CalendarQuarter",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "89fdfde1-4d62-4d7f-bef8-bd22d4780ab4",
                "sourceLineageTag": "CalendarQuarter",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "CalendarYear",
                "dataType": "int64",
                "sourceColumn": "CalendarYear",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "43434f71-4741-41c0-958b-4881ddd2d388",
                "sourceLineageTag": "CalendarYear",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "FiscalQuarter",
                "dataType": "int64",
                "sourceColumn": "FiscalQuarter",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "68450e7e-caf7-45ac-831d-d7cce7244895",
                "sourceLineageTag": "FiscalQuarter",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "FiscalYear",
                "dataType": "int64",
                "sourceColumn": "FiscalYear",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "4456f3ef-bad4-4aab-b61e-f897a1d204f7",
                "sourceLineageTag": "FiscalYear",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Month",
                "dataType": "dateTime",
                "sourceColumn": "Month",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "cf135e47-f9df-4539-935d-dd92d8f0c52c",
                "sourceLineageTag": "Month",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              }
            ],
            "partitions": [
              {
                "name": "adw_DimDate",
                "mode": "directLake",
                "source": {
                  "type": "entity",
                  "entityName": "adw_DimDate",
                  "expressionSource": "DatabaseQuery",
                  "schemaName": "dbo"
                }
              }
            ],
            "annotations": [
              {
                "name": "PBI_ResultType",
                "value": "Table"
              }
            ]
          },
          {
            "name": "adw_DimProduct",
            "lineageTag": "86dbd2db-bb9a-49a8-a6b4-4f27b67b4f73",
            "sourceLineageTag": "[dbo].[adw_DimProduct]",
            "columns": [
              {
                "name": "ProductKey",
                "dataType": "int64",
                "sourceColumn": "ProductKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "a2ff53f5-f9c6-441e-b556-396c846df47c",
                "sourceLineageTag": "ProductKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ProductSubcategoryKey",
                "dataType": "int64",
                "sourceColumn": "ProductSubcategoryKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "162d7095-2ba4-42c6-a0b0-b36d7cf381ab",
                "sourceLineageTag": "ProductSubcategoryKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "WeightUnitMeasureCode",
                "dataType": "string",
                "sourceColumn": "WeightUnitMeasureCode",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "98104f29-c245-496e-8705-ac46844e16fe",
                "sourceLineageTag": "WeightUnitMeasureCode",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SizeUnitMeasureCode",
                "dataType": "string",
                "sourceColumn": "SizeUnitMeasureCode",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "39de8c3c-29de-47ec-b369-0c7909dc3b62",
                "sourceLineageTag": "SizeUnitMeasureCode",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ProductName",
                "dataType": "string",
                "sourceColumn": "ProductName",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "d8de0d56-c937-4608-98dd-34f25ea0e8ad",
                "sourceLineageTag": "ProductName",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "StandardCost",
                "dataType": "double",
                "sourceColumn": "StandardCost",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "31b593f5-94f6-4e9c-b2a5-c786c3c2a07d",
                "sourceLineageTag": "StandardCost",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "Color",
                "dataType": "string",
                "sourceColumn": "Color",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "c171f0dd-6c7d-4021-821a-ffff98830d82",
                "sourceLineageTag": "Color",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SafetyStockLevel",
                "dataType": "int64",
                "sourceColumn": "SafetyStockLevel",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "02e84f63-27d2-4a79-b0fa-b9aded9ea76b",
                "sourceLineageTag": "SafetyStockLevel",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ReorderPoint",
                "dataType": "int64",
                "sourceColumn": "ReorderPoint",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "15266520-4fd6-4b94-be54-4db83a668d28",
                "sourceLineageTag": "ReorderPoint",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ListPrice",
                "dataType": "double",
                "sourceColumn": "ListPrice",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "c45900f0-c35c-4e87-95b2-e01a3228f3f2",
                "sourceLineageTag": "ListPrice",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "Size",
                "dataType": "string",
                "sourceColumn": "Size",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "60011ef5-6ea8-4c82-88fa-5d55b8481c99",
                "sourceLineageTag": "Size",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SizeRange",
                "dataType": "string",
                "sourceColumn": "SizeRange",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "6747aefa-05b1-4f95-baed-cf58f0aaf54d",
                "sourceLineageTag": "SizeRange",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Weight",
                "dataType": "double",
                "sourceColumn": "Weight",
                "sourceProviderType": "float",
                "lineageTag": "233c2ed4-6d50-4c42-aa40-80108b332bcc",
                "sourceLineageTag": "Weight",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "ProductLine",
                "dataType": "string",
                "sourceColumn": "ProductLine",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "2808d2c6-9dc4-4dd5-b8cf-5d4d8d558fef",
                "sourceLineageTag": "ProductLine",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Class",
                "dataType": "string",
                "sourceColumn": "Class",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "7e151d2f-60fc-46f0-ae26-3839172f0330",
                "sourceLineageTag": "Class",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Style",
                "dataType": "string",
                "sourceColumn": "Style",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "8a7f051a-2ddf-4fe0-8644-d70e05eea897",
                "sourceLineageTag": "Style",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Model",
                "dataType": "string",
                "sourceColumn": "Model",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "1f8397af-e91f-43ad-a298-0c4393de6c45",
                "sourceLineageTag": "Model",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Description",
                "dataType": "string",
                "sourceColumn": "Description",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "46b2847d-49cd-46c9-b03c-2c2cddd4cb12",
                "sourceLineageTag": "Description",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "StartDate",
                "dataType": "dateTime",
                "sourceColumn": "StartDate",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "39f333b2-0dac-4559-99f1-bb6139583ef2",
                "sourceLineageTag": "StartDate",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Status",
                "dataType": "string",
                "sourceColumn": "Status",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "ab4ce2a4-e4e9-46ff-853b-b129146e449a",
                "sourceLineageTag": "Status",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              }
            ],
            "partitions": [
              {
                "name": "adw_DimProduct",
                "mode": "directLake",
                "source": {
                  "type": "entity",
                  "entityName": "adw_DimProduct",
                  "expressionSource": "DatabaseQuery",
                  "schemaName": "dbo"
                }
              }
            ],
            "annotations": [
              {
                "name": "PBI_ResultType",
                "value": "Table"
              }
            ]
          },
          {
            "name": "adw_FactInternetSales",
            "lineageTag": "309552d9-5c20-4e12-bc87-bdfbd6e58e62",
            "sourceLineageTag": "[dbo].[adw_FactInternetSales]",
            "columns": [
              {
                "name": "ProductKey",
                "dataType": "int64",
                "sourceColumn": "ProductKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "c1171137-605f-43af-a7df-500c30a33153",
                "sourceLineageTag": "ProductKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "OrderDateKey",
                "dataType": "int64",
                "sourceColumn": "OrderDateKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "6d3b99f8-930e-46ef-997b-61d7a0860a10",
                "sourceLineageTag": "OrderDateKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DueDateKey",
                "dataType": "int64",
                "sourceColumn": "DueDateKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "ae44bad3-5a6c-4c4c-82c5-4d2611467c59",
                "sourceLineageTag": "DueDateKey",
                "summarizeBy": "count",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ShipDateKey",
                "dataType": "int64",
                "sourceColumn": "ShipDateKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "f49aa173-afa0-4d69-bb16-2dd73e2d2b66",
                "sourceLineageTag": "ShipDateKey",
                "summarizeBy": "count",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "CustomerKey",
                "dataType": "int64",
                "sourceColumn": "CustomerKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "ddbee2ea-b33d-4027-b7fa-eb76f93b04f0",
                "sourceLineageTag": "CustomerKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "PromotionKey",
                "dataType": "int64",
                "sourceColumn": "PromotionKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "67d1ced3-ee0f-4e5a-8255-720e6de6bde8",
                "sourceLineageTag": "PromotionKey",
                "summarizeBy": "count",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SalesTerritoryKey",
                "dataType": "int64",
                "sourceColumn": "SalesTerritoryKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "5dfbe804-2464-4377-9473-805e6058e803",
                "sourceLineageTag": "SalesTerritoryKey",
                "summarizeBy": "count",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SalesOrderNumber",
                "dataType": "string",
                "sourceColumn": "SalesOrderNumber",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "a46529a7-d305-4544-a2b9-c0d6ad8e1805",
                "sourceLineageTag": "SalesOrderNumber",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SalesOrderLineNumber",
                "dataType": "int64",
                "sourceColumn": "SalesOrderLineNumber",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "ef7b8c93-07f0-4f34-bd20-8377f828f8bf",
                "sourceLineageTag": "SalesOrderLineNumber",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "RevisionNumber",
                "dataType": "int64",
                "sourceColumn": "RevisionNumber",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "d8945377-d6ad-4f73-9968-8eed9ce956bd",
                "sourceLineageTag": "RevisionNumber",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "OrderQuantity",
                "dataType": "int64",
                "sourceColumn": "OrderQuantity",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "a4e3e3d3-88f5-4341-99f1-2776d1aeacdf",
                "sourceLineageTag": "OrderQuantity",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "UnitPrice",
                "dataType": "double",
                "sourceColumn": "UnitPrice",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "fa426eba-2820-4d59-9f6d-57002422351e",
                "sourceLineageTag": "UnitPrice",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "UnitPriceDiscountPct",
                "dataType": "double",
                "sourceColumn": "UnitPriceDiscountPct",
                "sourceProviderType": "float",
                "lineageTag": "0598985a-6bb8-45d6-98b8-164b63adab06",
                "sourceLineageTag": "UnitPriceDiscountPct",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "DiscountAmount",
                "dataType": "double",
                "sourceColumn": "DiscountAmount",
                "sourceProviderType": "float",
                "lineageTag": "0d72f75c-617b-438b-9211-9063d91db8eb",
                "sourceLineageTag": "DiscountAmount",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "ProductStandardCost",
                "dataType": "double",
                "sourceColumn": "ProductStandardCost",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "ddb6bdc4-a3d4-471b-98e9-e1b1ca6c4c8b",
                "sourceLineageTag": "ProductStandardCost",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "TotalProductCost",
                "dataType": "double",
                "sourceColumn": "TotalProductCost",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "5df1edab-b8ef-4394-86ad-3c43dad1be38",
                "sourceLineageTag": "TotalProductCost",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "SalesAmount",
                "dataType": "double",
                "isHidden": true,
                "sourceColumn": "SalesAmount",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "c40260cb-2fca-4eb6-b928-6c83d1896463",
                "sourceLineageTag": "SalesAmount",
                "summarizeBy": "sum",
                "changedProperties": [
                  {
                    "property": "IsHidden"
                  }
                ],
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "TaxAmt",
                "dataType": "double",
                "sourceColumn": "TaxAmt",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "a9d5d1ee-f68b-43fb-bedf-5958abc440e7",
                "sourceLineageTag": "TaxAmt",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "Freight",
                "dataType": "double",
                "sourceColumn": "Freight",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "c8721a63-d9d3-4e12-b5ff-d4efb7af4514",
                "sourceLineageTag": "Freight",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "OrderDate",
                "dataType": "dateTime",
                "sourceColumn": "OrderDate",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "83301b49-963a-4814-8606-362c6fb9d5e6",
                "sourceLineageTag": "OrderDate",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "DueDate",
                "dataType": "dateTime",
                "sourceColumn": "DueDate",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "4fb7bb7f-5299-446a-9d59-cda9f8cf3c50",
                "sourceLineageTag": "DueDate",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "ShipDate",
                "dataType": "dateTime",
                "sourceColumn": "ShipDate",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "3d5419b4-498a-4da5-97d5-8e69accc1258",
                "sourceLineageTag": "ShipDate",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "SalesID",
                "dataType": "int64",
                "sourceColumn": "SalesID",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "4201c1a9-c794-4333-8078-89e155b8812e",
                "sourceLineageTag": "SalesID",
                "summarizeBy": "count",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "TotalLineAmount",
                "dataType": "double",
                "sourceColumn": "TotalLineAmount",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "8e418b60-5cf5-4888-8ae6-bcbfe6dfbdfa",
                "sourceLineageTag": "TotalLineAmount",
                "summarizeBy": "sum",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              }
            ],
            "partitions": [
              {
                "name": "adw_FactInternetSales",
                "mode": "directLake",
                "source": {
                  "type": "entity",
                  "entityName": "adw_FactInternetSales",
                  "expressionSource": "DatabaseQuery",
                  "schemaName": "dbo"
                }
              }
            ],
            "measures": [
              {
                "name": "Sum of Sales Amount",
                "expression": "SUM(adw_FactInternetSales[SalesAmount])",
                "lineageTag": "68175dc7-b2d0-43d4-a42d-2ef6cc80a38c",
                "changedProperties": [
                  {
                    "property": "Name"
                  }
                ],
                "annotations": [
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              }
            ],
            "annotations": [
              {
                "name": "PBI_ResultType",
                "value": "Table"
              }
            ]
          },
          {
            "name": "adw_DimCustomer",
            "lineageTag": "13c66df3-0000-4331-905b-cc03bc4dd049",
            "sourceLineageTag": "[dbo].[adw_DimCustomer]",
            "columns": [
              {
                "name": "CustomerKey",
                "dataType": "int64",
                "sourceColumn": "CustomerKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "620b83a4-e641-40a2-9e4c-b4892f390d7d",
                "sourceLineageTag": "CustomerKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "GeographyKey",
                "dataType": "int64",
                "sourceColumn": "GeographyKey",
                "formatString": "0",
                "sourceProviderType": "int",
                "lineageTag": "2f4706a8-ed90-45d6-bc60-458239d44589",
                "sourceLineageTag": "GeographyKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "CustomerAlternateKey",
                "dataType": "string",
                "sourceColumn": "CustomerAlternateKey",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "cb20ebe8-6d27-4f74-9790-3ec595b7a261",
                "sourceLineageTag": "CustomerAlternateKey",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Title",
                "dataType": "string",
                "sourceColumn": "Title",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "e75d338e-bae5-4f86-9749-7ba8cfd33f8d",
                "sourceLineageTag": "Title",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "FirstName",
                "dataType": "string",
                "sourceColumn": "FirstName",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "998fe24d-ae44-4750-8ec0-33df5e8ee5b0",
                "sourceLineageTag": "FirstName",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "MiddleName",
                "dataType": "string",
                "sourceColumn": "MiddleName",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "ca5feb05-b350-462f-af1e-d2b51f7b22d3",
                "sourceLineageTag": "MiddleName",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "LastName",
                "dataType": "string",
                "sourceColumn": "LastName",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "fdb4d81a-a247-4645-b821-f73517223322",
                "sourceLineageTag": "LastName",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "NameStyle",
                "dataType": "boolean",
                "sourceColumn": "NameStyle",
                "formatString": "\"TRUE\";\"TRUE\";\"FALSE\"",
                "sourceProviderType": "bit",
                "lineageTag": "392a8ec7-13b5-4f2e-83d7-c1cd038f302c",
                "sourceLineageTag": "NameStyle",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "BirthDate",
                "dataType": "dateTime",
                "sourceColumn": "BirthDate",
                "formatString": "General Date",
                "sourceProviderType": "datetime2",
                "lineageTag": "14df1111-f201-4646-916a-af0378336901",
                "sourceLineageTag": "BirthDate",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "MaritalStatus",
                "dataType": "string",
                "sourceColumn": "MaritalStatus",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "5bb3b5bb-5c8e-4c05-bb6f-1d5f5adf5c6d",
                "sourceLineageTag": "MaritalStatus",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Suffix",
                "dataType": "string",
                "sourceColumn": "Suffix",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "4d436b79-f248-4d9c-93dc-16006bf47da6",
                "sourceLineageTag": "Suffix",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Gender",
                "dataType": "string",
                "sourceColumn": "Gender",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "47d8fb87-0d1a-4114-a757-fe4a7d668882",
                "sourceLineageTag": "Gender",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "YearlyIncome",
                "dataType": "double",
                "sourceColumn": "YearlyIncome",
                "sourceProviderType": "decimal(38, 18)",
                "lineageTag": "0885c704-1108-4dd5-ab33-6661d56eb8a5",
                "sourceLineageTag": "YearlyIncome",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  },
                  {
                    "name": "PBI_FormatHint",
                    "value": "{\"isGeneralNumber\":true}"
                  }
                ]
              },
              {
                "name": "TotalChildren",
                "dataType": "int64",
                "sourceColumn": "TotalChildren",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "3fe1f603-62dc-4334-9777-6f33c08f8766",
                "sourceLineageTag": "TotalChildren",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "NumberChildrenAtHome",
                "dataType": "int64",
                "sourceColumn": "NumberChildrenAtHome",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "d67e0a8f-ee7f-4a26-bf54-d65fc032bded",
                "sourceLineageTag": "NumberChildrenAtHome",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "HouseOwnerFlag",
                "dataType": "string",
                "sourceColumn": "HouseOwnerFlag",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "9111f731-4eab-4c50-a8a3-0bcdbf9aeead",
                "sourceLineageTag": "HouseOwnerFlag",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "NumberCarsOwned",
                "dataType": "int64",
                "sourceColumn": "NumberCarsOwned",
                "formatString": "0",
                "sourceProviderType": "smallint",
                "lineageTag": "47ea03bb-b66e-4f7b-8d5b-dc05b29709d3",
                "sourceLineageTag": "NumberCarsOwned",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "Phone",
                "dataType": "string",
                "sourceColumn": "Phone",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "79ddcf79-d570-4f23-8b87-a264012bc39a",
                "sourceLineageTag": "Phone",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              },
              {
                "name": "CommuteDistance",
                "dataType": "string",
                "sourceColumn": "CommuteDistance",
                "sourceProviderType": "varchar(8000)",
                "lineageTag": "6924ed8b-f742-4da3-8d9b-0f355a214858",
                "sourceLineageTag": "CommuteDistance",
                "summarizeBy": "none",
                "annotations": [
                  {
                    "name": "SummarizationSetBy",
                    "value": "Automatic"
                  }
                ]
              }
            ],
            "partitions": [
              {
                "name": "adw_DimCustomer",
                "mode": "directLake",
                "source": {
                  "type": "entity",
                  "entityName": "adw_DimCustomer",
                  "expressionSource": "DatabaseQuery",
                  "schemaName": "dbo"
                }
              }
            ],
            "measures": [
              {
                "name": "Sum of Sales Previous Year",
                "expression": "CALCULATE([Sum of Sales Amount],PREVIOUSYEAR('adw_DimDate'[DateKey]))",
                "formatString": "0",
                "lineageTag": "3ebad558-e2aa-445e-9e99-8474f77ec6b4",
                "changedProperties": [
                  {
                    "property": "Name"
                  }
                ]
              }
            ],
            "annotations": [
              {
                "name": "PBI_ResultType",
                "value": "Table"
              }
            ]
          }
        ],
        "relationships": [
          {
            "name": "d9226d38-f037-c83b-a932-9ab21f4935e8",
            "fromTable": "adw_FactInternetSales",
            "fromColumn": "CustomerKey",
            "toTable": "adw_DimCustomer",
            "toColumn": "CustomerKey"
          },
          {
            "name": "46c55ce8-22da-1638-78e3-7b8aeea536e2",
            "fromTable": "adw_FactInternetSales",
            "fromColumn": "OrderDateKey",
            "toTable": "adw_DimDate",
            "toColumn": "DateKey"
          },
          {
            "name": "98943d71-ee3b-79cb-fde5-a1c7e1f5d54a",
            "fromTable": "adw_FactInternetSales",
            "fromColumn": "ProductKey",
            "toTable": "adw_DimProduct",
            "toColumn": "ProductKey"
          }
        ],
        "cultures": [
          {
            "name": "en-US",
            "linguisticMetadata": {
              "content": {
                "Version": "1.0.0",
                "Language": "en-US"
              },
              "contentType": "json"
            }
          }
        ],
        "expressions": [
          {
            "name": "DatabaseQuery",
            "kind": "m",
            "expression": [
              "let",
              "    database = Sql.Database(\"XPKYMSTTIHXELP6VUO2W5YWT2U-7PHWH7QE5M2URFHPRJS5XVPNCM.datawarehouse.fabric.microsoft.com\", \"1cac16a7-72fa-43eb-bd8d-02901038f12a\")",
              "in",
              "    database"
            ],
            "lineageTag": "7ac95c35-b351-4d46-9f17-cad02e2ee81f",
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
            "name": "PBIDesktopVersion",
            "value": "2.146.7742.2 (Main)+d57fcea754f2b31db2a6b627cd49dc54ee4973e5"
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
```
