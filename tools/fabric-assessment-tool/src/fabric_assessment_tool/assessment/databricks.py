from dataclasses import asdict, dataclass
from typing import Any, List, Optional

from .common import AssessmentStatus


@dataclass
class DatabricksWorkspaceInfo:
    """Databricks workspace information."""

    id: str
    name: str
    resource_group: str
    url: str
    status: str
    tier: str
    json_response: Any


@dataclass
class DatabricksCluster:
    """Databricks cluster information."""

    cluster_id: str
    cluster_name: str
    state: str
    node_type_id: str
    cluster_cores: int
    cluster_memory_mb: int
    spark_version: str
    json_response: Any
    autoscale: Optional[dict] = None
    policy_id: Optional[str] = None
    driver_node_type_id: Optional[str] = None
    custom_tags: Optional[dict] = None
    default_tags: Optional[dict] = None
    autotermination_minutes: Optional[int] = None
    cluster_source: Optional[str] = None
    state_message: Optional[str] = None
    creator_user_name: Optional[str] = None
    start_time: Optional[str] = None
    terminated_time: Optional[str] = None
    spark_conf: Optional[dict] = None
    enable_elastic_disk: Optional[bool] = None
    init_scripts_count: Optional[int] = None
    enable_local_disk_encryption: Optional[bool] = None
    instance_pool_id: Optional[str] = None
    driver_instance_pool_id: Optional[str] = None
    azure_attributes: Optional[dict] = None
    disk_spec: Optional[dict] = None


@dataclass
class DatabricksClusters:
    """Collection of clusters in a Databricks workspace."""

    clusters: List[DatabricksCluster]


@dataclass
class DatabricksClusterPolicy:
    """Databricks cluster policy summary."""

    policy_id: str
    name: str
    json_response: Any
    description: Optional[str] = None
    is_default: Optional[bool] = None
    policy_family_id: Optional[str] = None


@dataclass
class DatabricksClusterPolicies:
    """Collection of cluster policies in a Databricks workspace."""

    cluster_policies: List[DatabricksClusterPolicy]


@dataclass
class DatabricksInstancePool:
    """Databricks instance pool summary."""

    instance_pool_id: str
    instance_pool_name: str
    json_response: Any
    node_type_id: Optional[str] = None
    min_idle_instances: Optional[int] = None
    max_capacity: Optional[int] = None
    state: Optional[str] = None


@dataclass
class DatabricksInstancePools:
    """Collection of instance pools in a Databricks workspace."""

    instance_pools: List[DatabricksInstancePool]


@dataclass
class DatabricksSqlWarehouse:
    """Databricks SQL warehouse information."""

    name: str
    cluster_size: str
    photon_enabled: bool
    serverless: bool
    min_clusters: int
    max_clusters: int
    uses_spot_instances: bool
    json_response: Any
    warehouse_id: Optional[str] = None
    auto_stop_mins: Optional[int] = None
    state: Optional[str] = None
    creator_name: Optional[str] = None
    warehouse_type: Optional[str] = None
    spot_instance_policy: Optional[str] = None
    channel: Optional[str] = None
    custom_tags: Optional[list] = None


@dataclass
class DatabricksSqlWarehouses:
    """Collection of SQL warehouses in a Databricks workspace."""

    sql_warehouses: List[DatabricksSqlWarehouse]


@dataclass
class DatabricksNotebook:
    """Databricks notebook information."""

    path: str
    default_language: str
    embedded_languages: list[str]
    other_magics: list[str]
    json_response: Any
    uses_dbutils: bool = False
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    modified_at: Optional[str] = None
    size: Optional[int] = None


@dataclass
class DatabricksNotebooks:
    """Collection of notebooks in a Databricks workspace."""

    notebooks: List[DatabricksNotebook]


@dataclass
class DatabricksJobTask:
    """Databricks job task."""

    name: str
    type: str
    libraries: dict
    json_response: Any
    task_key: Optional[str] = None
    description: Optional[str] = None
    timeout_seconds: Optional[int] = None
    max_retries: Optional[int] = None
    cluster_type: Optional[str] = None
    cluster_config: Optional[dict] = None


@dataclass
class DatabricksJobTasks:
    """Collection of tasks in a Databricks job"""

    tasks: List[DatabricksJobTask]


@dataclass
class DatabricksJobSettings:
    """Databricks job settings."""

    name: str
    json_response: Any
    timeout_seconds: Optional[int] = None
    max_concurrent_runs: Optional[int] = None
    format: Optional[str] = None
    schedule: Optional[dict] = None
    email_notifications: Optional[dict] = None


@dataclass
class DatabricksJobRun:
    """Databricks job run."""

    id: str
    state: str
    result_state: str
    start_time: str
    end_time: str | None
    execution_duration: str
    json_response: Any


@dataclass
class DatabricksJobRuns:
    """Collection of runs in a Databricks workspace"""

    runs: List[DatabricksJobRun]


