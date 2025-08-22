# Best Practice Analyzer (BPA) for Semantic Models

The Semantic Model MCP Server now includes a comprehensive Best Practice Analyzer that evaluates Power BI and Analysis Services tabular models against industry best practices.

## 🎯 Overview

The BPA analyzes TMSL (Tabular Model Scripting Language) definitions and identifies potential issues across multiple categories:

- **Performance** - Optimization recommendations
- **DAX Expressions** - Best practices for DAX syntax  
- **Maintenance** - Model maintainability guidelines
- **Naming Conventions** - Consistent naming standards
- **Formatting** - Proper formatting and display properties
- **Error Prevention** - Common pitfalls to avoid

## 🔧 Available Tools

### Core Analysis Tools

#### `analyze_model_bpa(workspace_name, dataset_name)`
Analyzes a deployed semantic model for BPA violations.

```python
# Analyze a specific model
result = analyze_model_bpa("Sales Workspace", "Sales Model")
```

#### `analyze_tmsl_bpa(tmsl_definition)`
Analyzes TMSL definition directly without requiring a deployed model.
**Automatically handles JSON formatting issues** including carriage returns, escaped quotes, and nested JSON strings.

```python
# Analyze TMSL during development - handles formatting automatically
result = analyze_tmsl_bpa(tmsl_json_string)  # Works with raw or escaped JSON
```

### Reporting Tools

#### `generate_bpa_report(workspace_name, dataset_name, format_type)`
Generates comprehensive BPA reports in different formats.

```python
# Summary report (recommended for overview)
report = generate_bpa_report("Sales Workspace", "Sales Model", "summary")

# Detailed report (all violations)
report = generate_bpa_report("Sales Workspace", "Sales Model", "detailed")

# Grouped by category
report = generate_bpa_report("Sales Workspace", "Sales Model", "by_category")
```

### Filtering Tools

#### `get_bpa_violations_by_severity(severity)`
Filter violations by severity level.

```python
# Get critical errors only
errors = get_bpa_violations_by_severity("ERROR")

# Get warnings
warnings = get_bpa_violations_by_severity("WARNING")

# Get informational suggestions
info = get_bpa_violations_by_severity("INFO")
```

#### `get_bpa_violations_by_category(category)`
Filter violations by category.

```python
# Get performance issues
perf_issues = get_bpa_violations_by_category("Performance")

# Get DAX-related issues
dax_issues = get_bpa_violations_by_category("DAX Expressions")
```

### Information Tools

#### `get_bpa_rules_summary()`
Get overview of loaded BPA rules.

#### `get_bpa_categories()`
List available categories and severity levels.

## 📊 Severity Levels

| Level | Name | Description |
|-------|------|-------------|
| 3 | ERROR | Critical issues that should be fixed immediately |
| 2 | WARNING | Potential issues that should be addressed |
| 1 | INFO | Suggestions for improvement |

## 🏷️ Rule Categories

### Performance
Optimization recommendations including:
- Avoid floating point data types
- Minimize calculated columns
- Optimize relationships
- Partition large tables
- Reduce Power Query transformations

### DAX Expressions  
Best practices for DAX including:
- Use fully qualified column references
- Use unqualified measure references
- Use DIVIDE() instead of "/" operator
- Avoid IFERROR() function
- Proper time intelligence patterns

### Maintenance
Model maintainability including:
- Add descriptions to objects
- Ensure tables have relationships
- Remove unused objects
- Proper documentation

### Naming Conventions
Consistent naming including:
- No special characters in names
- Proper capitalization
- Consistent naming patterns
- Trim whitespace

### Formatting
Display and formatting including:
- Format strings for measures
- Hide foreign keys
- Mark primary keys
- Proper data categorization
- Date/time formatting

## 📝 Example Usage

### Basic Analysis Workflow

```python
# 1. Analyze a model
analysis = analyze_model_bpa("MyWorkspace", "MyDataset")

# 2. Generate summary report
report = generate_bpa_report("MyWorkspace", "MyDataset", "summary")

# 3. Focus on critical issues
errors = get_bpa_violations_by_severity("ERROR")

# 4. Address performance issues
perf_issues = get_bpa_violations_by_category("Performance")
```

