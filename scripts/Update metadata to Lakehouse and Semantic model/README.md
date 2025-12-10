# Microsoft Fabric Metadata Management Toolkit

A comprehensive collection of Python notebooks and scripts for automating metadata management across Microsoft Fabric Lakehouses and Power BI Semantic Models.

## 🎯 Objective

Metadata is the backbone of effective data governance and AI-powered analytics. Rich, accurate descriptions of tables and columns are critical for:

- **Power BI Copilot**: Enables natural language queries by understanding your data semantics
- **Data Discovery**: Helps users quickly find and understand available datasets
- **Data Governance**: Maintains consistent documentation across your data estate
- **Self-Service Analytics**: Empowers business users to work independently with clear data definitions
- **Compliance**: Ensures proper documentation for regulatory requirements

This toolkit automates the tedious process of metadata management, enabling you to:
- Create Fabric Lakehouse tables directly from a data catalog (Excel)
- Synchronize metadata from Excel to Lakehouse tables
- Push metadata from Excel to Power BI Semantic Models
- Propagate metadata from Lakehouse to Semantic Models

By automating these workflows, you can maintain consistent, up-to-date metadata across your entire Microsoft Fabric ecosystem.

## 📋 Prerequisites

Before using this toolkit, ensure you have:

### Environment Requirements
- **Microsoft Fabric workspace** with appropriate permissions
- **Fabric Lakehouse** created in your workspace
- **Power BI Semantic Model** (formerly Dataset) connected to your Lakehouse
- Access to run **Fabric Notebooks** (PySpark environment)

### Python Packages
- `pandas` - For Excel file processing
- `pyspark` - For Lakehouse operations
- `semantic-link-labs` - For Semantic Model operations (install via: `%pip install semantic-link-labs`)

### Data Catalog
- An **Excel file** containing your data catalog with the following columns:
  - `Logical Table Name` - Name of the table
  - `Logical Field Name` - Name of the column/field
  - `Database Datatype` - Data type (e.g., varchar, int, decimal)
  - `Data Team Definition` - Description/documentation for the field

### Permissions
- **Write access** to Fabric Lakehouse
- **Write access** to Power BI Semantic Model
- Ability to execute SQL commands in Lakehouse
- Ability to modify Semantic Model metadata via TOM (Tabular Object Model)

## 📁 Repository Contents

### 1. `Create lakehouse tables from data catalog.ipynb`
**Purpose**: Automatically generates Delta tables in a Fabric Lakehouse based on an Excel data catalog.

**What it does**:
- Reads table and column definitions from an Excel file
- Maps SQL Server data types to Spark SQL data types
- Generates `CREATE TABLE` statements with column-level comments
- Creates Delta tables with metadata embedded
- Provides comprehensive logging of success/failures

**Use case**: Bootstrap a new Lakehouse with tables defined in your enterprise data catalog.

### 2. `Update lakehouse metadata from data catalog.ipynb`
**Purpose**: Updates descriptions (comments) for existing Lakehouse tables and columns from an Excel data catalog.

**What it does**:
- Reads metadata from Excel file
- Discovers existing tables in the Lakehouse
- Updates table-level descriptions using `ALTER TABLE` commands
- Updates column-level comments using `ALTER COLUMN COMMENT` commands
- Supports selective table updates via `INCLUDE_TABLES` configuration
- Reports missing tables/columns for validation

**Use case**: Synchronize your Lakehouse metadata with your centralized data catalog documentation.

### 3. `Update metadata from excel to semantic model.ipynb`
**Purpose**: Pushes metadata from an Excel data catalog directly to a Power BI Semantic Model.

**What it does**:
- Loads metadata from Excel file
- Connects to Semantic Model using Tabular Object Model (TOM)
- Updates table descriptions in the Semantic Model
- Updates column descriptions for all matching fields
- Supports optional table filtering via `INCLUDE_TABLES`
- Validates and reports missing tables/columns

**Use case**: Document your Semantic Model directly from your enterprise data catalog for Power BI Copilot and user discovery.

### 4. `Update metadata from lakehouse to semantic model.ipynb`
**Purpose**: Propagates metadata from Lakehouse table/column comments to a Power BI Semantic Model.

