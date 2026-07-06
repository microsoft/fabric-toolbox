import base64
import json
import os
import re
from argparse import Namespace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from databricks.sdk import AccountClient, WorkspaceClient

from ..assessment.common import AssessmentStatus
from ..errors.api import FATError
from ..assessment.databricks import (
    DatabricksAlert,
    DatabricksAlerts,
    DatabricksAssessment,
    DatabricksAssessmentMetadata,
    DatabricksCatalog,
    DatabricksCatalogs,
    DatabricksCluster,
    DatabricksClusterPolicies,
    DatabricksClusterPolicy,
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
    DatabricksInstancePool,
    DatabricksInstancePools,
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
    DatabricksNetworkSettings,
)
from ..utils import ui as utils_ui
from .api_client import ApiClient, ApiResponse
from .token_provider import TokenProvider, create_token_provider


class _CountOnlyCollection:
    """Lightweight stub for resource collections loaded from disk.

    Supports len() on the collection field for summary count purposes.
    """

    def __init__(self, field_name: str, count: int):
        # Create an attribute with the given field name containing a list of `count` items
        setattr(self, field_name, [None] * count)


def _normalize_notebook_path(path: str) -> str:
    """Normalize a notebook path by removing the /Workspace prefix.

    The Databricks Jobs API stores paths with /Workspace/ prefix but the
    Workspace listing API returns paths without it.
    """
    if path and path.startswith("/Workspace/"):
        return path[len("/Workspace") :]
    return path or ""