### Development Workflow

```python
# 1. Get model definition
tmsl = get_model_definition("MyWorkspace", "MyDataset")

# 2. Analyze TMSL directly
analysis = analyze_tmsl_bpa(tmsl)

# 3. Fix issues and re-analyze
# ... make changes to TMSL ...
reanalysis = analyze_tmsl_bpa(updated_tmsl)

# 4. Deploy when clean
update_model_using_tmsl("MyWorkspace", "MyDataset", updated_tmsl)
```

## 🚨 Common Violations and Fixes

### Performance Issues

**❌ Issue**: Using `double` data type
```json
{
  "name": "SalesAmount",
  "dataType": "double"
}
```

**✅ Fix**: Use `decimal` data type
```json
{
  "name": "SalesAmount", 
  "dataType": "decimal"
}
```

**❌ Issue**: Foreign keys not hidden
```json
{
  "name": "ProductKey",
  "isHidden": false
}
```

**✅ Fix**: Hide foreign keys
```json
{
  "name": "ProductKey",
  "isHidden": true
}
```

### DAX Expression Issues

**❌ Issue**: Using "/" operator
```dax
Average Price = [Total Sales] / [Total Quantity]
```

**✅ Fix**: Use DIVIDE function
```dax
Average Price = DIVIDE([Total Sales], [Total Quantity])
```

**❌ Issue**: Unqualified column references
```dax
Total Sales = SUM(SalesAmount)
```

**✅ Fix**: Fully qualified column references
```dax
Total Sales = SUM(Sales[SalesAmount])
```

### Formatting Issues

**❌ Issue**: Missing format string for measures
```json
{
  "name": "Total Sales",
  "expression": "SUM(Sales[SalesAmount])"
}
```

**✅ Fix**: Add format string
```json
{
  "name": "Total Sales",
  "expression": "SUM(Sales[SalesAmount])",
  "formatString": "#,0"
}
```

## 📚 Integration with Other Tools

The BPA works seamlessly with other MCP server tools:

```python
# 1. Research best practices
docs = search_learn_microsoft_content("DAX best practices")

# 2. Get model definition
tmsl = get_model_definition("MyWorkspace", "MyDataset")

# 3. Analyze for issues
violations = analyze_tmsl_bpa(tmsl)

# 4. Generate DirectLake template with best practices
template = generate_directlake_tmsl_template(workspace_id, lakehouse_id, ["table1"], "MyModel")

# 5. Validate before deployment
validation = update_model_using_tmsl("MyWorkspace", "MyModel", template, validate_only=True)

# 6. Analyze the new model
final_analysis = analyze_model_bpa("MyWorkspace", "MyModel")
```

## 🔍 Rule Details

The BPA includes 71 rules covering various aspects of semantic model development. Each rule includes:

- **Unique ID** for tracking
- **Descriptive name** with category prefix
- **Detailed description** with references
- **Severity level** (1-3)
- **Scope** (which objects it applies to)
- **Expression** for evaluation logic
- **Fix expression** (where applicable)

Rules are based on:
- Microsoft official documentation
- Industry best practices
- Performance optimization research
- Common anti-patterns to avoid

## 🎯 Best Practices

1. **Run BPA early and often** during development
2. **Focus on ERROR severity first**, then WARNING, then INFO
3. **Address Performance issues** for better user experience
4. **Fix DAX Expression issues** for maintainable code
5. **Use the validation-first workflow** with TMSL updates
6. **Document your model** with descriptions and proper naming
7. **Integrate BPA analysis** into your CI/CD pipeline

## 📖 References

- [TMSL Reference Documentation](https://learn.microsoft.com/en-us/analysis-services/tmsl/tmsl-reference-tabular-objects)
- [DAX Best Practices](https://learn.microsoft.com/en-us/dax/)
- [Power BI Performance Optimization](https://learn.microsoft.com/en-us/power-bi/guidance/)
- [Tabular Model Best Practices](https://learn.microsoft.com/en-us/analysis-services/tabular-models/)

The BPA helps ensure your semantic models follow industry standards and Microsoft recommendations for optimal performance, maintainability, and user experience.
