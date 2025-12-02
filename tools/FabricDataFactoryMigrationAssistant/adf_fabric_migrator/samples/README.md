# Migrated JSON Templates for Manual API Calls

This folder contains sample JSON templates that demonstrate the input and output formats for the ADF to Fabric migration process. These templates allow you to manually run the Fabric REST API to create Data Pipelines.

## Contents

| File | Description |
|------|-------------|
| `sample_adf_arm_template.json` | Sample ADF ARM template (input format) |
| `sample_fabric_pipeline.json` | Transformed Fabric Data Pipeline definition (output format) |
| `fabric_api_request_template.json` | Template for the Fabric REST API request |

## How to Use These Templates

### Step 1: Understand the Transformation

The migration tool transforms ADF ARM templates to Fabric Data Pipeline format:

```
sample_adf_arm_template.json  -->  [Migration Tool]  -->  sample_fabric_pipeline.json
```

Key transformations include:
- **Datasets**: Embedded into activities as `datasetSettings`
- **LinkedServices**: Converted to `externalReferences.connection` references
- **Global Parameters**: Transformed to `libraryVariables` with Variable Library references
- **ExecutePipeline**: Changed to `InvokePipeline` with Fabric-specific properties
- **Triggers**: Migrated to Pipeline Schedules

### Step 2: Get Your Fabric Connection IDs

Before deploying, you need to create connections in your Fabric workspace and get their IDs:

1. Go to your Fabric workspace
2. Navigate to **Settings** > **Manage connections and gateways**
3. Create connections for your data sources
4. Copy the connection IDs (GUIDs)

Replace the placeholders in `sample_fabric_pipeline.json`:
- `<FABRIC_BLOB_STORAGE_CONNECTION_ID>` → Your Azure Blob Storage connection ID
- `<FABRIC_AZURE_SQL_CONNECTION_ID>` → Your Azure SQL Database connection ID

### Step 3: Create a Variable Library (if using Global Parameters)

If your pipelines use global parameters, create a Variable Library first:

```bash
# POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items
curl -X POST "https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "SampleDataFactory_GlobalParameters",
    "type": "VariableLibrary",
    "definition": {
      "parts": [
        {
          "path": "variables.json",
          "payload": "BASE64_ENCODED_VARIABLES",
          "payloadType": "InlineBase64"
        }
      ]
    }
  }'
```

Variable Library content (before Base64 encoding):
```json
{
  "variables": [
    {
      "name": "VariableLibrary_environment",
      "type": "String",
      "defaultValue": "development"
    },
    {
      "name": "VariableLibrary_maxRetries",
      "type": "Integer",
      "defaultValue": 3
    },
    {
      "name": "VariableLibrary_apiBaseUrl",
      "type": "String",
      "defaultValue": "https://api.example.com"
    }
  ]
}
```

### Step 4: Deploy the Pipeline via REST API

1. **Base64 encode the pipeline definition**:

```python
import base64
import json

with open("sample_fabric_pipeline.json", "r") as f:
    pipeline_def = json.load(f)

# Remove metadata comments if present
if "_comment" in pipeline_def:
    del pipeline_def["_comment"]
if "_api_endpoint" in pipeline_def:
    del pipeline_def["_api_endpoint"]
if "_documentation" in pipeline_def:
    del pipeline_def["_documentation"]

# Encode
payload = base64.b64encode(json.dumps(pipeline_def).encode("utf-8")).decode("utf-8")
print(payload)
```

2. **Make the API request**:

```bash
curl -X POST "https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "ETL_Pipeline",
    "type": "DataPipeline",
    "definition": {
      "parts": [
        {
          "path": "pipeline-content.json",
          "payload": "<BASE64_ENCODED_PIPELINE_DEFINITION>",
          "payloadType": "InlineBase64"
        }
      ]
    },
    "description": "ETL Pipeline migrated from Azure Data Factory"
  }'
```

### Step 5: Using Python to Deploy

Here's a complete Python example:

