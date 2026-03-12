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
        if path.endswith("LandingZone"):
            return path[:path.rfind("/LandingZone")]
        if path.endswith("LandingZone/"):
            return path[:path.rfind("/LandingZone/")]
        return path

    def _create_service_client(self):
        try:
            credential = ClientSecretCredential(self.client_tenant, self.client_id, self.client_secret)
            return DataLakeServiceClient(account_url=self.host, credential=credential)
        except Exception as e:
            raise Exception(f"Failed to create DataLakeServiceClient: {e}")

    def _landing_zone_client(self):
        return self.service_client.get_file_system_client(file_system="LandingZone")

    def _normalize_relative_path(self, path: str) -> str:
        return (path or "").replace("\\", "/").strip("/")

    def _ensure_parent_directories(self, relative_path: str) -> None:
        normalized = self._normalize_relative_path(relative_path)
        parent = os.path.dirname(normalized).replace("\\", "/").strip("/")
        if not parent:
            return

        fs_client = self._landing_zone_client()
        cumulative = ""
        for part in parent.split("/"):
            cumulative = f"{cumulative}/{part}" if cumulative else part
            directory_client = fs_client.get_directory_client(cumulative)
            if not directory_client.exists():
                directory_client.create_directory()

    def landing_zone_exists(self) -> bool:
        try:
            client = self._landing_zone_client()
            next(client.get_paths(path="", recursive=False, max_results=1), None)
            return True
        except Exception:
            return False

    def file_exists(self, relative_path: str) -> bool:
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            return False

        file_client = self._landing_zone_client().get_file_client(normalized)
        return file_client.exists()

    def upload_bytes(self, relative_path: str, payload: bytes, overwrite: bool = False) -> bool:
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            raise ValueError("relative_path cannot be empty.")

        if not overwrite and self.file_exists(normalized):
            return False

        self._ensure_parent_directories(normalized)
        fs_client = self._landing_zone_client()
        parent = os.path.dirname(normalized).replace("\\", "/").strip("/")
        file_name = os.path.basename(normalized)
        temp_name = f"_{file_name}.uploading"
        temp_relative_path = f"{parent}/{temp_name}" if parent else temp_name
        temp_client = fs_client.get_file_client(temp_relative_path)

        if temp_client.exists():
            temp_client.delete_file()

        temp_client.upload_data(payload, overwrite=True)
        rename_folder = f"LandingZone/{parent}" if parent else "LandingZone"
        self.rename_file_via_rest_api(rename_folder, temp_name, file_name)
        return True

    def delete_directory_if_exists(self, relative_path: str) -> bool:
        normalized = self._normalize_relative_path(relative_path)
        if not normalized:
            return False

        directory_client = self._landing_zone_client().get_directory_client(normalized)
        if not directory_client.exists():
            return False

        directory_client.delete_directory()
        return True

    def create_table(self, schema_name: str = None, table_name: str = "", key_cols: list = []):
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")
            directory_client = file_system_client.get_directory_client(folder_path)
            directory_client.create_directory()

            metadata_content = {"keyColumns": [f"{col}" for col in key_cols]}
            file_client = directory_client.create_file("_metadata.json")
            encoded = json.dumps(metadata_content)
            file_client.append_data(data=encoded, offset=0, length=len(encoded))
            file_client.flush_data(len(encoded))

            print(f"Folder and _metadata.json created successfully at: {folder_path}")
        except Exception as e:
            raise Exception(f"Failed to create table: {e}")

    def remove_table(self, schema_name: str = None, table_name: str = "", remove_schema_folder: bool = False):
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")
            directory_client = file_system_client.get_directory_client(folder_path)

            if not directory_client.exists():
                print(f"Warning: Folder '{folder_path}' not found.")
                return

            directory_client.delete_directory()
            print(f"Folder '{folder_path}' deleted successfully.")

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
        if not table_name:
            raise ValueError("table_name cannot be empty.")

        folder_path = f"LandingZone/{schema_name}.schema/{table_name}" if schema_name else f"LandingZone/{table_name}"

        try:
            file_system_client = self.service_client.get_file_system_client(file_system=folder_path)
            file_list = file_system_client.get_paths(recursive=False)
            parquet_files = []

            for file in file_list:
                file_name = os.path.basename(file.name)
                if not file.is_directory and file_name.endswith(".parquet") and not file_name.startswith("_"):
                    if not file_name[:-8].isdigit() or len(file_name[:-8]) != 20:
                        raise ValueError(f"Invalid file name pattern: {file_name}")
                    parquet_files.append(int(file_name[:-8]))

            next_file_number = max(parquet_files) + 1 if parquet_files else 1
            return f"{next_file_number:020}.parquet"

        except Exception as e:
            raise Exception(f"Failed to get next file name: {e}")

    def upload_data_file(self, schema_name: str = None, table_name: str = "", local_file_path: str = ""):
        if not table_name:
            raise ValueError("table_name cannot be empty.")
        if not local_file_path or not os.path.isfile(local_file_path):
            raise ValueError("Invalid local file path.")

        folder_path = f"{schema_name}.schema/{table_name}" if schema_name else f"{table_name}"

        try:
            file_system_client = self.service_client.get_file_system_client(file_system="LandingZone")
            directory_client = file_system_client.get_directory_client(folder_path)

            if not directory_client.exists():
                raise FileNotFoundError(f"Folder '{folder_path}' not found.")

            next_file_name = self.get_next_file_name(schema_name, table_name)
            temp_file_name = f"_{next_file_name}"

            file_client = directory_client.create_file(temp_file_name)
            with open(local_file_path, "rb") as file_data:
                file_contents = file_data.read()
                file_client.append_data(data=file_contents, offset=0, length=len(file_contents))
                file_client.flush_data(len(file_contents))

            print(f"File uploaded successfully as '{temp_file_name}'.")
            self.rename_file_via_rest_api(f"LandingZone/{folder_path}", temp_file_name, next_file_name)
            print(f"File renamed successfully to '{next_file_name}'.")

        except Exception as e:
            raise Exception(f"Failed to upload data file: {e}")

    def rename_file_via_rest_api(self, folder_path: str, old_file_name: str, new_file_name: str):
        credential = ClientSecretCredential(self.client_tenant, self.client_id, self.client_secret)
        token = credential.get_token("https://storage.azure.com/.default").token

        rename_url = f"{self.host}/{folder_path}/{new_file_name}"
        source_path = f"{self.host}/{folder_path}/{old_file_name}"

        headers = {
            "Authorization": f"Bearer {token}",
            "x-ms-rename-source": source_path,
            "x-ms-version": "2020-06-12",
        }

        response = requests.put(rename_url, headers=headers)

        if response.status_code in [200, 201]:
            print(f"File renamed from {old_file_name} to {new_file_name} successfully.")
        else:
            print(f"Failed to rename file. Status code: {response.status_code}, Error: {response.text}")

    def get_mirrored_database_status(self):
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
        file_system_client = self.service_client.get_file_system_client(file_system="Monitoring")
        try:
            file_client = file_system_client.get_file_client("tables.json")
            if not file_client.exists():
                raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")

            download = file_client.download_file()
            content = download.readall()
            status_json = json.loads(content)

            schema_name = schema_name or ""
            table_name = table_name or ""

            if not schema_name and not table_name:
                print(json.dumps(status_json, indent=4))
            else:
                filtered_tables = [
                    t for t in status_json.get("tables", [])
                    if t.get("sourceSchemaName", "") == schema_name and t.get("sourceTableName", "") == table_name
                ]
                print(json.dumps({"tables": filtered_tables}, indent=4))
        except Exception:
            raise Exception("No status of mirrored database has been found. Please check whether the mirrored database has been started properly.")
