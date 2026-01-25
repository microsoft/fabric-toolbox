#!/bin/bash

# Fabric Assessment Tool CLI Demo Script
# This script demonstrates the complete workflow of Fabric Assessment Tool

echo "=== Fabric Assessment Tool CLI Demo ==="
echo

# 1. Show help
echo "1. Showing main help:"
ll --help
echo

# 2. Show assess command help
echo "2. Showing assess command help:"
fat assess--help
echo

# 3. Run an assessment
echo "3. Running Synapse assessment:"
fat assess--source synapse --mode full --ws demo-workspace1,demo-workspace2 -o /tmp/structured_assessment --format json
echo

# 4. Show assessment results
echo "4. Assessment results (all json files returned):"
find /tmp/structured_assessment -type f -name "*.json" | head -20
tree /tmp/structured_assessment
cat /tmp/structured_assessment/test-structured-workspace/summary.json
echo

# 5. Run a Databricks assessment (with environment variables)
echo "5. Testing Databricks assessment with mock credentials:"
DATABRICKS_WORKSPACE_URL="https://demo.cloud.databricks.com" \
DATABRICKS_ACCESS_TOKEN="demo-token" \
fat assess--source databricks --mode full --ws demo-databricks -o /tmp/databricks_assessment.json
echo

echo "=== Demo Complete ==="