**What it does**:
- Harvests table and column comments from Lakehouse using `DESCRIBE TABLE EXTENDED`
- Connects to Semantic Model via TOM
- Synchronizes descriptions from Lakehouse to Semantic Model
- Supports custom table/column name mappings for mismatched names
- Provides detailed logging of updates applied

**Use case**: Maintain a single source of truth in your Lakehouse and automatically propagate metadata to downstream Semantic Models.

### 5. `create table script.sql`
**Purpose**: Sample SQL script demonstrating Delta table creation with proper schema definitions.

**What it does**:
- Provides template `CREATE TABLE` statements
- Shows examples of various data types (BIGINT, STRING, DATE, TIMESTAMP, DECIMAL)
- Includes sample tables for an Auto Claims POC scenario
- Demonstrates proper Delta table syntax

**Use case**: Reference implementation for manual table creation or testing.

## 🚀 Getting Started

### Step 1: Prepare Your Data Catalog
Create an Excel file with columns: `Logical Table Name`, `Logical Field Name`, `Database Datatype`, `Data Team Definition`

### Step 2: Configure Notebooks
Open each notebook and update the configuration section:
```python
WORKSPACE_NAME = "YourWorkspaceName"
SEMANTIC_MODEL_NAME = "YourSemanticModelName"
LAKEHOUSE_DATABASE = "YourLakehouse.dbo"
EXCEL_FILE_PATH = "abfss://...path-to-your-excel..."
INCLUDE_TABLES = []  # Optional: filter specific tables
```

### Step 3: Run Notebooks in Sequence
1. **Create tables** (if starting fresh): `Create lakehouse tables from data catalog.ipynb`
2. **Update Lakehouse metadata**: `Update lakehouse metadata from data catalog.ipynb`
3. **Update Semantic Model** (choose one):
   - From Excel: `Update metadata from excel to semantic model.ipynb`
   - From Lakehouse: `Update metadata from lakehouse to semantic model.ipynb`

### Step 4: Verify
Check your Lakehouse tables and Semantic Model to confirm descriptions are properly applied.

## 🔧 Configuration Options

### Table Filtering
Use `INCLUDE_TABLES` to process specific tables:
```python
INCLUDE_TABLES = ["customer", "sales", "products"]
```

### Name Mapping (Lakehouse to Semantic Model)
If table/column names differ between Lakehouse and Semantic Model:
```python
TABLE_NAME_MAP = {
    "Dim Customer": "dim_customer",
    "Fact Sales": "fact_sales"
}
COLUMN_NAME_MAP = {
    ("Dim Customer", "CustomerId"): "cust_id",
}
```

## 📊 Expected Output

Each notebook provides detailed execution summaries:
- Total tables/columns processed
- Successful updates count
- Missing tables/columns warnings
- Error details for troubleshooting

Example output:
```
================================================================================
EXECUTION SUMMARY
================================================================================

Total tables in Excel: 15
Tables updated: 15
Column descriptions updated: 127

✓ All tables and columns from Excel were found and updated!
✓ Description update completed!
```

## ⚠️ Important Notes

- **Backup**: Always test on non-production environments first
- **Quote Escaping**: The notebooks handle single quotes in descriptions automatically
- **Case Sensitivity**: Table/column matching is case-insensitive
- **Permissions**: Ensure you have write access to both Lakehouse and Semantic Model
- **Excel Format**: Keep Excel file in the expected format with required columns

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, fork the repository, and create pull requests for:
- Bug fixes
- New features
- Documentation improvements
- Additional use cases

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built for the Microsoft Fabric community
- Leverages `semantic-link-labs` library
- Inspired by real-world data governance challenges

## 📧 Support

For questions, issues, or feedback:
- Open an issue in this repository
- Contribute to discussions
- Share your use cases and improvements

## 🔗 Related Resources

- [Microsoft Fabric Documentation](https://learn.microsoft.com/fabric/)
- [Power BI Semantic Models](https://learn.microsoft.com/power-bi/connect-data/service-datasets-understand)
- [semantic-link-labs](https://github.com/microsoft/semantic-link-labs)
- [Tabular Object Model (TOM)](https://learn.microsoft.com/analysis-services/tom/introduction-to-the-tabular-object-model-tom-in-analysis-services-amo)

---

⭐ If this toolkit helps you, please star the repository and share it with others in the Fabric community!
