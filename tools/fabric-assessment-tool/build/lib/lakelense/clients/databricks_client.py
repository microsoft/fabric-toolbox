import base64
import os
import re
from argparse import Namespace
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from azure.identity import AzureCliCredential
from databricks.sdk import WorkspaceClient

from ..assessment.common import AssessmentStatus

from ..assessment.databricks import (
    DatabricksAssessment,
    DatabricksAssessmentMetadata,
    DatabricksCatalogs,
    DatabricksCluster,
    DatabricksClusters,
    DatabricksDatabase,
    DatabricksDatabases,
    DatabricksJob,
    DatabricksJobRun,
    DatabricksJobRuns,
    DatabricksJobs,
    DatabricksJobSettings,
    DatabricksJobTask,
    DatabricksJobTasks,
    DatabricksNotebook,
    DatabricksNotebooks,
    DatabricksSqlWarehouse,
    DatabricksSqlWarehouses,
    DatabricksTable,
    DatabricksUnityCatalog,
    DatabricksUnityCatalogs,
    DatabricksWorkspaceInfo,
)
from .api_client import ApiClient, ApiResponse


class DatabricksClient:
    """Client for Databricks APIs."""

    def __init__(
        self,
        **kwargs,
    ):
        """
        Initialize Databricks client.
        """

        self.authenticate()
        self.workspaces = self.get_workspaces()

    def authenticate(self) -> None:
        """Authenticate with Databricks using access token."""
        try:
            self.credential = AzureCliCredential()
            self.azure_token = self.credential.get_token(
                "https://management.azure.com/.default"
            )
            self.azure_client = ApiClient(
                token=self.azure_token.token, api_version="2024-05-01"
            )
            import json
            import subprocess

            cmd = "az account show"
            output = subprocess.run(
                cmd,
                shell=True,
                check=False,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
            )
            result = json.loads(output.stdout)
            if result:
                self.account_info = result
                self.tenant_id = self.account_info["tenantId"]
                self.subscription_id = self.account_info["id"]
            else:
                raise Exception("Failed to get account info from Azure CLI")

        except Exception as e:
            raise Exception(f"Failed to authenticate with Azure: {e}")

    def get_workspaces(self) -> list[DatabricksWorkspaceInfo]:
        """Get all Databricks workspaces in the subscription."""
        # For demo purposes, return mock data as dataclass

        args = Namespace()
        # https://learn.microsoft.com/en-us/rest/api/databricks/workspaces/list-by-subscription?view=rest-databricks-2024-05-01&tabs=HTTP
        args.uri = f"/subscriptions/{self.subscription_id}/providers/Microsoft.Databricks/workspaces"
        req = self.azure_client.do_request(args)

        json_req = req.json()

        workspaces = [
            DatabricksWorkspaceInfo(
                id=workspace["id"],
                name=workspace["name"],
                resource_group=workspace["id"].split("/")[4],
                url=workspace["properties"].get("workspaceUrl"),
                status=workspace["properties"].get("provisioningState"),
                tier=workspace["sku"]["name"],
                json_response=workspace,
            )
            for workspace in json_req.get("value", [])
        ]

        return workspaces

    def _auth_databricks(self, workspace_url) -> None:

        self.workspace_client = WorkspaceClient(
            host=workspace_url, auth_type="azure-cli"
        )
        self.api_client = ApiClient(base_url=workspace_url, scope="", api_version="")
        # Reuse the authentication of the session of the Databricks API client
        self.api_client.session.auth = (
            self.workspace_client.api_client._api_client._session.auth
        )

    def assess_workspace(self, workspace_name: str, mode: str) -> DatabricksAssessment:
        """
        Assess a Databricks workspace.

        Args:
            workspace_name: Name of the Databricks workspace
            mode: Assessment mode (full, etc.)

        Returns:
            DatabricksAssessment object with all assessment data
        """
        print(f"Assessing Databricks workspace: {workspace_name} (mode: {mode})")

        try:
            # Get workspace details
            workspace_info = self._get_workspace_info(workspace_name)

            # Use the workspace_info to authenticate the databricks client
            self._auth_databricks(workspace_info.url)

            # Get clusters
            clusters = self._get_clusters()

            # Get SQL Warehouses
            sql_warehouses = self._get_sql_warehouses()

            # Get notebooks
            notebooks = self._get_notebooks()

            # Get jobs
            jobs = self._get_jobs()

            # Get catalogs
            catalogs = self._get_catalogs()

            unity_catalogs = self._get_unity_catalogs()

            # Create assessment metadata
            assessment_metadata = DatabricksAssessmentMetadata(
                mode=mode, timestamp=self._get_timestamp()
            )

            # Return complete assessment object
            return DatabricksAssessment(
                status=AssessmentStatus(status="completed"),
                workspace_info=workspace_info,
                clusters=clusters,
                sql_warehouses=sql_warehouses,
                notebooks=notebooks,
                jobs=jobs,
                catalogs=catalogs,
                assessment_metadata=assessment_metadata,
                workspace_url=workspace_info.url,
                unity_catalogs=unity_catalogs,
            )

        except Exception as e:
            raise Exception(f"Failed to assess workspace {workspace_name}: {e}")

    def _get_workspace_info(self, workspace_name: str) -> DatabricksWorkspaceInfo:
        """Get Databricks workspace information."""
        ws = next(
            (
                workspace
                for workspace in self.workspaces
                if workspace.name.lower() == workspace_name.lower()
            ),
            None,
        )

        if not ws:
            raise ValueError(f"Workspace not found: {workspace_name}")

        return ws

    def _get_clusters(self) -> DatabricksClusters:
        try:
            args = Namespace()
            args.uri = f"/api/2.0/clusters/list"
            req = self.api_client.do_request(args)
            json_req = req.json()
            # print("CLUSTERS API RESPONSE:", json_req)  # <--- Add this for debugging
            # Key may be either "clusters" or other depending on API/version
            clusters_data = json_req.get("clusters") or json_req.get("data", {}).get(
                "clusters", []
            )
            clusters = [
                DatabricksCluster(
                    cluster_id=cluster.get("cluster_id") or cluster.get("id"),
                    cluster_name=cluster.get("cluster_name") or cluster.get("name"),
                    state=cluster.get("state"),
                    node_type_id=cluster.get("node_type_id"),
                    cluster_cores=cluster.get("cluster_cores") or 0,
                    cluster_memory_mb=cluster.get("cluster_memory_mb") or 0,
                    spark_version=cluster.get("spark_version")
                    or cluster.get("effective_spark_version"),
                    autoscale=cluster.get("autoscale"),
                    json_response=cluster,
                )
                for cluster in clusters_data
            ]

            return DatabricksClusters(clusters=clusters)

        except Exception as e:
            print(f"Failed to get clusters: {e}")
            return DatabricksClusters(clusters=[])

    def _get_sql_warehouses(self) -> DatabricksSqlWarehouses:
        """Get sql warehouses in the workspace."""
        try:
            args = Namespace()
            #
            args.uri = f"/api/2.0/sql/warehouses"
            req = self.api_client.do_request(args)

            json_req = req.json()
            sql_warehouses = [
                DatabricksSqlWarehouse(
                    name=warehouse["name"],
                    cluster_size=warehouse["cluster_size"],
                    photon_enabled=warehouse["enable_photon"],
                    serverless=warehouse["enable_serverless_compute"],
                    min_clusters=warehouse["min_num_clusters"],
                    max_clusters=warehouse["max_num_clusters"],
                    uses_spot_instances=(
                        warehouse.get("spot_instance_policy", "") == "COST_OPTIMIZED"
                    ),
                    json_response=warehouse,
                )
                for warehouse in json_req.get("warehouses", [])
            ]

            return DatabricksSqlWarehouses(sql_warehouses=sql_warehouses)

        except Exception as e:
            print(f"Failed to get SQL warehouses: {e}")
            return DatabricksSqlWarehouses(sql_warehouses=[])

    def _get_unity_catalogs(self) -> DatabricksUnityCatalogs:
        try:
            args = Namespace()
            args.uri = "/api/2.1/unity-catalog/catalogs"
            req = self.api_client.do_request(args)
            json_req = req.json()
            unity_catalogs = [
                DatabricksUnityCatalog(
                    name=catalog.get("name"),
                    comment=catalog.get("comment"),
                    owner=catalog.get("owner"),
                    storage_root=catalog.get("storage_root"),
                    json_response=catalog,
                )
                for catalog in json_req.get("catalogs", [])
            ]
            return DatabricksUnityCatalogs(unity_catalogs=unity_catalogs)
        except Exception as e:
            print(f"Failed to get Unity Catalogs: {e}")
            return DatabricksUnityCatalogs(unity_catalogs=[])

    def _detect_embedded_magics(self, base64_content) -> tuple[list[str], list[str]]:
        try:
            decoded = base64.b64decode(base64_content).decode("utf-8", errors="ignore")
            lines = decoded.splitlines()
            magic_pattern = re.compile(r"(?<!['\"])?%(\w+)\b")
            lang_magics = {"python", "sql", "scala", "r"}
            other_magics = {"fs", "sh", "md", "run", "pip"}
            langs, others = set(), set()
            for line in lines:
                for match in magic_pattern.findall(line.lower()):
                    if match in lang_magics:
                        langs.add(match)
                    elif match in other_magics:
                        others.add(match)
            return list(langs), list(others)
        except Exception:
            return [], []

    def _get_notebooks(self) -> DatabricksNotebooks:
        """Get notebooks in the workspace."""
        try:
            notebooks: list[DatabricksNotebook] = []
            list_endpoint = f"api/2.0/workspace/list"
            export_endpoint = f"api/2.0/workspace/export"
            status_endpoint = f"api/2.0/workspace/get-status"

            def traverse(current_path):
                args = Namespace()
                args.uri = list_endpoint
                args.request_params = {"path": current_path}
                try:
                    data = self.api_client.do_request(args).json()
                except:
                    return

                for obj in data.get("objects", []):
                    obj_path = obj["path"]
                    if obj["object_type"] == "NOTEBOOK":
                        lang = "unknown"
                        try:
                            args.uri = status_endpoint
                            args.request_params = {}

                            lang = (
                                self.api_client.do_request(args)
                                .json()
                                .get("language", "unknown")
                            )
                        except:
                            pass
                        try:
                            args.uri = export_endpoint
                            args.request_params = (
                                {"path": obj_path, "format": "SOURCE"},
                            )
                            content = (
                                self.api_client.do_request(args)
                                .json()
                                .get("content", "")
                            )
                            embedded_langs, magics = self._detect_embedded_magics(
                                content
                            )
                        except:
                            embedded_langs, magics = [], []
                        notebooks.append(
                            DatabricksNotebook(
                                path=obj_path,
                                default_language=lang,
                                embedded_languages=embedded_langs,
                                other_magics=magics,
                                json_response=obj,  # TODO: Add the export response instead of list respose?
                            )
                        )
                    elif obj["object_type"] == "DIRECTORY":
                        traverse(obj_path)

            traverse("/")

            return DatabricksNotebooks(notebooks=notebooks)

        except Exception as e:
            print(f"Failed to get notebooks: {e}")
            return DatabricksNotebooks(notebooks=[])

    def _extract_task_type(self, task: Any) -> str:

        # Find the first key in the task dictionary that ends with "_task"
        extracted_task_type = [key for key in task.keys() if key.endswith("_task")]

        if len(extracted_task_type) == 1:
            return extracted_task_type[0].replace("_task", "")
        else:
            return "unknown"

    def _get_job_details(self, job: Any) -> DatabricksJob:
        job_id = job["job_id"]
        base_endpoint = "api/2.2/jobs"
        args = Namespace()

        if job.get("has_more", False):
            args.uri = f"{base_endpoint}/get?job_id={job_id}"
            req = self.api_client.do_request(args)
            settings = req.json().get("settings", {})
        else:
            settings = job.get("settings", {})

        args.uri = f"{base_endpoint}/runs/list?job_id={job_id}&limit=3"
        req = self.api_client.do_request(args)
        runs = req.json()

        return DatabricksJob(
            job_id=job_id,
            tasks=DatabricksJobTasks(
                tasks=(
                    (
                        [
                            DatabricksJobTask(
                                name=task.get("task_key", ""),
                                type=self._extract_task_type(task),
                                libraries=task.get("libraries", {}),
                                json_response=task,
                            )
                            for task in settings.get("tasks", [])
                        ]
                    )
                    if settings.get("format")
                    == "MULTI_TASK"  # format can be SINGLE_TASK | MULTI_TASK
                    else []
                )
            ),
            settings=DatabricksJobSettings(
                name=settings.get("name"), json_response=settings
            ),
            latest_runs=DatabricksJobRuns(
                runs=[
                    DatabricksJobRun(
                        id=run.get("run_id"),
                        state=run.get("state", {}).get("life_cycle_state"),
                        result_state=run.get("state", {}).get("result_state"),
                        start_time=datetime.fromtimestamp(
                            run.get("start_time", 0) / 1000, tz=timezone.utc
                        ).isoformat(),
                        end_time=(
                            datetime.fromtimestamp(
                                run.get("end_time", 0) / 1000, tz=timezone.utc
                            ).isoformat()
                            if run.get("end_time")
                            else None
                        ),
                        execution_duration=run.get("execution_duration", 0),
                        json_response=run,
                    )
                    for run in runs.get("runs", [])
                ]
            ),
        )

    def _get_jobs(self) -> DatabricksJobs:
        """Get jobs in the workspace."""
        try:
            args = Namespace()
            args.uri = f"api/2.2/jobs/list"
            args.request_params = {"expand_tasks": "true"}
            resp = self.api_client.do_request(args)
            json_resp = resp.json()

            jobs = [
                self._get_job_details(job)
                for job in json_resp.get("jobs", [])
                if job.get("job_id") is not None
            ]

            return DatabricksJobs(jobs=jobs)

        except Exception as e:
            print(f"Failed to get jobs: {e}")
            return DatabricksJobs(jobs=[])

    def _get_databases(self) -> DatabricksDatabases:
        """Get databases and tables in the workspace."""
        try:
            # For demo purposes, return mock data as dataclass
            tables = [
                DatabricksTable(
                    name="sales_data", type="MANAGED", columns=15, size_bytes=1073741824
                )
            ]

            databases = [DatabricksDatabase(name="default", tables=tables)]

            return DatabricksDatabases(databases=databases)

        except Exception as e:
            print(f"Failed to get databases: {e}")
            return DatabricksDatabases(databases=[])

    def _get_catalogs(self) -> DatabricksCatalogs:
        """Get catalogs in the workspace."""
        try:
            # For demo purposes, return mock data as dataclass
            return DatabricksCatalogs(catalogs=[])
        except Exception as e:
            print(f"Failed to get catalogs: {e}")
            return DatabricksCatalogs(catalogs=[])

    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime

        return datetime.now().isoformat()