```python
import base64
import json
import requests

# Configuration
WORKSPACE_ID = "<your-workspace-id>"
ACCESS_TOKEN = "<your-bearer-token>"

# Load and prepare pipeline definition
with open("sample_fabric_pipeline.json", "r") as f:
    pipeline_def = json.load(f)

# Remove metadata
for key in ["_comment", "_api_endpoint", "_documentation"]:
    pipeline_def.pop(key, None)

# Replace connection placeholders with actual IDs
pipeline_json = json.dumps(pipeline_def)
pipeline_json = pipeline_json.replace(
    "<FABRIC_BLOB_STORAGE_CONNECTION_ID>", 
    "your-actual-blob-connection-id"
)
pipeline_json = pipeline_json.replace(
    "<FABRIC_AZURE_SQL_CONNECTION_ID>", 
    "your-actual-sql-connection-id"
)

# Base64 encode
payload = base64.b64encode(pipeline_json.encode("utf-8")).decode("utf-8")

# Make API request
response = requests.post(
    f"https://api.fabric.microsoft.com/v1/workspaces/{WORKSPACE_ID}/items",
    headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    },
    json={
        "displayName": "ETL_Pipeline",
        "type": "DataPipeline",
        "definition": {
            "parts": [
                {
                    "path": "pipeline-content.json",
                    "payload": payload,
                    "payloadType": "InlineBase64"
                }
            ]
        },
        "description": "ETL Pipeline migrated from Azure Data Factory"
    }
)

if response.status_code == 201:
    print("Pipeline created successfully!")
    print(response.json())
else:
    print(f"Error: {response.status_code}")
    print(response.text)
```

## Key Differences Between ADF and Fabric Formats

### 1. Dataset Embedding

**ADF** uses separate dataset resources:
```json
{
  "inputs": [{"referenceName": "SourceDataset", "type": "DatasetReference"}]
}
```

**Fabric** embeds datasets in activities:
```json
{
  "source": {
    "datasetSettings": {
      "type": "DelimitedText",
      "externalReferences": {
        "connection": "<connection-id>"
      }
    }
  }
}
```

### 2. Global Parameters → Library Variables

**ADF** uses `@pipeline().globalParameters.X`:
```json
"url": "@{pipeline().globalParameters.apiBaseUrl}/endpoint"
```

**Fabric** uses `@pipeline().libraryVariables.X`:
```json
"url": "@{pipeline().libraryVariables.Factory_VariableLibrary_apiBaseUrl}/endpoint"
```

### 3. ExecutePipeline → InvokePipeline

**ADF**:
```json
{
  "type": "ExecutePipeline",
  "typeProperties": {
    "pipeline": {"referenceName": "ChildPipeline"}
  }
}
```

**Fabric**:
```json
{
  "type": "InvokePipeline",
  "typeProperties": {
    "operationType": "InvokeFabricPipeline",
    "pipelineId": "<fabric-pipeline-id>",
    "workspaceId": "<workspace-id>"
  }
}
```

### 4. LinkedServices → Connections

**ADF** references LinkedServices:
```json
{
  "linkedServiceName": {
    "referenceName": "AzureBlobStorage_LS",
    "type": "LinkedServiceReference"
  }
}
```

**Fabric** uses connection references:
```json
{
  "externalReferences": {
    "connection": "<fabric-connection-id>"
  }
}
```

## Authentication

To make API calls, you need a Bearer token with the following scopes:
- `https://api.fabric.microsoft.com/.default`
- Or specifically: `DataPipeline.ReadWrite.All`, `Workspace.ReadWrite.All`

Example using Azure CLI:
```bash
az login
token=$(az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv)
```

Example using MSAL (Python):
```python
from msal import ConfidentialClientApplication

app = ConfidentialClientApplication(
    client_id="<client-id>",
    client_credential="<client-secret>",
    authority="https://login.microsoftonline.com/<tenant-id>"
)

result = app.acquire_token_for_client(
    scopes=["https://api.fabric.microsoft.com/.default"]
)
token = result["access_token"]
```

## API Reference

- [Create Data Pipeline](https://learn.microsoft.com/en-us/rest/api/fabric/datapipeline/items/create-data-pipeline)
- [Fabric REST API Overview](https://learn.microsoft.com/en-us/rest/api/fabric/)
- [Get Workspace Items](https://learn.microsoft.com/en-us/rest/api/fabric/core/items/list-items)
