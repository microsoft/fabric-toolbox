# Fabric Load Test Tool

A comprehensive tool for performance testing Microsoft Fabric semantic models under concurrent load conditions. This tool enables you to simulate multiple users querying your semantic models simultaneously and analyze performance metrics to identify bottlenecks and optimize your data models.

## 🎯 What This Tool Does

- **Concurrent Load Testing**: Simulates multiple users executing DAX queries simultaneously against your semantic models
- **Real Query Scenarios**: Uses actual DAX queries captured from Power BI Performance Analyzer for realistic testing
- **Performance Metrics**: Captures detailed timing and performance data for analysis
- **Row-Level Security (RLS) Testing**: Supports testing with different user contexts and security roles
- **Scalable Testing**: Configurable thread counts and VM sizing for different load scenarios
- **Results Logging**: Comprehensive logging of test results to Fabric Lakehouse for analysis

## 📋 Prerequisites

- Microsoft Fabric workspace with appropriate permissions
- Power BI semantic model to test
- Access to create and manage Fabric Lakehouses and Notebooks

## 🚀 Quick Start

### Method 1: Download Notebooks Manually

1. **Download the notebooks** from this repository:
   - `RunLoadTest.ipynb` - Main load testing notebook
   - `RunPerfScenario.ipynb` - Individual scenario execution notebook

2. **Import to your Fabric workspace** by uploading the `.ipynb` files

### Method 2: Auto-Install Using Semantic Link Labs (Recommended)

Create a new Fabric notebook and run this code to automatically download the load test notebooks:

```python
%pip install -q --disable-pip-version-check semantic-link-labs
import sempy_labs as labs
labs.import_notebook_from_web(overwrite=True, notebook_name="RunLoadTest", url="https://raw.githubusercontent.com/microsoft/fabric-toolbox/main/tools/FabricLoadTestTool/RunLoadTest.ipynb")
labs.import_notebook_from_web(overwrite=True, notebook_name="RunPerfScenario", url="https://raw.githubusercontent.com/microsoft/fabric-toolbox/main/tools/FabricLoadTestTool/RunPerfScenario.ipynb")
```

After running this code, delete the temporary notebook used for importing.

## 🛠️ Setup Instructions

### Step 1: Prepare Your Test Data

1. **Get sample data** (optional):
   - Download sample datasets from [Microsoft Learn](https://learn.microsoft.com/en-us/power-bi/create-reports/sample-datasets#install-built-in-samples)
   - Upload the PBIX file to your target Fabric workspace

### Step 2: Capture DAX Queries

1. **Open your report** in the Power BI Web Service
2. **Download a live connection copy**:
   - Click "File" → "Download this file"
   - Select "A copy of your report with a live connection to data online (.pbix)"
3. **Open in Power BI Desktop** and capture queries:
   - Start **Performance Analyzer** (View tab → Performance Analyzer)
   - **Interact with your report** to generate the queries you want to test
   - Try to create a variety of queries (different visuals, filters, etc.)
   - **Export** the `PowerBIPerformanceData.json` file when done
4. **Close Power BI Desktop**

### Step 3: Create Storage Lakehouse

1. **Create a new Lakehouse** in your Fabric workspace
2. **Create folder structure**:
   - Navigate to Files section
   - Create subfolder: `PerfScenarios/Queries`
3. **Upload query file**:
   - Upload the `PowerBIPerformanceData.json` file to the `PerfScenarios/Queries` folder

### Step 4: Configure Notebooks

#### Configure RunPerfScenario Notebook:
1. Open the `RunPerfScenario` notebook
2. **Connect to Lakehouse**:
   - In Explorer Panel, click Items ellipsis → "Remove all Sources" (if any exist)
   - Click "Add data items" → select your Lakehouse from Step 3
3. **Save and close** (no code changes needed)

#### Configure RunLoadTest Notebook:
1. Open the `RunLoadTest` notebook
2. **Connect to Lakehouse** (same process as above)
3. **Configure test parameters** in the notebook:

```python
load_test_name = "My Performance Test"                    # Name for your test run
dataset = "Customer Profitability Sample PBIX"           # Your semantic model name
workspace = "My Fabric Workspace"                        # Workspace containing the model
queryfile = "/lakehouse/default/Files/PerfScenarios/Queries/PowerBIPerformanceData.json"
concurrent_threads = 3                                    # Number of concurrent users
delay_sec = 4                                            # Seconds between iterations
iterations = 1                                           # Iterations per user
```

## ⚡ Running Load Tests

### Basic Execution:
1. Open the configured `RunLoadTest` notebook
2. **Review parameters** in the first code cell
3. **Run the second code cell** to start the load test
4. **Monitor progress** and review results

### Scaling for Higher Concurrency:
For tests requiring more than 4 concurrent threads, add this configuration cell at the beginning:

```python
%%configure -f
{
    "vCores": 16  # Options: 4, 8, 16, 32, 64
}
```

> **Note**: Higher vCore counts increase startup time but allow for more concurrent testing.

## 🔐 Row-Level Security (RLS) Testing

To test with RLS enabled:

1. **Prepare user accounts**:
   - Ensure test users have **View** permissions on the Fabric workspace
   - Add all test users to appropriate security roles in your semantic model

2. **Configure users in notebook**:
   - Add UPN email addresses to the `users` variable in `RunLoadTest`
   - Can be hardcoded or read from a file

```python
users = [
    "user1@contoso.com",
    "user2@contoso.com",
    "user3@contoso.com"
]
```

## 📊 Understanding Results

The tool logs comprehensive performance data to your Lakehouse:
- **Query execution times**
- **Thread performance metrics**
- **Error rates and details**
- **Concurrent user simulation results**

Results are stored in Delta tables for easy analysis and visualization.

## 📹 Video Tutorial

Watch the complete setup and execution walkthrough: [Fabric Load Testing Tutorial](https://youtu.be/0rSTDeC75vw)

## 🤝 Contributing

This is an open-source project. Contributions are welcome!
- Submit bug reports and feature requests via Issues
- Submit improvements via Pull Requests
- Follow the project's coding standards and guidelines

## 📄 License

This project is part of the Microsoft Fabric Toolbox and follows the repository's licensing terms.
