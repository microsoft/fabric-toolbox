"""
Test script for the Best Practice Analyzer functionality
"""

import json
import os
import sys

# Add the server directory to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from core.bpa_service import BPAService

def test_bpa_functionality():
    """Test the BPA functionality with a sample TMSL"""
    
    print("🧪 Testing Best Practice Analyzer Functionality")
    print("=" * 60)
    
    # Initialize BPA service
    bpa_service = BPAService(current_dir)
    
    # Test 1: Check if rules are loaded
    print("\n📋 Test 1: Checking BPA Rules Loading")
    rules_summary = bpa_service.get_rules_summary()
    print(f"Total rules loaded: {rules_summary.get('total_rules', 0)}")
    
    if rules_summary.get('error'):
        print(f"❌ Error loading rules: {rules_summary['error']}")
        return
    
    print("✅ Rules loaded successfully!")
    print(f"Categories: {list(rules_summary.get('categories', {}).keys())}")
    print(f"Severities: {list(rules_summary.get('severities', {}).keys())}")
    
    # Test 2: Test with a simple TMSL that should trigger some violations
    print("\n🔍 Test 2: Testing BPA Analysis with Sample TMSL")
    
    sample_tmsl = {
        "create": {
            "database": {
                "name": "TestModel",
                "id": "TestModel",
                "compatibilityLevel": 1600,
                "model": {
                    "culture": "en-US",
                    "tables": [
                        {
                            "name": "Sales",
                            "columns": [
                                {
                                    "name": "SalesAmount",
                                    "dataType": "double",  # This should trigger AVOID_FLOATING_POINT_DATA_TYPES
                                    "sourceColumn": "SalesAmount"
                                },
                                {
                                    "name": "ProductKey",
                                    "dataType": "int64",
                                    "sourceColumn": "ProductKey",
                                    "isHidden": False  # Foreign key should be hidden
                                }
                            ],
                            "partitions": [
                                {
                                    "name": "Partition1",  # Should match table name for single partition
                                    "source": {
                                        "type": "m",
                                        "expression": "let Source = Table.FromRows({}) in Source"
                                    }
                                }
                            ],
                            "measures": [
                                {
                                    "name": "Total Sales",  # Missing format string
                                    "expression": "SUM(Sales[SalesAmount])"
                                },
                                {
                                    "name": "Average Sales",
                                    "expression": "[Total Sales] / COUNT(Sales[ProductKey])"  # Should use DIVIDE function
                                }
                            ]
                        }
                    ]
                }
            }
        }
    }
    
    # Convert to JSON string
    tmsl_json = json.dumps(sample_tmsl)
    
    # Run analysis
    analysis_result = bpa_service.analyze_model_from_tmsl(tmsl_json)
    
    if analysis_result.get('error'):
        print(f"❌ Analysis failed: {analysis_result['error']}")
        return
    
    violations = analysis_result.get('violations', [])
    summary = analysis_result.get('summary', {})
    
    print(f"✅ Analysis completed!")
    print(f"Total violations found: {summary.get('total_violations', 0)}")
    
    # Test 3: Display violations by category
    print("\n📊 Test 3: Violations by Category")
    for category, count in summary.get('by_category', {}).items():
        print(f"  {category}: {count} violations")
    
    # Test 4: Display violations by severity
    print("\n🚨 Test 4: Violations by Severity")
    for severity, count in summary.get('by_severity', {}).items():
        print(f"  {severity}: {count} violations")
    
    # Test 5: Show sample violations
    print("\n🔍 Test 5: Sample Violations (first 3)")
    for i, violation in enumerate(violations[:3]):
        print(f"\n  Violation {i+1}:")
        print(f"    Rule: {violation['rule_name']}")
        print(f"    Severity: {violation['severity']}")
        print(f"    Object: {violation['object_name']} ({violation['object_type']})")
        print(f"    Description: {violation['description'][:100]}...")
        if violation.get('fix_expression'):
            print(f"    Fix: {violation['fix_expression']}")
    
    # Test 6: Test category filtering
    print("\n🏷️ Test 6: Testing Category Filtering")
    categories = bpa_service.get_available_categories()
    if categories:
        test_category = categories[0]
        category_violations = bpa_service.get_violations_by_category(test_category)
        print(f"Found {len(category_violations)} violations in '{test_category}' category")
    
    print("\n🎉 All tests completed successfully!")
    print("The Best Practice Analyzer is working correctly!")

if __name__ == "__main__":
    test_bpa_functionality()
