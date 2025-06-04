# Python SDK of Microsoft Fabric Open Mirroring

The `openmirroring_operations.py` module provides a Python client, `OpenMirroringClient`, to interact with Microsoft Fabric's Open Mirroring functionality. This client simplifies operations on Fabric OneLake, such as creating tables, managing files, and handling folder structures.

### Key Features:
1. **Authentication**:
   - Uses Azure `ClientSecretCredential` for secure access to Fabric OneLake.

2. **Table Management**:
   - `create_table`: Creates a folder structure in the storage and generates a `_metadata.json` file with specified key columns.

3. **File Management**:
   - `get_next_file_name`: Determines the next file name in a folder based on existing `.parquet` files, ensuring proper naming conventions.
   - `upload_data_file`: Uploads a local file to the storage with a temporary name, then renames it to follow the naming convention.

4. **Folder Management**:
   - `remove_table`: Deletes a specified folder in the storage, with warnings if the folder does not exist.

5. **Monitoring & Status**:
   - `get_mirrored_database_status`: Retrieves and displays the overall status of the mirrored database.  
     **Sample response:**
     ```json
     {
         "status": "Stopped",
         "errorCode": "",
         "errorMessage": ""
     }
     ```
   - `get_table_status`: Retrieves and displays the detail status of tables. You can filter by schema and table name, or display all table statuses.  
     **Sample response:**
     ```json
     {
         "tables": [
             {
                 "id": "db54958b-cdec-43a5-9dd6-d9b76287aea1",
                 "status": "Replicating",
                 "errorCode": "",
                 "errorMessage": "",
                 "normalizedTableName": "abc.12345",
                 "sourceTableName": "12345",
                 "sourceSchemaName": "abc",
                 "sourceObjectType": "Table",
                 "metrics": {
                     "processedRowCount": 5,
                     "processedByte": 60,
                     "lastSourceCommitTimeUtc": "0001-01-01T00:00:00",
                     "lastSyncTimeUtc": "2025-05-20T00:02:24.2389983Z"
                 }
             }
         ]
     }
     ```

### Usage:
This module is designed to be used as part of the Python SDK for Microsoft Fabric Open Mirroring. It provides a high-level API for managing data in Fabric OneLake, making it easier to integrate with Microsoft Fabric workflows.

### Dependencies:
- `azure-storage-file-datalake`: For interacting with Fabric OneLake.
- `azure-identity`: For authentication using Azure credentials.
- Standard Python libraries: `os`, `json`, `requests`.

### Example:
```python
from openmirroring_operations import OpenMirroringClient

# Initialize the client
client = OpenMirroringClient(
    client_id="your-client-id",
    client_secret="your-client-secret",
    client_tenant="your-tenant-id",
    host="https://onelake.dfs.fabric.microsoft.com/<workspace-id>/<mirrored-database-id>/Files/LandingZone/"
)

# Create a table
client.create_table(schema_name="SampleSchema", table_name="SampleTable", key_cols=["Column1", "Column2"])

# Get the next file name (optional, not need in real usage)
next_file_name = client.get_next_file_name(schema_name="SampleSchema", table_name="SampleTable")
print(f"Next file name: {next_file_name}")

# Upload a file
client.upload_data_file(schema_name="SampleSchema", table_name="SampleTable", local_file_path="path/to/your/file.parquet")

# Remove a table
client.remove_table(schema_name="SampleSchema", table_name="SampleTable")

# Get mirrored database status
client.get_mirrored_database_status()

# Get table status (all tables)
client.get_table_status()

# Get table status (filtered by schema and table)
client.get_table_status(schema_name="abc", table_name="12345")