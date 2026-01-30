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
    autoscale: Optional[dict] = None  # <-- Put defaulted fields AFTER non-defaults


@dataclass
class DatabricksClusters:
    """Collection of clusters in a Databricks workspace."""

    clusters: List[DatabricksCluster]


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


@dataclass
class DatabricksJobTasks:
    """Collection of tasks in a Databricks job"""

    tasks: List[DatabricksJobTask]


@dataclass
class DatabricksJobSettings:
    """Databricks job settings."""

    name: str
    json_response: Any


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

        return summary
