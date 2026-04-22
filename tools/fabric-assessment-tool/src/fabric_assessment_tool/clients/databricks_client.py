import base64
import os
import re
from argparse import Namespace
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from databricks.sdk import WorkspaceClient

from ..assessment.common import AssessmentStatus
from ..assessment.databricks import (
    DatabricksAlert,
    DatabricksAlerts,
    DatabricksAssessment,
    DatabricksAssessmentMetadata,
    DatabricksCatalog,
    DatabricksCatalogs,
    DatabricksCluster,
    DatabricksClusters,
    DatabricksConnection,
    DatabricksConnections,
    DatabricksExperiment,
    DatabricksExperiments,
    DatabricksExternalLocation,
    DatabricksExternalLocations,
    DatabricksFunction,
    DatabricksGenieSpace,
    DatabricksGenieSpaces,
    DatabricksJob,
    DatabricksJobRun,
    DatabricksJobRuns,
    DatabricksJobs,
    DatabricksJobSettings,
    DatabricksJobTask,
    DatabricksJobTasks,
    DatabricksNotebook,
    DatabricksNotebooks,
    DatabricksPipeline,
    DatabricksPipelines,
    DatabricksRepo,
    DatabricksRepos,
    DatabricksSchema,
    DatabricksSchemas,
    DatabricksSecretScope,
    DatabricksSecretScopes,
    DatabricksServingEndpoint,
    DatabricksServingEndpoints,
    DatabricksSqlWarehouse,
    DatabricksSqlWarehouses,
    DatabricksTable,
    DatabricksVolume,
    DatabricksWorkspaceInfo,
)
from ..utils import ui as utils_ui
from .api_client import ApiClient, ApiResponse
from .token_provider import TokenProvider, create_token_provider