@dataclass
class DatabricksJob:
    """Databricks job information."""

    job_id: int
    tasks: DatabricksJobTasks
    settings: DatabricksJobSettings
    latest_runs: DatabricksJobRuns
    creator_user_name: Optional[str] = None
    created_time: Optional[str] = None


@dataclass
class DatabricksJobs:
    """Collection of jobs in a Databricks workspace."""

    jobs: List[DatabricksJob]


@dataclass
class DatabricksVolume:
    """Databricks volume information."""

    name: str
    catalog: str
    schema: str
    storage_location: str
    type: str
    json_response: Any


@dataclass
class DatabricksFunction:
    """Databricks function information."""

    name: str
    catalog: str
    schema: str
    language: Optional[str]
    full_data_type: Optional[str]
    json_response: Any


@dataclass
class DatabricksTable:
    """Databricks table information."""

    name: str
    catalog: str
    schema: str
    type: str
    format: Optional[str]
    columns: int
    comment: Optional[str]
    statistics_size_bytes: Optional[int]
    statistics_row_count: Optional[int]
    json_response: Any
    full_name: Optional[str] = None
    storage_location: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    table_id: Optional[str] = None
    properties: Optional[dict] = None
    view_definition: Optional[str] = None
    partition_columns: Optional[List[str]] = None
    delta_runtime_properties: Optional[dict] = None
    enable_predictive_optimization: Optional[str] = None
    sql_path: Optional[str] = None


@dataclass
class DatabricksSchema:
    """Databricks database information."""

    name: str
    catalog: str
    comment: Optional[str]
    storage_root: Optional[str]
    tables: List[DatabricksTable]
    volumes: List[DatabricksVolume]
    functions: List[DatabricksFunction]
    json_response: Any


@dataclass
class DatabricksSchemas:
    """Collection of schemas in a Databricks workspace."""

    schemas: List[DatabricksSchema]


@dataclass
class DatabricksCatalog:
    """Databricks catalog information."""

    name: str
    comment: Optional[str]
    owner: Optional[str]
    storage_root: Optional[str]
    schemas: DatabricksSchemas
    json_response: Any


@dataclass
class DatabricksCatalogs:
    """Collection of catalogs in a Databricks workspace."""

    catalogs: List[DatabricksCatalog]


@dataclass
class DatabricksExternalLocation:
    """Databricks external location information."""

    name: str
    url: str
    comment: Optional[str]
    json_response: Any


@dataclass
class DatabricksExternalLocations:
    """Collection of external locations in a Databricks workspace."""

    external_locations: List[DatabricksExternalLocation]


@dataclass
class DatabricksConnection:
    """Databricks connection information."""

    name: str
    type: str
    credential_type: str
    url: str
    json_response: Any


@dataclass
class DatabricksConnections:
    """Collection of connections in a Databricks workspace."""

    connections: List[DatabricksConnection]


@dataclass
class DatabricksSecretScope:
    """Databricks secret scope information."""

    name: str
    backend_type: str
    json_response: Any


@dataclass
class DatabricksSecretScopes:
    """Collection of secret scopes in a Databricks workspace."""

    secret_scopes: List[DatabricksSecretScope]


@dataclass
class DatabricksAssessmentMetadata:
    """Assessment metadata for Databricks workspace."""

    mode: str
    timestamp: str


@dataclass
class DatabricksPipeline:
    """Databricks Delta Live Tables pipeline information."""

    pipeline_id: str
    name: str
    json_response: Any
    state: Optional[str] = None
    creator_user_name: Optional[str] = None
    storage: Optional[str] = None
    continuous: Optional[bool] = None
    development: Optional[bool] = None
    photon: Optional[bool] = None
    channel: Optional[str] = None
    edition: Optional[str] = None
    target: Optional[str] = None
    catalog: Optional[str] = None
    libraries: Optional[list] = None


@dataclass
class DatabricksPipelines:
    """Collection of DLT pipelines in a Databricks workspace."""

    pipelines: List[DatabricksPipeline]


@dataclass
class DatabricksRepo:
    """Databricks Git repository information."""

    repo_id: str
    path: str
    json_response: Any
    url: Optional[str] = None
    provider: Optional[str] = None
    branch: Optional[str] = None
    head_commit_id: Optional[str] = None


@dataclass
class DatabricksRepos:
    """Collection of Git repos in a Databricks workspace."""

    repos: List[DatabricksRepo]


@dataclass
class DatabricksExperiment:
    """Databricks MLflow experiment information."""

    experiment_id: str
    name: str
    json_response: Any
    artifact_location: Optional[str] = None
    lifecycle_stage: Optional[str] = None
    creation_time: Optional[str] = None
    last_update_time: Optional[str] = None


@dataclass
class DatabricksExperiments:
    """Collection of MLflow experiments in a Databricks workspace."""

    experiments: List[DatabricksExperiment]


@dataclass
class DatabricksServingEndpoint:
    """Databricks model serving endpoint information."""

    name: str
    json_response: Any
    creator: Optional[str] = None
    state: Optional[str] = None
    creation_timestamp: Optional[str] = None
    last_updated_timestamp: Optional[str] = None


