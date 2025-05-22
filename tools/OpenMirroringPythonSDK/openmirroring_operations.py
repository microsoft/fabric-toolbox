# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from azure.storage.filedatalake import DataLakeServiceClient
from azure.identity import ClientSecretCredential
import requests
import json
import os

class OpenMirroringClient:
    def __init__(self, client_id: str, client_secret: str, client_tenant: str, host: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.client_tenant = client_tenant
        self.host = self._normalize_path(host)
        self.service_client = self._create_service_client()

    def _normalize_path(self, path: str) -> str:
        """
        Normalizes the given path by removing the 'LandingZone' segment if it ends with it.

        :param path: The original path.
        :return: The normalized path.
        """
        if path.endswith("LandingZone"):
            # Remove the 'LandingZone' segment
            return path[:path.rfind("/LandingZone")]
        elif path.endswith("LandingZone/"):
            # Remove the 'LandingZone/' segment
            return path[:path.rfind("/LandingZone/")]
        return path

    def _create_service_client(self):
        """Creates and returns a DataLakeServiceClient."""
        try:
            credential = ClientSecretCredential(self.client_tenant, self.client_id, self.client_secret)            
            return DataLakeServiceClient(account_url=self.host, credential=credential)
        except Exception as e:
            raise Exception(f"Failed to create DataLakeServiceClient: {e}")

    def create_table(self, schema_name: str = None, table_name: str = "", key_cols: list = []):
        """
        Creates a folder in OneLake storage and a _metadata.json file inside it.

        :param schema_name: Optional schema name.
        :param table_name: Name of the table.
        :param key_cols: List of key column names.
        """
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        # Construct the folder path
        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            # Create the folder
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")  # Replace with your file system name
            directory_client = file_system_client.get_directory_client(folder_path)
            directory_client.create_directory()

            # Create the _metadata.json file
            metadata_content = {"keyColumns": [f'{col}' for col in key_cols]}
            metadata_file_path = os.path.join(folder_path, "_metadata.json")
            file_client = directory_client.create_file("_metadata.json")
            file_client.append_data(data=json.dumps(metadata_content), offset=0, length=len(json.dumps(metadata_content)))
            file_client.flush_data(len(json.dumps(metadata_content)))

            print(f"Folder and _metadata.json created successfully at: {folder_path}")
        except Exception as e:
            raise Exception(f"Failed to create table: {e}")

    def remove_table(self, schema_name: str = None, table_name: str = "", remove_schema_folder: bool = False):
        """
        Deletes a folder in the OneLake storage.

        :param schema_name: Optional schema name.
        :param table_name: Name of the table.
        :param remove_schema_folder: If True, removes the schema folder as well.
        """
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        # Construct the folder path
        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            # Get the directory client
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")  # Replace with your file system name
            directory_client = file_system_client.get_directory_client(folder_path)

            # Check if the folder exists
            if not directory_client.exists():
                print(f"Warning: Folder '{folder_path}' not found.")
                return

            # Delete the folder
            directory_client.delete_directory()
            print(f"Folder '{folder_path}' deleted successfully.")

            # Check if schema folder exists
            if remove_schema_folder and schema_name:
                schema_folder_path = f"{schema_name}.schema"
                schema_directory_client = file_system_client.get_directory_client(schema_folder_path)
                if schema_directory_client.exists():
                    schema_directory_client.delete_directory()
                    print(f"Schema folder '{schema_folder_path}' deleted successfully.")
                else:
                    print(f"Warning: Schema folder '{schema_folder_path}' not found.")
        except Exception as e:
            raise Exception(f"Failed to delete table: {e}")

    def get_next_file_name(self, schema_name: str = None, table_name: str = "") -> str:
        """
        Finds the next file name for a folder in OneLake storage.

        :param schema_name: Optional schema name.
        :param table_name: Name of the table.
        :return: The next file name padded to 20 digits.
        """
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        # Construct the folder path
        folder_path = f"LandingZone/{schema_name}.schema/{table_name}" if schema_name else f"LandingZone/{table_name}"

        try:
            # Get the system client
            file_system_client = self.service_client.get_file_system_client(file_system=folder_path)

            # List all files in the folder
            file_list = file_system_client.get_paths(recursive=False)
            parquet_files = []

            for file in file_list:
                file_name = os.path.basename(file.name)
                if not file.is_directory and file_name.endswith(".parquet") and not file_name.startswith("_"):
                    # Validate the file name pattern
                    if not file_name[:-8].isdigit() or len(file_name[:-8]) != 20:  # Exclude ".parquet"
                        raise ValueError(f"Invalid file name pattern: {file_name}")
                    parquet_files.append(int(file_name[:-8]))

            # Determine the next file name
            if parquet_files:
                next_file_number = max(parquet_files) + 1
            else:
                next_file_number = 1

            # Return the next file name padded to 20 digits
            return f"{next_file_number:020}.parquet"

        except Exception as e:
            raise Exception(f"Failed to get next file name: {e}")

    def upload_data_file(self, schema_name: str = None, table_name: str = "", local_file_path: str = ""):
        """
        Uploads a file to OneLake storage.

        :param schema_name: Optional schema name.
        :param table_name: Name of the table.
        :param local_file_path: Path to the local file to be uploaded.
        """
        if not table_name:
            raise ValueError("table_name cannot be empty.")
        if not local_file_path or not os.path.isfile(local_file_path):
            raise ValueError("Invalid local file path.")

        # Construct the folder path
        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            # Get the directory client
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")  # Replace with your file system name
            directory_client = file_system_client.get_directory_client(folder_path)

            # Check if the folder exists
            if not directory_client.exists():
                raise FileNotFoundError(f"Folder '{folder_path}' not found.")

            # Get the next file name
            next_file_name = self.get_next_file_name(schema_name, table_name)

            # Add an underscore to the file name for temporary upload
            temp_file_name = f"_{next_file_name}"

            # Upload the file
            file_client = directory_client.create_file(temp_file_name)
            with open(local_file_path, "rb") as file_data:
                file_contents = file_data.read()
                file_client.append_data(data=file_contents, offset=0, length=len(file_contents))
                file_client.flush_data(len(file_contents))

            print(f"File uploaded successfully as '{temp_file_name}'.")
            
            # Python SDK doesn't handle rename properly for onelake, using REST API to rename the file instead
            self.rename_file_via_rest_api(f"LandingZone/{folder_path}", temp_file_name, next_file_name)
            print(f"File renamed successfully to '{next_file_name}'.")

        except Exception as e:
            raise Exception(f"Failed to upload data file: {e}")
        
    def rename_file_via_rest_api(self, folder_path: str, old_file_name: str, new_file_name: str):
        # Create a ClientSecretCredential
        credential = ClientSecretCredential(self.client_tenant, self.client_id, self.client_secret)            
        # Get a token
        token = credential.get_token("https://storage.azure.com/.default").token

        # Construct the rename URL
        rename_url = f"{self.host}/{folder_path}/{new_file_name}"

        # Construct the source path
        source_path = f"{self.host}/{folder_path}/{old_file_name}"

        # Set the headers
        headers = {
            "Authorization": f"Bearer {token}",
            "x-ms-rename-source": source_path,
            "x-ms-version": "2020-06-12"
        }

        # Send the rename request
        response = requests.put(rename_url, headers=headers)

        if response.status_code in [200, 201]:
            print(f"File renamed from {old_file_name} to {new_file_name} successfully.")
        else:
            print(f"Failed to rename file. Status code: {response.status_code}, Error: {response.text}")

    def get_mirrored_database_status(self):
        """
        Retrieves and displays the status of the mirrored database from Monitoring/replicator.json.

        :raises Exception: If the status file or path does not exist.
        """
        file_system_client = self.service_client.get_file_system_client(file_system="Monitoring")
        try:
            file_client = file_system_client.get_file_client("replicator.json")
            if not file_client.exists():
                raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")

            download = file_client.download_file()
            content = download.readall()
            status_json = json.loads(content)
            print(json.dumps(status_json, indent=4))
        except Exception:
            raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")

    def get_table_status(self, schema_name: str = None, table_name: str = None):
        """
        Retrieves and displays the status of tables from Monitoring/table.json.

        :param schema_name: Optional schema name to filter.
        :param table_name: Optional table name to filter.
        :raises Exception: If the status file or path does not exist.
        """
        file_system_client = self.service_client.get_file_system_client(file_system="Monitoring")
        try:
            file_client = file_system_client.get_file_client("tables.json")
            if not file_client.exists():
                raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")

            download = file_client.download_file()
            content = download.readall()
            status_json = json.loads(content)

            # Treat None as empty string for filtering
            schema_name = schema_name or ""
            table_name = table_name or ""

            if not schema_name and not table_name:
                # Show the whole JSON content
                print(json.dumps(status_json, indent=4))
            else:
                # Filter tables array
                filtered_tables = [
                    t for t in status_json.get("tables", [])
                    if t.get("sourceSchemaName", "") == schema_name and t.get("sourceTableName", "") == table_name
                ]
                print(json.dumps({"tables": filtered_tables}, indent=4))
        except Exception:
            raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")