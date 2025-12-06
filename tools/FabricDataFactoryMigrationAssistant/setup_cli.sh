#!/bin/bash
# Quick start script for ADF to Fabric CLI Migration Tool

echo "=================================="
echo "ADF to Fabric Migration CLI - Setup"
echo "=================================="

# Check Python version
echo ""
echo "Checking Python version..."
python3 --version || { echo "Error: Python 3 not found"; exit 1; }

# Check Azure CLI
echo ""
echo "Checking Azure CLI..."
az version > /dev/null 2>&1 || { echo "Warning: Azure CLI not found. Install from https://aka.ms/azure-cli"; }

# Install the library
echo ""
echo "Installing adf_fabric_migrator library..."
pip install -e . || { echo "Error: Failed to install library"; exit 1; }

# Install additional dependencies
echo ""
echo "Installing CLI dependencies..."
pip install requests || { echo "Error: Failed to install requests"; exit 1; }

# Check Azure login
echo ""
echo "Checking Azure authentication..."
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Not logged in to Azure. Please run: az login"
else
    echo "✓ Logged in to Azure"
    az account show --query "{Subscription:name, TenantId:tenantId}" -o table
fi

echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Quick Start Commands:"
echo ""
echo "1. Analyze an ARM template:"
echo "   python cli_migrator.py analyze <template.json>"
echo ""
echo "2. Generate migration profile:"
echo "   python cli_migrator.py profile <template.json> --output profile.json"
echo ""
echo "3. Perform migration (dry run):"
echo "   python cli_migrator.py migrate <template.json> --workspace-id <id> --dry-run"
echo ""
echo "4. Get help:"
echo "   python cli_migrator.py --help"
echo ""
echo "See CLI_README.md for detailed documentation."
echo ""