@dataclass
class DatabricksServingEndpoints:
    """Collection of model serving endpoints in a Databricks workspace."""

    serving_endpoints: List[DatabricksServingEndpoint]


@dataclass
class DatabricksAlert:
    """Databricks SQL alert information."""

    alert_id: str
    json_response: Any
    display_name: Optional[str] = None
    query_id: Optional[str] = None
    owner_user_name: Optional[str] = None
    state: Optional[str] = None


@dataclass
class DatabricksAlerts:
    """Collection of SQL alerts in a Databricks workspace."""

    alerts: List[DatabricksAlert]


@dataclass
class DatabricksGenieSpace:
    """Databricks Genie space information."""

    space_id: str
    json_response: Any
    title: Optional[str] = None
    description: Optional[str] = None
    warehouse_id: Optional[str] = None


@dataclass
class DatabricksGenieSpaces:
    """Collection of Genie spaces in a Databricks workspace."""

    genie_spaces: List[DatabricksGenieSpace]


@dataclass
class DatabricksAssessment:
    """Complete assessment data for a Databricks workspace."""

    status: AssessmentStatus

    workspace_info: DatabricksWorkspaceInfo
    clusters: DatabricksClusters
    sql_warehouses: DatabricksSqlWarehouses
    notebooks: DatabricksNotebooks
    jobs: DatabricksJobs
    catalogs: DatabricksCatalogs
    external_locations: DatabricksExternalLocations
    connections: DatabricksConnections
    secret_scopes: DatabricksSecretScopes
    assessment_metadata: DatabricksAssessmentMetadata

    # New resource types
    pipelines: Optional[DatabricksPipelines] = None
    repos: Optional[DatabricksRepos] = None
    experiments: Optional[DatabricksExperiments] = None
    serving_endpoints: Optional[DatabricksServingEndpoints] = None
    alerts: Optional[DatabricksAlerts] = None
    genie_spaces: Optional[DatabricksGenieSpaces] = None
    cluster_policies: Optional[DatabricksClusterPolicies] = None
    instance_pools: Optional[DatabricksInstancePools] = None

    # Connection information
    workspace_url: Optional[str] = None

    def get_summary(self) -> dict:
        """Create a summary of workspace assessment data."""

        summary = {
            "workspace_info": asdict(self.workspace_info),
            "assessment_metadata": asdict(self.assessment_metadata),
            "assessment_status": asdict(self.status),
            "counts": {},
        }

        # Delete the json response from workspace_info to reduce size
        summary["workspace_info"].pop("json_response", None)

        # Add counts for different components
        summary["counts"]["clusters"] = len(self.clusters.clusters)
        summary["counts"]["sql_warehouses"] = len(self.sql_warehouses.sql_warehouses)

        summary["counts"]["jobs"] = len(self.jobs.jobs)

        summary["counts"]["notebooks"] = len(self.notebooks.notebooks)

        summary["counts"]["external_locations"] = len(
            self.external_locations.external_locations
        )

        summary["counts"]["connections"] = len(self.connections.connections)

        summary["counts"]["secret_scopes"] = len(self.secret_scopes.secret_scopes)

        summary["counts"]["catalogs"] = len(self.catalogs.catalogs)

        total_databases = sum(
            len(catalog.schemas.schemas) for catalog in self.catalogs.catalogs
        )
        summary["counts"]["total_databases"] = total_databases

        total_tables = sum(
            len(schema.tables)
            for catalog in self.catalogs.catalogs
            for schema in catalog.schemas.schemas
        )
        summary["counts"]["total_tables"] = total_tables

        total_volumes = sum(
            len(schema.volumes)
            for catalog in self.catalogs.catalogs
            for schema in catalog.schemas.schemas
        )
        summary["counts"]["total_volumes"] = total_volumes

        total_functions = sum(
            len(schema.functions)
            for catalog in self.catalogs.catalogs
            for schema in catalog.schemas.schemas
        )
        summary["counts"]["total_functions"] = total_functions

        # Counts for new resource types
        summary["counts"]["pipelines"] = (
            len(self.pipelines.pipelines) if self.pipelines else 0
        )
        summary["counts"]["repos"] = len(self.repos.repos) if self.repos else 0
        summary["counts"]["experiments"] = (
            len(self.experiments.experiments) if self.experiments else 0
        )
        summary["counts"]["serving_endpoints"] = (
            len(self.serving_endpoints.serving_endpoints)
            if self.serving_endpoints
            else 0
        )
        summary["counts"]["alerts"] = len(self.alerts.alerts) if self.alerts else 0
        summary["counts"]["genie_spaces"] = (
            len(self.genie_spaces.genie_spaces) if self.genie_spaces else 0
        )
        summary["counts"]["cluster_policies"] = (
            len(self.cluster_policies.cluster_policies)
            if self.cluster_policies
            else 0
        )
        summary["counts"]["instance_pools"] = (
            len(self.instance_pools.instance_pools) if self.instance_pools else 0
        )

        return summary