class DatabricksClient:
    """Client for Databricks APIs."""

    def __init__(
        self,
        subscription_id: Optional[str] = None,
        token_provider: Optional[TokenProvider] = None,
        auth_method: Optional[str] = None,
        **kwargs,
    ):
        """
        Initialize Databricks client.

        Args:
            subscription_id: Azure subscription ID (optional, will use Azure CLI default if not provided)
            token_provider: Optional TokenProvider instance for authentication
            auth_method: Authentication method ("azure-cli", "fabric", or None for auto-detect)
        """
        self.token_provider = token_provider or create_token_provider(auth_method)
        self.custom_subscription_id = subscription_id
        self.authenticate()
        self._workspace_cache: dict[str, DatabricksWorkspaceInfo] = {}

    def authenticate(self) -> None:
        """Authenticate with Azure using the configured token provider."""
        try:
            azure_token = self.token_provider.get_token(
                "https://management.azure.com/.default"
            )
            self.azure_client = ApiClient(token=azure_token, api_version="2024-05-01")

            # Use custom subscription_id if provided, otherwise use provider default
            default_sub = self.token_provider.get_subscription_id()
            self.subscription_id = self.custom_subscription_id or default_sub
            if not self.subscription_id:
                raise Exception(
                    "No subscription ID available. "
                    "Please provide --subscription-id when using Fabric notebook authentication."
                )

        except Exception as e:
            raise Exception(f"Failed to authenticate with Azure: {e}")

    def get_workspaces(self) -> list[DatabricksWorkspaceInfo]:
        """Get all Databricks workspaces in the subscription.

        Used for interactive workspace selection when no workspace names are provided.
        """
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

        # Populate cache
        for ws in workspaces:
            self._workspace_cache[ws.name.lower()] = ws

        return workspaces

    def _auth_databricks(self, workspace_url) -> None:

        databricks_token = self.token_provider.get_token(
            "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"
        )
        self.workspace_client = WorkspaceClient(
            host=workspace_url, token=databricks_token
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
        utils_ui.print(
            f"Assessing Databricks workspace: {workspace_name} (mode: {mode})"
        )

        try:
            # Get workspace details
            workspace_info = self._get_workspace_info(workspace_name)

            # Use the workspace_info to authenticate the databricks client
            self._auth_databricks(workspace_info.url)

            # Get clusters
            utils_ui.print_extracting("Clusters")
            clusters = self._get_clusters()
            utils_ui.print_extraction_done("Clusters")

            # Get SQL Warehouses
            utils_ui.print_extracting("SQL Warehouses")
            sql_warehouses = self._get_sql_warehouses()
            utils_ui.print_extraction_done("SQL Warehouses")

            # Get notebooks
            utils_ui.print_extracting("Notebooks")
            notebooks = self._get_notebooks()
            utils_ui.print_extraction_done("Notebooks")

            # Get jobs
            utils_ui.print_extracting("Jobs")
            jobs = self._get_jobs()
            utils_ui.print_extraction_done("Jobs")

            # Get catalogs
            utils_ui.print_extracting("Catalogs")
            catalogs = self._get_catalogs()
            utils_ui.print_extraction_done("Catalogs")

            # Get external locations
            utils_ui.print_extracting("External Locations")
            external_locations = self._get_external_locations()
            utils_ui.print_extraction_done("External Locations")

            # Get connections
            utils_ui.print_extracting("Connections")
            connections = self._get_connections()
            utils_ui.print_extraction_done("Connections")

            # Get secret scopes
            utils_ui.print_extracting("Secret Scopes")
            secret_scopes = self._get_secret_scopes()
            utils_ui.print_extraction_done("Secret Scopes")

            # Get DLT pipelines
            utils_ui.print_extracting("Pipelines")
            pipelines = self._get_pipelines()
            utils_ui.print_extraction_done("Pipelines")

            # Get Git repos
            utils_ui.print_extracting("Repos")
            repos = self._get_repos()
            utils_ui.print_extraction_done("Repos")

            # Get MLflow experiments
            utils_ui.print_extracting("Experiments")
            experiments = self._get_experiments()
            utils_ui.print_extraction_done("Experiments")

            # Get model serving endpoints
            utils_ui.print_extracting("Serving Endpoints")
            serving_endpoints = self._get_serving_endpoints()
            utils_ui.print_extraction_done("Serving Endpoints")

            # Get SQL alerts
            utils_ui.print_extracting("Alerts")
            alerts = self._get_alerts()
            utils_ui.print_extraction_done("Alerts")

            # Get Genie spaces
            utils_ui.print_extracting("Genie Spaces")
            genie_spaces = self._get_genie_spaces()
            utils_ui.print_extraction_done("Genie Spaces")

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
                external_locations=external_locations,
                connections=connections,
                secret_scopes=secret_scopes,
                assessment_metadata=assessment_metadata,
                pipelines=pipelines,
                repos=repos,
                experiments=experiments,
                serving_endpoints=serving_endpoints,
                alerts=alerts,
                genie_spaces=genie_spaces,
                workspace_url=workspace_info.url,
            )

        except Exception as e:
            raise Exception(f"Failed to assess workspace {workspace_name}: {e}")

    def _get_workspace_info(self, workspace_name: str) -> DatabricksWorkspaceInfo:
        """Get Databricks workspace information.

        Returns cached info if available, otherwise fetches all workspaces
        from the management API and looks up the requested one.
        """
        cache_key = workspace_name.lower()
        if cache_key in self._workspace_cache:
            return self._workspace_cache[cache_key]

        # Fetch all workspaces and populate cache
        self.get_workspaces()

        if cache_key in self._workspace_cache:
            return self._workspace_cache[cache_key]

        raise ValueError(f"Workspace not found: {workspace_name}")

    def _get_clusters(self) -> DatabricksClusters:
        try:
            args = Namespace()
            args.uri = f"/api/2.0/clusters/list"
            req = self.api_client.do_request(args)
            json_req = req.json()
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
                    policy_id=cluster.get("policy_id"),
                    driver_node_type_id=cluster.get("driver_node_type_id"),
                    custom_tags=cluster.get("custom_tags"),
                    default_tags=cluster.get("default_tags"),
                    autotermination_minutes=cluster.get("autotermination_minutes"),
                    cluster_source=cluster.get("cluster_source"),
                    state_message=cluster.get("state_message"),
                    creator_user_name=cluster.get("creator_user_name"),
                    start_time=(
                        datetime.fromtimestamp(
                            cluster["start_time"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if cluster.get("start_time")
                        else None
                    ),
                    terminated_time=(
                        datetime.fromtimestamp(
                            cluster["terminated_time"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if cluster.get("terminated_time")
                        else None
                    ),
                    spark_conf=cluster.get("spark_conf"),
                    enable_elastic_disk=cluster.get("enable_elastic_disk"),
                    init_scripts_count=(
                        len(cluster["init_scripts"])
                        if cluster.get("init_scripts")
                        else 0
                    ),
                    enable_local_disk_encryption=cluster.get(
                        "enable_local_disk_encryption"
                    ),
                    instance_pool_id=cluster.get("instance_pool_id"),
                    driver_instance_pool_id=cluster.get("driver_instance_pool_id"),
                    azure_attributes=cluster.get("azure_attributes"),
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
                    warehouse_id=warehouse.get("id"),
                    auto_stop_mins=warehouse.get("auto_stop_mins"),
                    state=warehouse.get("state"),
                    creator_name=warehouse.get("creator_name"),
                    warehouse_type=warehouse.get("warehouse_type"),
                    spot_instance_policy=warehouse.get("spot_instance_policy"),
                    channel=(
                        warehouse.get("channel", {}).get("name")
                        if isinstance(warehouse.get("channel"), dict)
                        else warehouse.get("channel")
                    ),
                    json_response=warehouse,
                )
                for warehouse in json_req.get("warehouses", [])
            ]

            return DatabricksSqlWarehouses(sql_warehouses=sql_warehouses)

        except Exception as e:
            print(f"Failed to get SQL warehouses: {e}")
            return DatabricksSqlWarehouses(sql_warehouses=[])

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
                        content = ""
                        created_by = obj.get("created_by")
                        created_at = (
                            datetime.fromtimestamp(
                                obj["created_at"] / 1000, tz=timezone.utc
                            ).isoformat()
                            if obj.get("created_at")
                            else None
                        )
                        modified_at = (
                            datetime.fromtimestamp(
                                obj["modified_at"] / 1000, tz=timezone.utc
                            ).isoformat()
                            if obj.get("modified_at")
                            else None
                        )
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

                        # Check for dbutils in notebook content
                        uses_dbutils = self._check_notebook_for_dbutils(content)

                        notebooks.append(
                            DatabricksNotebook(
                                path=obj_path,
                                default_language=lang,
                                embedded_languages=embedded_langs,
                                other_magics=magics,
                                json_response=obj,  # TODO: Add the export response instead of list respose?
                                uses_dbutils=uses_dbutils,
                                created_by=created_by,
                                created_at=created_at,
                                modified_at=modified_at,
                            )
                        )
                    elif obj["object_type"] == "DIRECTORY":
                        traverse(obj_path)

            traverse("/")

            return DatabricksNotebooks(notebooks=notebooks)

        except Exception as e:
            print(f"Failed to get notebooks: {e}")
            return DatabricksNotebooks(notebooks=[])

    def _check_notebook_for_dbutils(self, content: str) -> bool:
        """Check if notebook content contains dbutils references.

        Args:
            content: Base64-encoded notebook content

        Returns:
            True if dbutils is found in the notebook content
        """
        if not content:
            return False
        try:
            # Decode base64 content
            decoded_content = base64.b64decode(content).decode("utf-8")
            return "dbutils" in decoded_content
        except Exception:
            return False

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

        # Extract schedule info
        schedule_raw = settings.get("schedule")
        schedule = None
        if schedule_raw:
            schedule = {
                "cron_expression": schedule_raw.get("quartz_cron_expression"),
                "timezone_id": schedule_raw.get("timezone_id"),
                "pause_status": schedule_raw.get("pause_status"),
            }

        # Extract email notifications
        email_raw = settings.get("email_notifications")
        email_notifications = None
        if email_raw:
            email_notifications = {
                "on_success": email_raw.get("on_success", []),
                "on_failure": email_raw.get("on_failure", []),
                "on_start": email_raw.get("on_start", []),
            }

        # Build task list with enriched fields
        tasks_list = []
        if (
            settings.get("format") == "MULTI_TASK"
        ):  # format can be SINGLE_TASK | MULTI_TASK
            for task in settings.get("tasks", []):
                # Determine cluster type and config
                cluster_type = None
                cluster_config = None
                if task.get("existing_cluster_id"):
                    cluster_type = "existing"
                    cluster_config = {
                        "existing_cluster_id": task["existing_cluster_id"]
                    }
                elif task.get("job_cluster_key"):
                    cluster_type = "job_cluster"
                    cluster_config = {"job_cluster_key": task["job_cluster_key"]}
                elif task.get("new_cluster"):
                    cluster_type = "new_cluster"
                    nc = task["new_cluster"]
                    cluster_config = {
                        "spark_version": nc.get("spark_version"),
                        "node_type_id": nc.get("node_type_id"),
                        "num_workers": nc.get("num_workers"),
                    }

                tasks_list.append(
                    DatabricksJobTask(
                        name=task.get("task_key", ""),
                        type=self._extract_task_type(task),
                        libraries=task.get("libraries", {}),
                        json_response=task,
                        task_key=task.get("task_key"),
                        description=task.get("description"),
                        timeout_seconds=task.get("timeout_seconds"),
                        max_retries=task.get("max_retries"),
                        cluster_type=cluster_type,
                        cluster_config=cluster_config,
                    )
                )

        # Extract creator and created_time from the job list response
        creator_user_name = job.get("creator_user_name")
        created_time = (
            datetime.fromtimestamp(
                job["created_time"] / 1000, tz=timezone.utc
            ).isoformat()
            if job.get("created_time")
            else None
        )

        return DatabricksJob(
            job_id=job_id,
            tasks=DatabricksJobTasks(tasks=tasks_list),
            settings=DatabricksJobSettings(
                name=settings.get("name"),
                json_response=settings,
                timeout_seconds=settings.get("timeout_seconds"),
                max_concurrent_runs=settings.get("max_concurrent_runs"),
                format=settings.get("format"),
                schedule=schedule,
                email_notifications=email_notifications,
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
            creator_user_name=creator_user_name,
            created_time=created_time,
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

    def _get_optional_long(self, data: Optional[str]) -> Optional[int]:
        if data is not None:
            try:
                return int(data)
            except (ValueError, TypeError):
                return None
        return None

    def _get_tables(self, catalog_name: str, schema_name: str) -> list[DatabricksTable]:
        """Get databases and tables in the workspace."""
        try:
            args = Namespace()
            args.uri = f"/api/2.1/unity-catalog/tables?catalog_name={catalog_name}&schema_name={schema_name}"
            req = self.api_client.do_request(args)
            json_req = req.json()
            tables = [
                DatabricksTable(
                    name=table.get("name"),
                    catalog=table.get("catalog_name"),
                    schema=table.get("schema_name"),
                    type=table.get("table_type"),
                    format=table.get("data_source_format"),
                    columns=len(table.get("columns", [])),
                    comment=table.get("comment"),
                    statistics_size_bytes=self._get_optional_long(
                        table.get("properties", {}).get(
                            "spark.sql.statistics.totalSize", None
                        )
                    ),
                    statistics_row_count=self._get_optional_long(
                        table.get("properties", {}).get(
                            "spark.sql.statistics.numRows", None
                        )
                    ),
                    full_name=table.get("full_name"),
                    storage_location=table.get("storage_location"),
                    created_at=(
                        datetime.fromtimestamp(
                            table["created_at"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if table.get("created_at")
                        else None
                    ),
                    updated_at=(
                        datetime.fromtimestamp(
                            table["updated_at"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if table.get("updated_at")
                        else None
                    ),
                    created_by=table.get("created_by"),
                    updated_by=table.get("updated_by"),
                    table_id=table.get("table_id"),
                    properties=table.get("properties"),
                    view_definition=table.get("view_definition"),
                    json_response=table,
                )
                for table in json_req.get("tables", [])
            ]
            return tables
        except Exception as e:
            print(f"Failed to get catalogs: {e}")
            return []

    def _get_volumes(
        self, catalog_name: str, schema_name: str
    ) -> list[DatabricksVolume]:
        """Get volumes in the workspace."""
        try:
            args = Namespace()
            args.uri = f"/api/2.1/unity-catalog/volumes?catalog_name={catalog_name}&schema_name={schema_name}"
            req = self.api_client.do_request(args)
            json_req = req.json()
            volumes = [
                DatabricksVolume(
                    name=volume.get("name"),
                    catalog=volume.get("catalog_name"),
                    schema=volume.get("schema_name"),
                    storage_location=volume.get("storage_location"),
                    type=volume.get("type"),
                    json_response=volume,
                )
                for volume in json_req.get("volumes", [])
            ]
            return volumes
        except Exception as e:
            print(f"Failed to get volumes: {e}")
            return []

    def _get_functions(
        self, catalog_name: str, schema_name: str
    ) -> list[DatabricksFunction]:
        """Get functions in the workspace."""
        try:
            args = Namespace()
            args.uri = f"/api/2.1/unity-catalog/functions?catalog_name={catalog_name}&schema_name={schema_name}"
            req = self.api_client.do_request(args)
            json_req = req.json()
            functions = [
                DatabricksFunction(
                    name=function.get("name"),
                    catalog=function.get("catalog_name"),
                    schema=function.get("schema_name"),
                    language=function.get("external_language"),
                    full_data_type=function.get("full_data_type"),
                    json_response=function,
                )
                for function in json_req.get("functions", [])
            ]
            return functions
        except Exception as e:
            print(f"Failed to get functions: {e}")
            return []

    def _get_schemas(self, catalog_name: str) -> DatabricksSchemas:
        """Get databases and tables in the workspace."""
        try:
            args = Namespace()
            args.uri = f"/api/2.1/unity-catalog/schemas?catalog_name={catalog_name}"
            req = self.api_client.do_request(args)
            json_req = req.json()
            schemas = [
                DatabricksSchema(
                    name=schema.get("name"),
                    catalog=catalog_name,
                    comment=schema.get("comment"),
                    storage_root=schema.get("storage_root"),
                    tables=self._get_tables(catalog_name, schema.get("name")),
                    volumes=self._get_volumes(catalog_name, schema.get("name")),
                    functions=self._get_functions(catalog_name, schema.get("name")),
                    json_response=schema,
                )
                for schema in json_req.get("schemas", [])
            ]
            return DatabricksSchemas(schemas=schemas)
        except Exception as e:
            print(f"Failed to get catalogs: {e}")
            return DatabricksSchemas(schemas=[])

    def _get_catalogs(self) -> DatabricksCatalogs:
        """Get catalogs in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.1/unity-catalog/catalogs"
            req = self.api_client.do_request(args)
            json_req = req.json()
            catalogs = [
                DatabricksCatalog(
                    name=catalog.get("name"),
                    comment=catalog.get("comment"),
                    owner=catalog.get("owner"),
                    storage_root=catalog.get("storage_root"),
                    schemas=self._get_schemas(catalog.get("name")),
                    json_response=catalog,
                )
                for catalog in json_req.get("catalogs", [])
            ]
            return DatabricksCatalogs(catalogs=catalogs)
        except Exception as e:
            print(f"Failed to get catalogs: {e}")
            return DatabricksCatalogs(catalogs=[])

    def _get_external_locations(self) -> DatabricksExternalLocations:
        """Get external locations in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.1/unity-catalog/external-locations"
            req = self.api_client.do_request(args)
            json_req = req.json()
            external_locations = [
                DatabricksExternalLocation(
                    name=location.get("name"),
                    url=location.get("url"),
                    comment=location.get("comment"),
                    json_response=location,
                )
                for location in json_req.get("external_locations", [])
            ]
            return DatabricksExternalLocations(external_locations=external_locations)
        except Exception as e:
            print(f"Failed to get external locations: {e}")
            return DatabricksExternalLocations(external_locations=[])

    def _get_connections(self) -> DatabricksConnections:
        """Get connections in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.1/unity-catalog/connections"
            req = self.api_client.do_request(args)
            json_req = req.json()
            connections = [
                DatabricksConnection(
                    name=connection.get("name"),
                    type=connection.get("connection_type"),
                    credential_type=connection.get("credential_type"),
                    url=connection.get("url"),
                    json_response=connection,
                )
                for connection in json_req.get("connections", [])
            ]
            return DatabricksConnections(connections=connections)
        except Exception as e:
            print(f"Failed to get connections: {e}")
            return DatabricksConnections(connections=[])

    def _get_secret_scopes(self) -> DatabricksSecretScopes:
        """Get secret scopes in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/secrets/scopes/list"
            req = self.api_client.do_request(args)
            json_req = req.json()
            secret_scopes = [
                DatabricksSecretScope(
                    name=scope.get("name"),
                    backend_type=scope.get("backend_type"),
                    json_response=scope,
                )
                for scope in json_req.get("scopes", [])
            ]
            return DatabricksSecretScopes(secret_scopes=secret_scopes)
        except Exception as e:
            print(f"Failed to get secret scopes: {e}")
            return DatabricksSecretScopes(secret_scopes=[])

    def _get_pipelines(self) -> DatabricksPipelines:
        """Get Delta Live Tables pipelines in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/pipelines"
            req = self.api_client.do_request(args)
            json_req = req.json()
            pipelines = [
                DatabricksPipeline(
                    pipeline_id=p.get("pipeline_id"),
                    name=p.get("name"),
                    state=p.get("state"),
                    creator_user_name=p.get("creator_user_name"),
                    json_response=p,
                )
                for p in json_req.get("statuses", [])
            ]
            return DatabricksPipelines(pipelines=pipelines)
        except Exception as e:
            print(f"Failed to get pipelines: {e}")
            return DatabricksPipelines(pipelines=[])

    def _get_repos(self) -> DatabricksRepos:
        """Get Git repos in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/repos"
            req = self.api_client.do_request(args)
            json_req = req.json()
            repos = [
                DatabricksRepo(
                    repo_id=str(r.get("id", "")),
                    path=r.get("path", ""),
                    url=r.get("url"),
                    provider=r.get("provider"),
                    branch=r.get("branch"),
                    head_commit_id=r.get("head_commit_id"),
                    json_response=r,
                )
                for r in json_req.get("repos", [])
            ]
            return DatabricksRepos(repos=repos)
        except Exception as e:
            print(f"Failed to get repos: {e}")
            return DatabricksRepos(repos=[])

    def _get_experiments(self) -> DatabricksExperiments:
        """Get MLflow experiments in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/mlflow/experiments/search"
            req = self.api_client.do_request(args)
            json_req = req.json()
            experiments = [
                DatabricksExperiment(
                    experiment_id=exp.get("experiment_id", ""),
                    name=exp.get("name", ""),
                    artifact_location=exp.get("artifact_location"),
                    lifecycle_stage=exp.get("lifecycle_stage"),
                    creation_time=(
                        datetime.fromtimestamp(
                            int(exp["creation_time"]) / 1000, tz=timezone.utc
                        ).isoformat()
                        if exp.get("creation_time")
                        else None
                    ),
                    last_update_time=(
                        datetime.fromtimestamp(
                            int(exp["last_update_time"]) / 1000, tz=timezone.utc
                        ).isoformat()
                        if exp.get("last_update_time")
                        else None
                    ),
                    json_response=exp,
                )
                for exp in json_req.get("experiments", [])
            ]
            return DatabricksExperiments(experiments=experiments)
        except Exception as e:
            print(f"Failed to get experiments: {e}")
            return DatabricksExperiments(experiments=[])

    def _get_serving_endpoints(self) -> DatabricksServingEndpoints:
        """Get model serving endpoints in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/serving-endpoints"
            req = self.api_client.do_request(args)
            json_req = req.json()
            endpoints = [
                DatabricksServingEndpoint(
                    name=ep.get("name", ""),
                    creator=ep.get("creator"),
                    state=(
                        ep.get("state", {}).get("config_update")
                        if isinstance(ep.get("state"), dict)
                        else None
                    ),
                    creation_timestamp=(
                        datetime.fromtimestamp(
                            ep["creation_timestamp"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if ep.get("creation_timestamp")
                        else None
                    ),
                    last_updated_timestamp=(
                        datetime.fromtimestamp(
                            ep["last_updated_timestamp"] / 1000, tz=timezone.utc
                        ).isoformat()
                        if ep.get("last_updated_timestamp")
                        else None
                    ),
                    json_response=ep,
                )
                for ep in json_req.get("endpoints", [])
            ]
            return DatabricksServingEndpoints(serving_endpoints=endpoints)
        except Exception as e:
            print(f"Failed to get serving endpoints: {e}")
            return DatabricksServingEndpoints(serving_endpoints=[])

    def _get_alerts(self) -> DatabricksAlerts:
        """Get SQL alerts in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/sql/alerts"
            req = self.api_client.do_request(args)
            json_req = req.json()
            # The alerts API may return a list directly or under "results" key
            alerts_data = (
                json_req if isinstance(json_req, list) else json_req.get("results", [])
            )
            alerts = [
                DatabricksAlert(
                    alert_id=alert.get("id", ""),
                    display_name=alert.get("display_name") or alert.get("name"),
                    query_id=alert.get("query_id"),
                    owner_user_name=alert.get("owner_user_name"),
                    state=alert.get("state"),
                    json_response=alert,
                )
                for alert in alerts_data
            ]
            return DatabricksAlerts(alerts=alerts)
        except Exception as e:
            print(f"Failed to get alerts: {e}")
            return DatabricksAlerts(alerts=[])

    def _get_genie_spaces(self) -> DatabricksGenieSpaces:
        """Get Genie spaces in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/genie/spaces"
            req = self.api_client.do_request(args)
            json_req = req.json()
            spaces = [
                DatabricksGenieSpace(
                    space_id=space.get("space_id", ""),
                    title=space.get("title"),
                    description=space.get("description"),
                    warehouse_id=space.get("warehouse_id"),
                    json_response=space,
                )
                for space in json_req.get("spaces", [])
            ]
            return DatabricksGenieSpaces(genie_spaces=spaces)
        except Exception as e:
            print(f"Failed to get Genie spaces: {e}")
            return DatabricksGenieSpaces(genie_spaces=[])

    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime

        return datetime.now().isoformat()