class DatabricksClient:
    """Client for Databricks APIs."""

    def __init__(
        self,
        subscription_id: Optional[str] = None,
        token_provider: Optional[TokenProvider] = None,
        auth_method: Optional[str] = None,
        cloud: str = "azure",
        **kwargs,
    ):
        """
        Initialize Databricks client.

        Args:
            subscription_id: Azure subscription ID (optional, will use Azure CLI default if not provided)
            token_provider: Optional TokenProvider instance for authentication
            auth_method: Authentication method ("azure-cli", "fabric", or None for auto-detect)
            cloud: Cloud provider for the Databricks workspace ("azure" or "aws")
        """
        self.cloud = (cloud or "azure").lower()
        if self.cloud not in {"azure", "aws"}:
            raise ValueError(f"Unsupported Databricks cloud: {cloud}")

        self.token_provider = (
            token_provider or create_token_provider(auth_method)
            if self.cloud == "azure"
            else token_provider
        )
        self.custom_subscription_id = subscription_id
        self.account_client: Optional[AccountClient] = None
        self.authenticate()
        self._workspace_cache: dict[str, DatabricksWorkspaceInfo] = {}
        self.extraction_warnings: list[str] = []

    def authenticate(self) -> None:
        """Authenticate with the configured Databricks cloud."""
        if self.cloud == "aws":
            self._validate_aws_environment()
            self.subscription_id = None
            if os.getenv("DATABRICKS_ACCOUNT_ID") and self._has_aws_oauth_credentials():
                self.account_client = AccountClient(
                    host=os.getenv(
                        "DATABRICKS_ACCOUNT_HOST",
                        "https://accounts.cloud.databricks.com",
                    ),
                    account_id=os.environ["DATABRICKS_ACCOUNT_ID"],
                    client_id=os.environ["DATABRICKS_CLIENT_ID"],
                    client_secret=os.environ["DATABRICKS_CLIENT_SECRET"],
                )
            return

        try:
            azure_token = self.token_provider.get_token(
                "https://management.azure.com/.default"
            )
            self.azure_client = ApiClient(token=azure_token, api_version="2026-01-01")

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

    def _validate_aws_environment(self) -> None:
        """Validate Databricks AWS environment-variable authentication."""
        has_pat = bool(os.getenv("DATABRICKS_TOKEN"))
        has_oauth = self._has_aws_oauth_credentials()
        has_host = bool(os.getenv("DATABRICKS_HOST"))

        if not has_pat and not has_oauth:
            raise ValueError(
                "AWS Databricks assessments require DATABRICKS_TOKEN or "
                "DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET to be set"
            )

        if has_pat and not has_oauth and not has_host:
            raise ValueError(
                "AWS Databricks assessments using DATABRICKS_TOKEN also require "
                "DATABRICKS_HOST to be set"
            )

    @staticmethod
    def _has_aws_oauth_credentials() -> bool:
        return bool(os.getenv("DATABRICKS_CLIENT_ID")) and bool(
            os.getenv("DATABRICKS_CLIENT_SECRET")
        )

    def get_workspaces(self) -> list[DatabricksWorkspaceInfo]:
        """Get all Databricks workspaces in the subscription.

        Used for interactive workspace selection when no workspace names are provided.
        """
        if self.cloud == "aws":
            if self.account_client:
                workspaces = [
                    self._build_aws_account_workspace_info(workspace)
                    for workspace in self.account_client.workspaces.list()
                ]
                for workspace in workspaces:
                    self._workspace_cache[workspace.name.lower()] = workspace
                return workspaces

            raise ValueError(
                "AWS Databricks workspace selection requires DATABRICKS_ACCOUNT_ID, "
                "DATABRICKS_CLIENT_ID, and DATABRICKS_CLIENT_SECRET so workspaces "
                "can be listed through the Databricks account API."
            )

        args = Namespace()
        # https://learn.microsoft.com/en-us/rest/api/databricks/workspaces/list-by-subscription?view=rest-databricks-2024-05-01&tabs=HTTP
        args.uri = f"/subscriptions/{self.subscription_id}/providers/Microsoft.Databricks/workspaces"
        req = self.azure_client.do_request(args)

        json_req = req.json()

        workspaces = [
            self._build_workspace_info(workspace)
            for workspace in json_req.get("value", [])
        ]

        # Populate cache
        for ws in workspaces:
            self._workspace_cache[ws.name.lower()] = ws

        return workspaces

    def _build_aws_host_workspace_info(
        self, workspace_name: str, workspace_host: Optional[str] = None
    ) -> DatabricksWorkspaceInfo:
        """Build workspace info for an AWS Databricks workspace from environment variables."""
        workspace_host = self._normalize_workspace_host(
            workspace_host or os.environ["DATABRICKS_HOST"]
        )
        workspace_url = self._format_workspace_url(workspace_host)
        region = os.getenv("DATABRICKS_WORKSPACE_REGION")

        return DatabricksWorkspaceInfo(
            id=workspace_host,
            name=workspace_name,
            resource_group="",
            url=workspace_url,
            status="unknown",
            tier=os.getenv("DATABRICKS_WORKSPACE_TIER", "unknown"),
            location=region,
            workspace_type="aws",
            json_response={
                "cloud": "aws",
                "workspace_name": workspace_name,
                "workspace_url": workspace_url,
                "region": region,
                "source": "environment",
            },
        )

    def _build_aws_account_workspace_info(
        self, workspace: Any
    ) -> DatabricksWorkspaceInfo:
        """Build workspace info for an AWS Databricks account workspace."""
        workspace_name = getattr(workspace, "workspace_name", None)
        deployment_name = getattr(workspace, "deployment_name", None)
        workspace_id = getattr(workspace, "workspace_id", None)
        if not workspace_name:
            raise ValueError("Databricks account workspace is missing workspace_name")
        if not deployment_name:
            raise ValueError(
                f"Databricks account workspace is missing deployment_name: {workspace_name}"
            )

        workspace_host = self._aws_deployment_to_host(deployment_name)
        workspace_status = getattr(workspace, "workspace_status", None)
        pricing_tier = getattr(workspace, "pricing_tier", None)
        workspace_json = (
            workspace.as_dict()
            if hasattr(workspace, "as_dict")
            else dict(vars(workspace))
        )

        return DatabricksWorkspaceInfo(
            id=str(workspace_id or workspace_host),
            name=workspace_name,
            resource_group="",
            url=self._format_workspace_url(workspace_host),
            status=str(workspace_status) if workspace_status else "unknown",
            tier=str(pricing_tier) if pricing_tier else "unknown",
            location=getattr(workspace, "aws_region", None)
            or getattr(workspace, "location", None),
            workspace_type="aws",
            json_response=workspace_json,
        )

    @staticmethod
    def _aws_deployment_to_host(deployment_name: str) -> str:
        deployment_host = DatabricksClient._normalize_workspace_host(deployment_name)
        if "." in deployment_host:
            return deployment_host
        return f"{deployment_host}.cloud.databricks.com"

    def _derive_aws_workspace_name(self) -> str:
        """Derive a stable workspace name from DATABRICKS_HOST."""
        workspace_host = self._normalize_workspace_host(os.environ["DATABRICKS_HOST"])
        return workspace_host.split(".")[0]

    @staticmethod
    def _build_workspace_info(workspace: dict) -> DatabricksWorkspaceInfo:
        """Build a DatabricksWorkspaceInfo from a management-plane response.

        Derives ``workspace_type`` and network topology fields from the
        ``properties.parameters`` and ``properties.privateEndpointConnections``
        blocks returned by the Azure Databricks ARM API.
        """
        properties = workspace.get("properties") or {}
        parameters = properties.get("parameters") or {}
        custom_vnet = (parameters.get("customVirtualNetworkId") or {}).get("value")
        private_endpoint_conns = properties.get("privateEndpointConnections") or []
        raw_pna = properties.get("publicNetworkAccess")
        managed_rg_id = properties.get("managedResourceGroupId") or ""
        managed_rg_name = managed_rg_id.split("/")[-1] if managed_rg_id else None

        vnet_injected = bool(custom_vnet)
        uses_private_endpoints = (
            len(private_endpoint_conns) > 0 or raw_pna == "Disabled"
        )
        # Azure Databricks treats a missing ``publicNetworkAccess`` value as
        # the implicit default of "Enabled" (it is only populated explicitly
        # on newer workspaces and on Private Link configurations). Normalise
        # to a non-null value so reports don't show "N/A" for workspaces
        # where the field simply wasn't set.
        public_network_access = raw_pna if raw_pna else "Enabled"
        npip_value = (parameters.get("enableNoPublicIp") or {}).get("value")
        no_public_ip = bool(npip_value) if npip_value is not None else None
        # ``computeMode`` is the authoritative ARM property: "Hybrid" workspaces
        # support classic compute (whether on a managed or customer VNet);
        # "Serverless" workspaces have classic compute disabled. We fall back
        # to the presence of a managed resource group when the field is
        # missing (older API versions) — only Hybrid workspaces have one.
        compute_mode = (properties.get("computeMode") or "").strip()
        if compute_mode:
            workspace_type = compute_mode.lower()
        else:
            workspace_type = "hybrid" if managed_rg_name else "serverless"

        network_settings = DatabricksNetworkSettings(
            vnet_injected=vnet_injected,
            custom_virtual_network_id=custom_vnet,
            uses_private_endpoints=uses_private_endpoints,
            public_network_access=public_network_access,
            private_endpoint_count=len(private_endpoint_conns),
            no_public_ip=no_public_ip,
        )

        return DatabricksWorkspaceInfo(
            id=workspace["id"],
            name=workspace["name"],
            resource_group=workspace["id"].split("/")[4],
            url=properties.get("workspaceUrl"),
            status=properties.get("provisioningState"),
            tier=workspace["sku"]["name"],
            location=workspace.get("location"),
            managed_resource_group=managed_rg_name,
            workspace_type=workspace_type,
            vnet_injected=vnet_injected,
            custom_virtual_network_id=custom_vnet,
            uses_private_endpoints=uses_private_endpoints,
            public_network_access=public_network_access,
            private_endpoint_count=len(private_endpoint_conns),
            no_public_ip=no_public_ip,
            network_settings=network_settings,
            json_response=workspace,
        )

    def _auth_databricks(self, workspace_url) -> None:
        api_host = self._normalize_workspace_host(workspace_url)

        if self.cloud == "aws":
            token = os.getenv("DATABRICKS_TOKEN")
            host = self._format_workspace_url(api_host)
            if token and not self.account_client:
                self.workspace_client = WorkspaceClient(host=host, token=token)
            else:
                self.workspace_client = WorkspaceClient(
                    host=host,
                    client_id=os.environ["DATABRICKS_CLIENT_ID"],
                    client_secret=os.environ["DATABRICKS_CLIENT_SECRET"],
                )
        else:
            databricks_token = self.token_provider.get_token(
                "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default"
            )
            self.workspace_client = WorkspaceClient(
                host=workspace_url, token=databricks_token
            )

        self.api_client = ApiClient(base_url=api_host, scope="", api_version="")
        # Reuse the authentication of the session of the Databricks API client
        self.api_client.session.auth = (
            self.workspace_client.api_client._api_client._session.auth
        )

    def assess_workspace(
        self,
        workspace_name: str,
        mode: str,
        resources: Optional[List[str]] = None,
        output_path: Optional[str] = None,
    ) -> DatabricksAssessment:
        """
        Assess a Databricks workspace.

        Args:
            workspace_name: Name of the Databricks workspace
            mode: Assessment mode (full, etc.)
            resources: Optional list of resource types to extract. When None, all
                resources are extracted. When specified, only listed types are
                fetched from the API; others are loaded from previously exported
                data on disk.
            output_path: Output directory where previous exports live (required
                when resources is specified)

        Returns:
            DatabricksAssessment object with all assessment data
        """
        if resources:
            utils_ui.print(
                f"Assessing Databricks workspace: {workspace_name} "
                f"(partial: {', '.join(resources)})"
            )
        else:
            utils_ui.print(
                f"Assessing Databricks workspace: {workspace_name} (mode: {mode})"
            )

        try:
            # Reset extraction warnings for this workspace
            self.extraction_warnings = []

            # Get workspace details
            workspace_info = self._get_workspace_info(workspace_name)

            # Use the workspace_info to authenticate the databricks client
            self._auth_databricks(workspace_info.url)

            # Determine which resources to extract
            _should_extract = (
                (lambda r: r in resources) if resources else (lambda r: True)
            )

            # Load existing data from disk for resources not being re-extracted
            disk_data = {}
            if resources and output_path:
                disk_data = self._load_resources_from_disk(
                    workspace_name, output_path, resources
                )

            # Get clusters
            if _should_extract("clusters"):
                utils_ui.print_extracting("Clusters")
                clusters = self._get_clusters()
                utils_ui.print_extraction_done("Clusters")
            else:
                clusters = disk_data.get("clusters", DatabricksClusters(clusters=[]))

            # Get SQL Warehouses
            if _should_extract("sql_warehouses"):
                utils_ui.print_extracting("SQL Warehouses")
                sql_warehouses = self._get_sql_warehouses()
                utils_ui.print_extraction_done("SQL Warehouses")
            else:
                sql_warehouses = disk_data.get(
                    "sql_warehouses", DatabricksSqlWarehouses(sql_warehouses=[])
                )

            # Get notebooks
            if _should_extract("notebooks"):
                utils_ui.print_extracting("Notebooks")
                notebooks = self._get_notebooks()
                utils_ui.print_extraction_done("Notebooks")
            else:
                notebooks = disk_data.get(
                    "notebooks", DatabricksNotebooks(notebooks=[])
                )

            # Get jobs
            if _should_extract("jobs"):
                utils_ui.print_extracting("Jobs")
                jobs = self._get_jobs()
                utils_ui.print_extraction_done("Jobs")
            else:
                jobs = disk_data.get("jobs", DatabricksJobs(jobs=[]))

            # Cross-reference notebooks with job execution data
            if _should_extract("notebooks") or _should_extract("jobs"):
                notebooks = self._annotate_notebooks_with_job_execution(notebooks, jobs)

            # Get catalogs
            if _should_extract("catalogs"):
                utils_ui.print_extracting("Catalogs")
                catalogs = self._get_catalogs()
                utils_ui.print_extraction_done("Catalogs")
            else:
                catalogs = disk_data.get("catalogs", DatabricksCatalogs(catalogs=[]))

            # Get external locations
            if _should_extract("external_locations"):
                utils_ui.print_extracting("External Locations")
                external_locations = self._get_external_locations()
                utils_ui.print_extraction_done("External Locations")
            else:
                external_locations = disk_data.get(
                    "external_locations",
                    DatabricksExternalLocations(external_locations=[]),
                )

            # Get connections
            if _should_extract("connections"):
                utils_ui.print_extracting("Connections")
                connections = self._get_connections()
                utils_ui.print_extraction_done("Connections")
            else:
                connections = disk_data.get(
                    "connections", DatabricksConnections(connections=[])
                )

            # Get secret scopes
            if _should_extract("secret_scopes"):
                utils_ui.print_extracting("Secret Scopes")
                secret_scopes = self._get_secret_scopes()
                utils_ui.print_extraction_done("Secret Scopes")
            else:
                secret_scopes = disk_data.get(
                    "secret_scopes", DatabricksSecretScopes(secret_scopes=[])
                )

            # Get DLT pipelines
            if _should_extract("pipelines"):
                utils_ui.print_extracting("Pipelines")
                pipelines = self._get_pipelines()
                utils_ui.print_extraction_done("Pipelines")
            else:
                pipelines = disk_data.get(
                    "pipelines", DatabricksPipelines(pipelines=[])
                )

            # Get Git repos
            if _should_extract("repos"):
                utils_ui.print_extracting("Repos")
                repos = self._get_repos()
                utils_ui.print_extraction_done("Repos")
            else:
                repos = disk_data.get("repos", DatabricksRepos(repos=[]))

            # Get MLflow experiments
            if _should_extract("experiments"):
                utils_ui.print_extracting("Experiments")
                experiments = self._get_experiments()
                utils_ui.print_extraction_done("Experiments")
            else:
                experiments = disk_data.get(
                    "experiments", DatabricksExperiments(experiments=[])
                )

            # Get model serving endpoints
            if _should_extract("serving_endpoints"):
                utils_ui.print_extracting("Serving Endpoints")
                serving_endpoints = self._get_serving_endpoints()
                utils_ui.print_extraction_done("Serving Endpoints")
            else:
                serving_endpoints = disk_data.get(
                    "serving_endpoints",
                    DatabricksServingEndpoints(serving_endpoints=[]),
                )

            # Get SQL alerts
            if _should_extract("alerts"):
                utils_ui.print_extracting("Alerts")
                alerts = self._get_alerts()
                utils_ui.print_extraction_done("Alerts")
            else:
                alerts = disk_data.get("alerts", DatabricksAlerts(alerts=[]))

            # Get Genie spaces
            if _should_extract("genie_spaces"):
                utils_ui.print_extracting("Genie Spaces")
                genie_spaces = self._get_genie_spaces()
                utils_ui.print_extraction_done("Genie Spaces")
            else:
                genie_spaces = disk_data.get(
                    "genie_spaces", DatabricksGenieSpaces(genie_spaces=[])
                )

            # Get cluster policies (workspace-summary)
            if _should_extract("cluster_policies"):
                utils_ui.print_extracting("Cluster Policies")
                cluster_policies = self._get_cluster_policies()
                utils_ui.print_extraction_done("Cluster Policies")
            else:
                cluster_policies = disk_data.get(
                    "cluster_policies", DatabricksClusterPolicies(cluster_policies=[])
                )

            # Get instance pools (workspace-summary)
            if _should_extract("instance_pools"):
                utils_ui.print_extracting("Instance Pools")
                instance_pools = self._get_instance_pools()
                utils_ui.print_extraction_done("Instance Pools")
            else:
                instance_pools = disk_data.get(
                    "instance_pools", DatabricksInstancePools(instance_pools=[])
                )

            # Create assessment metadata
            assessment_metadata = DatabricksAssessmentMetadata(
                mode=mode, timestamp=self._get_timestamp()
            )

            # Determine final status based on extraction warnings
            if self.extraction_warnings:
                status = AssessmentStatus(
                    status="incomplete",
                    description=(
                        "Assessment completed with partial data. "
                        f"Failed to fully extract: {', '.join(self.extraction_warnings)}"
                    ),
                )
            else:
                status = AssessmentStatus(status="completed")

            # Return assessment object
            return DatabricksAssessment(
                status=status,
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
                cluster_policies=cluster_policies,
                instance_pools=instance_pools,
                workspace_url=workspace_info.url,
            )

        except Exception as e:
            raise Exception(f"Failed to assess workspace {workspace_name}: {e}")

    def _load_resources_from_disk(
        self,
        workspace_name: str,
        output_path: str,
        resources_to_extract: List[str],
    ) -> Dict[str, Any]:
        """Load previously exported resources from disk.

        Reads JSON files from the output directory for resource types that are
        NOT being re-extracted, reconstructing lightweight collection objects
        with enough data for summary computation.

        Args:
            workspace_name: Name of the workspace folder
            output_path: Base output directory
            resources_to_extract: Resources being freshly extracted (excluded from loading)

        Returns:
            Dict mapping resource type name to its collection dataclass
        """
        workspace_dir = Path(output_path) / workspace_name / "resources"
        loaded: Dict[str, Any] = {}

        # Mapping from resource name to (folder name, item class, collection class, collection field)
        resource_map = {
            "clusters": ("clusters", DatabricksCluster, DatabricksClusters, "clusters"),
            "sql_warehouses": (
                "sql_warehouses",
                DatabricksSqlWarehouse,
                DatabricksSqlWarehouses,
                "sql_warehouses",
            ),
            "notebooks": (
                "notebooks",
                DatabricksNotebook,
                DatabricksNotebooks,
                "notebooks",
            ),
            "jobs": ("jobs", DatabricksJob, DatabricksJobs, "jobs"),
            "pipelines": (
                "pipelines",
                DatabricksPipeline,
                DatabricksPipelines,
                "pipelines",
            ),
            "repos": ("repos", DatabricksRepo, DatabricksRepos, "repos"),
            "experiments": (
                "experiments",
                DatabricksExperiment,
                DatabricksExperiments,
                "experiments",
            ),
            "serving_endpoints": (
                "serving_endpoints",
                DatabricksServingEndpoint,
                DatabricksServingEndpoints,
                "serving_endpoints",
            ),
            "alerts": ("alerts", DatabricksAlert, DatabricksAlerts, "alerts"),
            "genie_spaces": (
                "genie_spaces",
                DatabricksGenieSpace,
                DatabricksGenieSpaces,
                "genie_spaces",
            ),
            "cluster_policies": (
                "cluster_policies",
                DatabricksClusterPolicy,
                DatabricksClusterPolicies,
                "cluster_policies",
            ),
            "instance_pools": (
                "instance_pools",
                DatabricksInstancePool,
                DatabricksInstancePools,
                "instance_pools",
            ),
            "external_locations": (
                "external_locations",
                DatabricksExternalLocation,
                DatabricksExternalLocations,
                "external_locations",
            ),
            "connections": (
                "connections",
                DatabricksConnection,
                DatabricksConnections,
                "connections",
            ),
            "secret_scopes": (
                "secret_scopes",
                DatabricksSecretScope,
                DatabricksSecretScopes,
                "secret_scopes",
            ),
        }

        for res_name, (folder, item_cls, coll_cls, field_name) in resource_map.items():
            if res_name in resources_to_extract:
                continue  # Will be freshly extracted

            folder_path = workspace_dir / folder
            if not folder_path.exists():
                continue

            items = []
            for json_file in sorted(folder_path.glob("*.json")):
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    # Extract the inner data (wrapped format)
                    inner = (
                        data.get(f"{res_name.rstrip('s')}_data")
                        or data.get(f"{folder.rstrip('s')}_data")
                        or data.get("data")
                        or data
                    )
                    # For counting purposes, store the raw dict
                    items.append(inner)
                except (json.JSONDecodeError, IOError):
                    continue

            # Build collection with count - use a lightweight approach
            # Store raw dicts; get_summary() only needs len()
            loaded[res_name] = self._build_collection_from_dicts(
                res_name, items, coll_cls, field_name
            )

        return loaded

    def _build_collection_from_dicts(
        self, res_name: str, items: List[dict], coll_cls: Any, field_name: str
    ) -> Any:
        """Build a collection dataclass from raw dict items loaded from disk.

        For summary purposes, we only need the collection to report accurate
        counts via len(). We store minimal dataclass instances.
        """
        if res_name == "notebooks":
            objs = [
                DatabricksNotebook(
                    path=item.get("path", ""),
                    default_language=item.get("default_language", ""),
                    embedded_languages=item.get("embedded_languages", []),
                    other_magics=item.get("other_magics", []),
                    json_response=item.get("json_response", {}),
                    uses_dbutils=item.get("uses_dbutils", False),
                    last_job_execution=item.get("last_job_execution"),
                    executed_by_jobs=item.get("executed_by_jobs"),
                )
                for item in items
            ]
            return DatabricksNotebooks(notebooks=objs)
        elif res_name == "jobs":
            objs = [
                DatabricksJob(
                    job_id=item.get("job_id", 0),
                    tasks=DatabricksJobTasks(
                        tasks=[
                            DatabricksJobTask(
                                name=t.get("name", ""),
                                type=t.get("type", ""),
                                libraries=t.get("libraries", {}),
                                json_response=t,
                                notebook_path=t.get("notebook_path"),
                            )
                            for t in (
                                item.get("tasks", {}).get("tasks", [])
                                if isinstance(item.get("tasks"), dict)
                                else item.get("tasks", [])
                            )
                        ]
                    ),
                    settings=DatabricksJobSettings(
                        name=(item.get("settings") or {}).get("name", ""),
                        json_response=item.get("settings", {}),
                    ),
                    latest_runs=DatabricksJobRuns(
                        runs=[
                            DatabricksJobRun(
                                id=r.get("id", ""),
                                state=r.get("state", ""),
                                result_state=r.get("result_state", ""),
                                start_time=r.get("start_time", ""),
                                end_time=r.get("end_time"),
                                execution_duration=r.get("execution_duration", "0"),
                                json_response=r,
                            )
                            for r in (
                                item.get("latest_runs", {}).get("runs", [])
                                if isinstance(item.get("latest_runs"), dict)
                                else []
                            )
                        ]
                    ),
                    avg_duration_ms_last_3_runs=item.get("avg_duration_ms_last_3_runs"),
                )
                for item in items
            ]
            return DatabricksJobs(jobs=objs)
        elif res_name == "clusters":
            objs = [
                DatabricksCluster(
                    cluster_id=item.get("cluster_id", ""),
                    cluster_name=item.get("cluster_name", ""),
                    state=item.get("state", ""),
                    json_response=item,
                )
                for item in items
            ]
            return DatabricksClusters(clusters=objs)
        else:
            # Generic: count-only stub using the collection length
            # Create a simple object that reports correct len()
            return _CountOnlyCollection(field_name, len(items))

    def _get_workspace_info(self, workspace_name: str) -> DatabricksWorkspaceInfo:
        """Get Databricks workspace information.

        Returns cached info if available, otherwise fetches all workspaces
        from the management API and looks up the requested one.
        """
        if self.cloud == "aws":
            workspace_info = self._get_aws_workspace_info(workspace_name)
            self._workspace_cache[workspace_info.name.lower()] = workspace_info
            return workspace_info

        cache_key = workspace_name.lower()
        if cache_key in self._workspace_cache:
            return self._workspace_cache[cache_key]

        # Fetch all workspaces and populate cache
        self.get_workspaces()

        if cache_key in self._workspace_cache:
            return self._workspace_cache[cache_key]

        raise ValueError(f"Workspace not found: {workspace_name}")

    def _get_aws_workspace_info(self, workspace_name: str) -> DatabricksWorkspaceInfo:
        """Resolve AWS workspace info from account API or single-workspace host env vars."""
        if workspace_name:
            cache_key = workspace_name.lower()
            if cache_key in self._workspace_cache:
                return self._workspace_cache[cache_key]

        if self.account_client:
            requested_name = workspace_name.lower()
            for account_workspace in self.account_client.workspaces.list():
                candidate = self._build_aws_account_workspace_info(account_workspace)
                self._workspace_cache[candidate.name.lower()] = candidate
                if (
                    candidate.name.lower() == requested_name
                    or self._normalize_workspace_host(candidate.url).lower()
                    == requested_name
                ):
                    return candidate

            raise ValueError(
                f"Workspace not found in Databricks account: {workspace_name}"
            )

        if workspace_name and self._is_workspace_host(workspace_name):
            workspace_host = self._normalize_workspace_host(workspace_name)
            return self._build_aws_host_workspace_info(
                workspace_host.split(".")[0],
                workspace_host=workspace_host,
            )

        if os.getenv("DATABRICKS_HOST"):
            env_workspace_name = (
                os.getenv("DATABRICKS_WORKSPACE_NAME")
                or self._derive_aws_workspace_name()
            )
            if workspace_name and workspace_name.lower() != env_workspace_name.lower():
                raise ValueError(
                    "AWS Databricks workspace-name resolution for multiple "
                    "workspaces requires DATABRICKS_ACCOUNT_ID with "
                    "DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET. "
                    "Alternatively, pass each AWS workspace as its workspace URL "
                    "or hostname."
                )
            return self._build_aws_host_workspace_info(
                workspace_name or env_workspace_name
            )

        raise ValueError(
            "AWS Databricks workspace-name resolution requires "
            "DATABRICKS_ACCOUNT_ID with DATABRICKS_CLIENT_ID and "
            "DATABRICKS_CLIENT_SECRET, or DATABRICKS_HOST for a single workspace."
        )

    @staticmethod
    def _normalize_workspace_host(workspace_url: str) -> str:
        """Return the Databricks workspace host without scheme or trailing slash."""
        parsed = urlparse(workspace_url)
        host = parsed.netloc if parsed.netloc else parsed.path
        return host.strip().strip("/")

    @staticmethod
    def _is_workspace_host(workspace_name: str) -> bool:
        """Return whether a workspace argument looks like a Databricks host or URL."""
        return "." in DatabricksClient._normalize_workspace_host(workspace_name)

    @staticmethod
    def _format_workspace_url(workspace_url: str) -> str:
        """Return a Databricks workspace URL with an https scheme."""
        if workspace_url.startswith("http://") or workspace_url.startswith("https://"):
            return workspace_url.rstrip("/")
        return f"https://{workspace_url.rstrip('/')}"

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
                    disk_spec=cluster.get("disk_spec"),
                    json_response=cluster,
                )
                for cluster in clusters_data
            ]

            if not clusters:
                utils_ui.print_warning(
                    "No clusters returned. This may indicate insufficient "
                    "permissions (the service principal needs CAN_ATTACH_TO "
                    "or workspace admin access to list clusters)."
                )

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
                    custom_tags=(
                        warehouse.get("tags", {}).get("custom_tags")
                        if isinstance(warehouse.get("tags"), dict)
                        else None
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
                        size = obj.get("size")
                        try:
                            args.uri = status_endpoint
                            args.request_params = {"path": obj_path}

                            status_json = self.api_client.do_request(args).json()
                            lang = status_json.get("language", "unknown")
                            # /api/2.0/workspace/list omits size for notebooks;
                            # get-status returns it reliably as bytes.
                            if size is None:
                                size = status_json.get("size")
                        except Exception:
                            pass
                        try:
                            args.uri = export_endpoint
                            args.request_params = {
                                "path": obj_path,
                                "format": "SOURCE",
                            }
                            content = (
                                self.api_client.do_request(args)
                                .json()
                                .get("content", "")
                            )
                            embedded_langs, magics = self._detect_embedded_magics(
                                content
                            )
                            # Databricks doesn't expose notebook size on list or
                            # get-status (those only return size for FILE). Fall
                            # back to the decoded SOURCE byte length.
                            if size is None and content:
                                try:
                                    size = len(base64.b64decode(content))
                                except Exception:
                                    pass
                        except Exception:
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
                                size=size,
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
            args.auto_paginate = False
            req = self.api_client.do_request(args)
            settings = req.json().get("settings", {})
        else:
            settings = job.get("settings", {})

        args = Namespace()
        args.uri = f"{base_endpoint}/runs/list?job_id={job_id}&limit=3"
        args.auto_paginate = False
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
                        notebook_path=(
                            task.get("notebook_task", {}).get("notebook_path")
                            or task.get("for_each_task", {})
                            .get("task", {})
                            .get("notebook_task", {})
                            .get("notebook_path")
                        ),
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

        # Compute average duration (ms) over the latest up-to-3 runs.
        # The /runs/list endpoint returns runs sorted newest-first. We prefer
        # ``run_duration`` (the wall-clock total now reported by Jobs 2.1+),
        # falling back to the legacy ``execution_duration`` and finally to the
        # sum of the three duration components for older API responses.
        def _run_duration_ms(r: dict) -> int:
            for key in ("run_duration", "execution_duration"):
                v = r.get(key)
                if v:
                    return int(v)
            return int(
                (r.get("setup_duration") or 0)
                + (r.get("execution_duration") or 0)
                + (r.get("cleanup_duration") or 0)
            )

        latest_run_durations = [
            _run_duration_ms(run)
            for run in (runs.get("runs") or [])[:3]
            if _run_duration_ms(run) > 0
        ]
        avg_duration_ms = (
            sum(latest_run_durations) / len(latest_run_durations)
            if latest_run_durations
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
            avg_duration_ms_last_3_runs=avg_duration_ms,
        )

    def _get_jobs(self) -> DatabricksJobs:
        """Get jobs in the workspace."""
        try:
            jobs = []
            next_page_token: Optional[str] = None
            while True:
                args = Namespace()
                args.uri = "api/2.2/jobs/list"
                args.request_params = {"expand_tasks": "true", "limit": "100"}
                if next_page_token:
                    args.request_params["page_token"] = next_page_token
                args.auto_paginate = False
                resp = self.api_client.do_request(args)
                json_resp = resp.json()
                for job in json_resp.get("jobs", []):
                    if job.get("job_id") is not None:
                        jobs.append(self._get_job_details(job))
                next_page_token = json_resp.get("next_page_token")
                if not next_page_token:
                    break

            return DatabricksJobs(jobs=jobs)

        except Exception as e:
            utils_ui.print_warning(f"Jobs extraction failed: {e}")
            self.extraction_warnings.append("jobs")
            return DatabricksJobs(jobs=[])

    def _annotate_notebooks_with_job_execution(
        self, notebooks: DatabricksNotebooks, jobs: DatabricksJobs
    ) -> DatabricksNotebooks:
        """Cross-reference notebooks with job execution data.

        For each notebook that is referenced by a job task, annotate it with
        the job IDs and the most recent execution timestamp.
        """
        # Build map: normalized_notebook_path -> [(job_id, latest_run_start_time)]
        path_to_jobs: dict = {}
        for job in jobs.jobs:
            for task in job.tasks.tasks:
                if task.notebook_path:
                    norm_path = _normalize_notebook_path(task.notebook_path)
                    if norm_path not in path_to_jobs:
                        path_to_jobs[norm_path] = []
                    # Get the most recent run start_time for this job
                    latest_run_time = None
                    if job.latest_runs and job.latest_runs.runs:
                        latest_run_time = max(
                            (r.start_time for r in job.latest_runs.runs),
                            default=None,
                        )
                    path_to_jobs[norm_path].append((job.job_id, latest_run_time))

        # Annotate notebooks
        for notebook in notebooks.notebooks:
            norm_nb_path = _normalize_notebook_path(notebook.path)
            if norm_nb_path in path_to_jobs:
                entries = path_to_jobs[norm_nb_path]
                notebook.executed_by_jobs = [job_id for job_id, _ in entries]
                run_times = [t for _, t in entries if t is not None]
                if run_times:
                    notebook.last_job_execution = max(run_times)

        return notebooks

    def _get_optional_long(self, data: Optional[str]) -> Optional[int]:
        if data is not None:
            try:
                return int(data)
            except (ValueError, TypeError):
                return None
        return None

    def _extract_partition_columns(self, columns: list) -> Optional[list[str]]:
        """Return partition column names ordered by partition_index.

        Unity Catalog table columns expose ``partition_index`` (int) on every
        column; non-partition columns have it unset/None. Returns None when no
        partition columns exist so the field serialises as null.
        """
        if not columns:
            return None
        partitions = [
            (col.get("partition_index"), col.get("name"))
            for col in columns
            if col.get("partition_index") is not None and col.get("name")
        ]
        if not partitions:
            return None
        partitions.sort(key=lambda item: item[0])
        return [name for _, name in partitions]

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
                    partition_columns=self._extract_partition_columns(
                        table.get("columns", [])
                    ),
                    delta_runtime_properties=table.get(
                        "delta_runtime_properties_kvpairs"
                    ),
                    enable_predictive_optimization=table.get(
                        "enable_predictive_optimization"
                    ),
                    sql_path=table.get("sql_path"),
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
            # Databricks Repos live under /Users/<email>/Repos/...; the API
            # returns an empty payload unless path_prefix is provided.
            args.request_params = {"path_prefix": "/Users"}
            repos: list[DatabricksRepo] = []
            next_page_token: Optional[str] = None
            while True:
                if next_page_token:
                    args.request_params["next_page_token"] = next_page_token
                req = self.api_client.do_request(args)
                json_req = req.json()
                for r in json_req.get("repos", []):
                    repos.append(
                        DatabricksRepo(
                            repo_id=str(r.get("id", "")),
                            path=r.get("path", ""),
                            url=r.get("url"),
                            provider=r.get("provider"),
                            branch=r.get("branch"),
                            head_commit_id=r.get("head_commit_id"),
                            json_response=r,
                        )
                    )
                next_page_token = json_req.get("next_page_token")
                if not next_page_token:
                    break
            return DatabricksRepos(repos=repos)
        except Exception as e:
            print(f"Failed to get repos: {e}")
            return DatabricksRepos(repos=[])

    def _get_experiments(self) -> DatabricksExperiments:
        """Get MLflow experiments in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/mlflow/experiments/list"
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
                        ep.get("state", {}).get("ready")
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
        except FATError as e:
            if e.status_code == "NotFound":
                # Model Serving is not enabled in this workspace; treat as empty.
                return DatabricksServingEndpoints(serving_endpoints=[])
            print(f"Failed to get serving endpoints: {e}")
            return DatabricksServingEndpoints(serving_endpoints=[])
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

    def _get_cluster_policies(self) -> DatabricksClusterPolicies:
        """Get cluster policies in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/policies/clusters/list"
            req = self.api_client.do_request(args)
            json_req = req.json()
            policies = [
                DatabricksClusterPolicy(
                    policy_id=policy.get("policy_id", ""),
                    name=policy.get("name", ""),
                    description=policy.get("description"),
                    is_default=policy.get("is_default"),
                    policy_family_id=policy.get("policy_family_id"),
                    json_response=policy,
                )
                for policy in json_req.get("policies", [])
            ]
            return DatabricksClusterPolicies(cluster_policies=policies)
        except Exception as e:
            print(f"Failed to get cluster policies: {e}")
            return DatabricksClusterPolicies(cluster_policies=[])

    def _get_instance_pools(self) -> DatabricksInstancePools:
        """Get instance pools in the workspace."""
        try:
            args = Namespace()
            args.uri = "/api/2.0/instance-pools/list"
            req = self.api_client.do_request(args)
            json_req = req.json()
            pools = [
                DatabricksInstancePool(
                    instance_pool_id=pool.get("instance_pool_id", ""),
                    instance_pool_name=pool.get("instance_pool_name", ""),
                    node_type_id=pool.get("node_type_id"),
                    min_idle_instances=pool.get("min_idle_instances"),
                    max_capacity=pool.get("max_capacity"),
                    state=pool.get("state"),
                    json_response=pool,
                )
                for pool in json_req.get("instance_pools", [])
            ]
            return DatabricksInstancePools(instance_pools=pools)
        except Exception as e:
            print(f"Failed to get instance pools: {e}")
            return DatabricksInstancePools(instance_pools=[])

    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime

        return datetime.now().isoformat()
