"""
Example usage of the Best Practice Analyzer tools
"""

import json

# Example TMSL that demonstrates various BPA rule violations
sample_tmsl_with_issues = {
    "create": {
        "database": {
            "name": "SampleModel",
            "id": "SampleModel", 
            "compatibilityLevel": 1600,
            "model": {
                "culture": "en-US",
                "tables": [
                    {
                        "name": "FactSales",
                        "columns": [
                            {
                                "name": "SalesAmount",
                                "dataType": "double",  # BPA: Should use decimal instead of double
                                "sourceColumn": "SalesAmount",
                                "summarizeBy": "sum"  # BPA: Numeric columns should not summarize
                            },
                            {
                                "name": "ProductKey",
                                "dataType": "int64",
                                "sourceColumn": "ProductKey",
                                "isHidden": False  # BPA: Foreign keys should be hidden
                            },
                            {
                                "name": "OrderDate",
                                "dataType": "dateTime",
                                "sourceColumn": "OrderDate"
                                # BPA: Missing format string for date columns
                            }
                        ],
                        "partitions": [
                            {
                                "name": "WrongPartitionName",  # BPA: Should match table name for single partition
                                "source": {
                                    "type": "m",
                                    "expression": "let Source = Table.FromRows({}) in Source"
                                }
                            }
                        ],
                        "measures": [
                            {
                                "name": "TotalSales",
                                "expression": "SUM(FactSales[SalesAmount])"
                                # BPA: Missing format string for measures
                            },
                            {
                                "name": "AverageSales", 
                                "expression": "[TotalSales] / COUNT(FactSales[ProductKey])"  # BPA: Should use DIVIDE function
                            },
                            {
                                "name": "ErrorProneCalc",
                                "expression": "IFERROR(1/0, BLANK())"  # BPA: Avoid IFERROR function
                            }
                        ]
                    },
                    {
                        "name": "DimProduct",
                        "columns": [
                            {
                                "name": "ProductKey",
                                "dataType": "int64", 
                                "sourceColumn": "ProductKey",
                                "isKey": False  # BPA: Should mark primary keys
                            },
                            {
                                "name": "ProductName",
                                "dataType": "string",
                                "sourceColumn": "ProductName"
                                # BPA: Missing description for visible objects
                            }
                        ],
                        "partitions": [
                            {
                                "name": "DimProduct",
                                "source": {
                                    "type": "m", 
                                    "expression": "let Source = Table.FromRows({}) in Source"
                                }
                            }
                        ]
                    }
                ],
                "relationships": [
                    {
                        "name": "FactSales_DimProduct",
                        "fromTable": "FactSales",
                        "fromColumn": "ProductKey",
                        "toTable": "DimProduct", 
                        "toColumn": "ProductKey",
                        "fromCardinality": "many",
                        "toCardinality": "one",
                        "crossFilteringBehavior": "oneDirection"
                    }
                ]
            }
        }
    }
}

def show_bpa_examples():
    """Show examples of how to use BPA tools"""
    
    print("🔍 Best Practice Analyzer - Example Usage")
    print("=" * 60)
    
    # Convert TMSL to JSON string
    tmsl_json = json.dumps(sample_tmsl_with_issues, indent=2)
    
    print("\n📋 Example 1: Basic BPA Analysis")
    print("# To analyze a deployed model:")
    print('result = analyze_model_bpa("MyWorkspace", "MyDataset")')
    print("\n# To analyze TMSL directly:")
    print('result = analyze_tmsl_bpa(tmsl_definition)')
    
    print("\n📊 Example 2: Generate Comprehensive Report")
    print('# Generate summary report')
    print('report = generate_bpa_report("MyWorkspace", "MyDataset", "summary")')
    print('\n# Generate detailed report')
    print('report = generate_bpa_report("MyWorkspace", "MyDataset", "detailed")')
    print('\n# Generate report grouped by category')
    print('report = generate_bpa_report("MyWorkspace", "MyDataset", "by_category")')
    
    print("\n🚨 Example 3: Filter by Severity")
    print('# Get only critical errors')
    print('errors = get_bpa_violations_by_severity("ERROR")')
    print('\n# Get warnings')
    print('warnings = get_bpa_violations_by_severity("WARNING")')
    print('\n# Get informational suggestions')
    print('info = get_bpa_violations_by_severity("INFO")')
    
    print("\n🏷️ Example 4: Filter by Category")
    print('# Get performance-related issues')
    print('perf_issues = get_bpa_violations_by_category("Performance")')
    print('\n# Get DAX expression issues')
    print('dax_issues = get_bpa_violations_by_category("DAX Expressions")')
    print('\n# Get formatting issues')
    print('format_issues = get_bpa_violations_by_category("Formatting")')
    
    print("\n📈 Example 5: Get Available Options")
    print('# Get overview of BPA rules')
    print('summary = get_bpa_rules_summary()')
    print('\n# Get available categories and severities')
    print('categories = get_bpa_categories()')
    
    print("\n💡 Common BPA Violations Found in This Example:")
    violations_examples = [
        "❌ Using 'double' data type instead of 'decimal'",
        "❌ Numeric columns set to summarize instead of 'None'", 
        "❌ Foreign keys not hidden",
        "❌ Missing format strings for date columns",
        "❌ Missing format strings for measures",
        "❌ Using '/' operator instead of DIVIDE function",
        "❌ Using IFERROR function (performance issue)",
        "❌ Partition name doesn't match table name",
        "❌ Primary keys not marked with isKey = true",
        "❌ Missing descriptions for visible objects"
    ]
    
    for violation in violations_examples:
        print(f"  {violation}")
    
    print("\n✅ Best Practices to Follow:")
    best_practices = [
        "✅ Use 'decimal' data type for financial amounts",
        "✅ Set SummarizeBy = 'None' for numeric columns",
        "✅ Hide foreign key columns",
        "✅ Provide format strings for all measures and date columns",
        "✅ Use DIVIDE() function instead of '/' operator",
        "✅ Avoid IFERROR() - use DIVIDE() or proper error handling",
        "✅ Match partition names to table names for single partitions",
        "✅ Mark primary key columns with isKey = true",
        "✅ Add descriptions to all visible objects"
    ]
    
    for practice in best_practices:
        print(f"  {practice}")
    
    print(f"\n🔧 Sample TMSL with Issues:")
    print("```json")
    print(json.dumps(sample_tmsl_with_issues, indent=2)[:500] + "...")
    print("```")
    
    print(f"\n📚 Learn More:")
    print("- Use 'search_learn_microsoft_content' to research best practices")
    print("- Check Microsoft Learn for DAX, TMSL, and Power BI documentation")
    print("- The BPA rules are based on industry standards and Microsoft recommendations")

if __name__ == "__main__":
    show_bpa_examples()
