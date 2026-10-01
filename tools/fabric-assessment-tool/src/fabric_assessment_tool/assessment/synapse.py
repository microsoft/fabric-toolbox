from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
from typing import Any, Dict, List, Literal, Optional

from .common import AssessmentStatus


@dataclass
class SynapseQueryActivity:
    """A request observed in a Synapse dedicated SQL pool."""

    request_id: str
    session_id: str
    status: str
    resource_class: str
    importance: str
    submit_time: Optional[str]
    start_time: Optional[str]
    end_time: Optional[str]
    duration_ms: Optional[float]
    queue_duration_ms: Optional[float]
    label: Optional[str]
    login_name: Optional[str]
    command: Optional[str]
    json_response: Any


@dataclass
class SynapseSessionActivity:
    """A session observed in a Synapse dedicated SQL pool."""

    session_id: str
    status: str
    login_name: Optional[str]
    login_time: Optional[str]
    query_count: Optional[int]
    client_id: Optional[str]
    app_name: Optional[str]
    json_response: Any


@dataclass
class SynapseDurationStatistics:
    """Duration distribution for completed dedicated-pool requests."""

    average_ms: Optional[float]
    p50_ms: Optional[float]
    p90_ms: Optional[float]
    p99_ms: Optional[float]
    max_ms: Optional[float]


@dataclass
class SynapseTemporalBucket:
    """Request count for a day-of-week and hour-of-day bucket."""

    day_of_week: int
    hour: int
    request_count: int


@dataclass
class SynapseWorkloadProfile:
    """Collected activity and derived workload metrics for a dedicated SQL pool."""

    collection_status: str
    description: str
    configured_window_days: int
    configured_top_n: int
    sql_text_redacted: bool
    collected_at: str
    observed_start: Optional[str]
    observed_end: Optional[str]
    request_count: int
    session_count: int
    peak_concurrency: int
    status_distribution: Dict[str, int]
    resource_class_distribution: Dict[str, int]
    duration_statistics: SynapseDurationStatistics
    temporal_buckets: List[SynapseTemporalBucket]
    requests: List[SynapseQueryActivity]
    sessions: List[SynapseSessionActivity]


@dataclass
class SynapseWorkspaceInfo:
    """Synapse workspace information."""

    id: str
    name: str
    resource_group: str
    location: str
    status: str
    endpoints: dict[str, str]
    json_response: Any


ColumnCompatibility = Literal["compatible", "review", "unsupported"]


@dataclass
class SynapseColumn:
    """Column metadata collected from INFORMATION_SCHEMA.COLUMNS."""

    name: str
    ordinal_position: int
    data_type: str
    is_nullable: bool
    character_maximum_length: Optional[int]
    numeric_precision: Optional[int]
    numeric_scale: Optional[int]
    datetime_precision: Optional[int]
    column_default: Optional[str]
    character_set_name: Optional[str]
    collation_name: Optional[str]
    compatibility: ColumnCompatibility
    compatibility_note: str
    json_response: Any


@dataclass
class SynapseDataTypeSummary:
    """Column count and Fabric compatibility for a normalized SQL data type."""

    data_type: str
    column_count: int
    compatibility: ColumnCompatibility
    compatibility_note: str


@dataclass
class SynapseCompatibilityTotals:
    """Column totals grouped by Fabric compatibility classification."""

    compatible: int = 0
    review: int = 0
    unsupported: int = 0


@dataclass
class SynapseWideObject:
    """Table or view meeting the configured wide-object threshold."""

    database: str
    schema: str
    object_type: Literal["table", "view"]
    name: str
    column_count: int


@dataclass
class SynapseColumnDatabaseStatus:
    """Column collection outcome for one dedicated or serverless database."""

    database: str
    database_type: Literal["dedicated", "serverless"]
    status: Literal["collected", "capped", "partial", "skipped", "unavailable"]
    objects_considered: int
    objects_collected: int
    columns_collected: int
    reason: Optional[str] = None


@dataclass
class SynapseColumnSummary:
    """Workspace-level column collection and Fabric compatibility summary."""

    collection_status: Literal[
        "completed", "capped", "partial", "skipped", "unavailable"
    ]
    generated_at: str
    configured_max_column_objects: Optional[int]
    wide_object_threshold: int
    total_objects_considered: int
    total_objects_collected: int
    total_columns: int
    nullable_columns: int
    data_types: List[SynapseDataTypeSummary] = field(default_factory=list)
    compatibility_totals: SynapseCompatibilityTotals = field(
        default_factory=SynapseCompatibilityTotals
    )
    wide_objects: List[SynapseWideObject] = field(default_factory=list)
    database_statuses: List[SynapseColumnDatabaseStatus] = field(default_factory=list)
    capped_databases: List[str] = field(default_factory=list)
    partial_databases: List[str] = field(default_factory=list)
    unavailable_databases: List[str] = field(default_factory=list)
    skipped_reason: Optional[str] = None


@dataclass
class TableStatistics:
    """Table statistics from vTableSizes view."""

    database_name: str
    schema_name: str
    table_name: str
    distribution_policy_name: Optional[str]
    distribution_column: Optional[str]
    index_type_desc: Optional[str]
    nbr_partitions: int
    table_row_count: int
    table_reserved_space_gb: float
    table_data_space_gb: float
    table_index_space_gb: float
    table_unused_space_gb: float


@dataclass
class CodeObjectCount:
    """Count statistics for Code Object Type"""

    type_description: str
    count: int


@dataclass
class CodeObjectLines:
    """Count of code lines per code object"""

    schema_name: str
    object_name: str
    code_line_number: int
    type_description: str


@dataclass
class SynapseTable:
    """Synapse Table information."""

    name: str
    database: str
    schema: str
    statistics: Optional[TableStatistics]
    json_response: Any
    columns: List[SynapseColumn] = field(default_factory=list)


@dataclass
class SynapseTables:
    """Collection of Tables in a Synapse workspace."""

    tables: List[SynapseTable]


@dataclass
class SynapseView:
    """Synapse View information."""

    name: str
    database: str
    schema: str
    json_response: Any
    columns: List[SynapseColumn] = field(default_factory=list)


@dataclass
class SynapseViews:
    """Collection of Views in a Synapse workspace."""

    views: List[SynapseView]


@dataclass
class SynapseSchema:
    """Synapse Schema information."""

    name: str
    database: str
    tables: SynapseTables
    views: SynapseViews
    json_response: Any


@dataclass
class SynapseSchemas:
    """Collection of Schemas in a Synapse workspace."""

    schemas: List[SynapseSchema]


@dataclass
class SynapseDedicatedDatabase:
    """Synapse Database information."""

    name: str
    schemas: SynapseSchemas
    json_response: Any


@dataclass
class SynapseDedicatedPool:
    """Synapse dedicated SQL pool information."""

    name: str
    status: str
    sku: str
    database: SynapseDedicatedDatabase
    tables_count: int
    size_gb: float
    code_lines: list[CodeObjectLines]
    code_objects: list[CodeObjectCount]
    json_response: Any
    workload: Optional[SynapseWorkloadProfile] = None


@dataclass
class SynapseDedicatedPools:
    """Collection of Dedicated Databases in a Synapse workspace."""

    pools: List[SynapseDedicatedPool]


@dataclass
class SynapseServerlessDatabase:
    """Synapse Database information."""

    name: str
    source_provider: str
    origin_type: str
    schemas: SynapseSchemas
    json_response: Any


@dataclass
class SynapseServerlessDatabases:
    """Collection of Databases in a Synapse workspace."""

    databases: List[SynapseServerlessDatabase]


@dataclass
class SynapseServerlessActivitySourceDiagnostic:
    """Capability probe result for a serverless activity source."""

    source_name: str
    status: str
    available_columns: List[str] = field(default_factory=list)
    message: Optional[str] = None


@dataclass
class SynapseServerlessQueryActivity:
    """Detailed serverless SQL query activity."""

    source_name: str
    request_id: Optional[str] = None
    session_id: Optional[int] = None
    connection_id: Optional[str] = None
    query_hash: Optional[str] = None
    database_name: Optional[str] = None
    principal_name: Optional[str] = None
    status: Optional[str] = None
    submit_time: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    elapsed_time_ms: Optional[int] = None
    processed_bytes: Optional[int] = None
    remote_processed_bytes: Optional[int] = None
    memory_processed_bytes: Optional[int] = None
    disk_processed_bytes: Optional[int] = None
    row_count: Optional[int] = None
    statement_type: Optional[str] = None
    program_name: Optional[str] = None
    error_code: Optional[int] = None
    query_text: Optional[str] = None


@dataclass
class SynapseServerlessDailyDatabaseUsage:
    """Daily aggregated serverless SQL usage by database."""

    date: str
    database_name: str
    query_count: int
    processed_bytes: int
    total_elapsed_time_ms: int
    average_elapsed_time_ms: float


@dataclass
class SynapseServerlessDatabaseSummary:
    """Serverless SQL summary for one database."""

    database_name: str
    query_count: int
    processed_bytes: int
    average_elapsed_time_ms: float
    max_elapsed_time_ms: int
    success_count: int
    failure_count: int
    cancelled_count: int = 0


@dataclass
class SynapseServerlessTopQueryMetric:
    """Redacted query metric for visualization-safe summaries."""

    source_name: str
    request_id: Optional[str] = None
    session_id: Optional[int] = None
    connection_id: Optional[str] = None
    query_hash: Optional[str] = None
    database_name: Optional[str] = None
    principal_name: Optional[str] = None
    status: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    elapsed_time_ms: Optional[int] = None
    processed_bytes: Optional[int] = None


@dataclass
class SynapseServerlessPerformanceSummary:
    """Overall serverless SQL activity summary."""

    total_queries: int = 0
    queries_last_24h: Optional[int] = None
    total_processed_bytes: int = 0
    total_elapsed_time_ms: int = 0
    average_elapsed_time_ms: float = 0.0
    max_elapsed_time_ms: int = 0
    success_count: int = 0
    failure_count: int = 0
    cancelled_count: int = 0
    collection_window_start: Optional[str] = None
    collection_window_end: Optional[str] = None
    top_slowest_queries: List[SynapseServerlessTopQueryMetric] = field(
        default_factory=list
    )
    top_largest_queries: List[SynapseServerlessTopQueryMetric] = field(
        default_factory=list
    )


@dataclass
class SynapseServerlessActivityCollectionMetadata:
    """Collection metadata for serverless SQL activity."""

    status: str = "unavailable"
    attempted: bool = False
    history_days: int = 0
    top_n: int = 0
    requested_sources: List[str] = field(default_factory=list)
    available_sources: List[str] = field(default_factory=list)
    detailed_sources_used: List[str] = field(default_factory=list)
    supplemental_sources_used: List[str] = field(default_factory=list)
    collected_at: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    source_diagnostics: List[SynapseServerlessActivitySourceDiagnostic] = field(
        default_factory=list
    )


@dataclass
class SynapseServerlessActivity:
    """Serverless SQL activity payload."""

    metadata: SynapseServerlessActivityCollectionMetadata = field(
        default_factory=SynapseServerlessActivityCollectionMetadata
    )
    queries: List[SynapseServerlessQueryActivity] = field(default_factory=list)
    daily_database_usage: List[SynapseServerlessDailyDatabaseUsage] = field(
        default_factory=list
    )
    database_summaries: List[SynapseServerlessDatabaseSummary] = field(
        default_factory=list
    )
    performance_summary: SynapseServerlessPerformanceSummary = field(
        default_factory=SynapseServerlessPerformanceSummary
    )


@dataclass
class SynapseServerlessPool:
    """Synapse serverless SQL pool information."""

    name: str
    status: str
    queries_last_24h: Optional[int]
    databases: SynapseServerlessDatabases
    json_response: Any
    activity: SynapseServerlessActivity = field(
        default_factory=SynapseServerlessActivity
    )


@dataclass
class SynapseSqlPools:
    """Collection of SQL pools in a Synapse workspace."""

    dedicated_pools: List[SynapseDedicatedPool]
    serverless_pool: SynapseServerlessPool


@dataclass
class SynapseSparkPool:
    """Synapse Spark pool information."""

    name: str
    location: str
    node_size: str
    node_count: str
    spark_version: str
    json_response: Any


@dataclass
class SynapseSparkPools:
    """Collection of Spark pools in a Synapse workspace."""

    spark_pools: List[SynapseSparkPool]


@dataclass
class SynapsePipeline:
    """Synapse pipeline information."""

    name: str
    description: str
    last_run: str
    activities_count: int
    json_response: Any


@dataclass
class SynapsePipelines:
    """Collection of pipelines in a Synapse workspace."""

    pipelines: List[SynapsePipeline]


@dataclass
class SynapseDataflow:
    """Synapse dataflow information."""

    name: str
    description: str
    json_response: Any


@dataclass
class SynapseDataflows:
    """Collection of dataflows in a Synapse workspace."""

    dataflows: List[SynapseDataflow]


@dataclass
class SynapseNotebook:
    """Synapse notebook information."""

    name: str
    language: str
    etag: str
    json_response: Any
    uses_mssparkutils: bool = False
    spark_configuration: Optional[str] = None


@dataclass
class SynapseNotebooks:
    """Collection of notebooks in a Synapse workspace."""

    notebooks: List[SynapseNotebook]


@dataclass
class SynapseSparkJobDefinition:
    """Synapse Spark Job Definition information."""

    name: str
    etag: str
    json_response: Any
    spark_configuration: Optional[str] = None


@dataclass
class SynapseSparkJobDefinitions:
    """Collection of Spark Job Definitions in a Synapse workspace."""

    spark_job_definitions: List[SynapseSparkJobDefinition]


@dataclass
class SynapseAssessmentMetadata:
    """Assessment metadata for Synapse workspace."""

    mode: str
    timestamp: str
    query_history_days: int = 7
    query_history_top: int = 1000
    sql_text_redacted: bool = True
    query_history_skipped: bool = False
    skip_columns: bool = False
    max_column_objects: Optional[int] = None


@dataclass
class SynapseSqlScript:
    """Synapse SQL script information."""

    name: str
    description: str
    json_response: Any


@dataclass
class SynapseSqlScripts:
    """Collection of SQL scripts in a Synapse workspace."""

    sql_scripts: List[SynapseSqlScript]


@dataclass
class SynapseIntegrationRuntime:
    """Synapse Integration Runtime information."""

    name: str
    description: str
    type: str
    json_response: Any


@dataclass
class SynapseIntegrationRuntimes:
    """Collection of Integration Runtimes in a Synapse workspace."""

    integration_runtimes: List[SynapseIntegrationRuntime]


@dataclass
class SynapseLinkedService:
    """Synapse Linked Service information."""

    name: str
    type: str
    json_response: Any


@dataclass
class SynapseLinkedServices:
    """Collection of Linked Services in a Synapse workspace."""

    linked_services: List[SynapseLinkedService]


@dataclass
class SynapseDataset:
    """Synapse Dataset information."""

    name: str
    type: str
    json_response: Any


@dataclass
class SynapseDatasets:
    """Collection of Datasets in a Synapse workspace."""

    datasets: List[SynapseDataset]


@dataclass
class SynapseManagedPrivateEndpoint:
    """Synapse Managed Private Endpoint information."""

    name: str
    type: str
    status: str
    json_response: Any


@dataclass
class SynapseManagedPrivateEndpoints:
    """Collection of Managed Private Endpoints in a Synapse workspace."""

    managed_private_endpoints: List[SynapseManagedPrivateEndpoint]


@dataclass
class SynapseLibrary:
    """Synapse Library information."""

    name: str
    type: str
    json_response: Any


@dataclass
class SynapseSparkConfiguration:
    """Synapse Spark Configuration information."""

    name: str
    description: str
    configs: Dict[str, str]
    created: str
    created_by: str
    source_pool: str
    notebook_refs: int
    sjd_refs: int
    json_response: Any


@dataclass
class SynapseSparkConfigurations:
    """Collection of Spark Configurations in a Synapse workspace."""

    spark_configurations: List[SynapseSparkConfiguration]


@dataclass
class SynapseLibraries:
    """Collection of Libraries in a Synapse workspace."""

    libraries: List[SynapseLibrary]


@dataclass
class SynapseAssessment:
    """Complete assessment data for a Synapse workspace."""

    status: AssessmentStatus

    workspace_info: SynapseWorkspaceInfo
    sql_pools: SynapseSqlPools
    spark_pools: SynapseSparkPools
    pipelines: SynapsePipelines
    dataflows: SynapseDataflows
    notebooks: SynapseNotebooks
    spark_job_definitions: SynapseSparkJobDefinitions
    sql_scripts: SynapseSqlScripts
    integration_runtimes: SynapseIntegrationRuntimes
    linked_services: SynapseLinkedServices
    datasets: SynapseDatasets
    managed_private_endpoints: SynapseManagedPrivateEndpoints
    libraries: SynapseLibraries
    spark_configurations: SynapseSparkConfigurations

    assessment_metadata: SynapseAssessmentMetadata

    # Connection information
    subscription_id: Optional[str] = None
    resource_group: Optional[str] = None
    column_summary: Optional[SynapseColumnSummary] = None

    def get_summary(self) -> dict:
        """Create a summary of workspace assessment data."""

        summary = {
            "workspace_info": asdict(self.workspace_info),
            "assessment_metadata": asdict(self.assessment_metadata),
            "assessment_status": asdict(self.status),
            "workspace": {"manual": {}},
            "data_engineering": {"manual": {}, "hybrid": {}},
            "data_integration": {
                "counts": {},
            },
            "data_warehouse": {"counts": {}},
        }

        # Delete the json response from workspace_info to reduce size
        summary["workspace_info"].pop("json_response", None)

        # Generic
        summary["workspace"]["manual"]["managed_private_endpoints"] = len(
            self.managed_private_endpoints.managed_private_endpoints
        )

        # Spark items
        summary["data_engineering"]["manual"]["spark_pools"] = len(
            self.spark_pools.spark_pools
        )
        summary["data_engineering"]["hybrid"]["spark_job_definitions"] = len(
            self.spark_job_definitions.spark_job_definitions
        )
        summary["data_engineering"]["manual"]["libraries"] = len(
            self.libraries.libraries
        )
        library_types = set([lib.type for lib in self.libraries.libraries])
        summary["data_engineering"]["manual"]["library_types"] = len(library_types)
        summary["data_engineering"]["hybrid"]["notebooks"] = len(
            self.notebooks.notebooks
        )

        # Data Integration items
        summary["data_integration"]["counts"]["pipelines"] = len(
            self.pipelines.pipelines
        )
        summary["data_integration"]["counts"]["dataflows"] = len(
            self.dataflows.dataflows
        )
        summary["data_integration"]["counts"]["integration_runtimes"] = len(
            self.integration_runtimes.integration_runtimes
        )
        summary["data_integration"]["counts"]["linked_services"] = len(
            self.linked_services.linked_services
        )
        linked_service_types = set(
            [ls.type for ls in self.linked_services.linked_services]
        )
        summary["data_integration"]["counts"]["linked_service_types"] = len(
            linked_service_types
        )
        summary["data_integration"]["counts"]["datasets"] = len(self.datasets.datasets)
        dataset_types = set([ds.type for ds in self.datasets.datasets])
        summary["data_integration"]["counts"]["dataset_types"] = len(dataset_types)

        # Data Warehouse
        summary["data_warehouse"]["counts"]["sql_scripts"] = len(
            self.sql_scripts.sql_scripts
        )

        ## Serverless
        summary["data_warehouse"]["counts"]["serverless"] = {}
        summary["data_warehouse"]["counts"]["serverless"]["sql_pools"] = 1
        summary["data_warehouse"]["counts"]["serverless"]["databases"] = len(
            self.sql_pools.serverless_pool.databases.databases
        )
        total_serverless_tables = sum(
            len(schema.tables.tables)
            for db in self.sql_pools.serverless_pool.databases.databases
            for schema in db.schemas.schemas
        )
        summary["data_warehouse"]["counts"]["serverless"][
            "tables"
        ] = total_serverless_tables
        total_serverless_views = sum(
            len(schema.views.views)
            for db in self.sql_pools.serverless_pool.databases.databases
            for schema in db.schemas.schemas
        )
        summary["data_warehouse"]["counts"]["serverless"][
            "views"
        ] = total_serverless_views
        summary["data_warehouse"]["counts"]["serverless"][
            "queries_last_24h"
        ] = self.sql_pools.serverless_pool.queries_last_24h

        serverless_activity = self.sql_pools.serverless_pool.activity
        serverless_performance = serverless_activity.performance_summary
        serverless_metadata = serverless_activity.metadata
        summary["data_warehouse"]["counts"]["serverless"]["activity"] = {
            "status": serverless_metadata.status,
            "attempted": serverless_metadata.attempted,
            "queries": serverless_performance.total_queries,
            "processed_bytes": serverless_performance.total_processed_bytes,
            "average_duration_ms": round(
                serverless_performance.average_elapsed_time_ms, 2
            ),
            "max_duration_ms": serverless_performance.max_elapsed_time_ms,
            "success_count": serverless_performance.success_count,
            "failure_count": serverless_performance.failure_count,
            "cancelled_count": serverless_performance.cancelled_count,
            "warnings": len(serverless_metadata.warnings),
        }

        ## Data Warehouse
        summary["data_warehouse"]["counts"]["dedicated"] = {}
        summary["data_warehouse"]["counts"]["dedicated"]["sql_pools"] = len(
            self.sql_pools.dedicated_pools
        )
        summary["data_warehouse"]["counts"]["dedicated"]["databases"] = sum(
            [1 for pool in self.sql_pools.dedicated_pools]
        )
        total_dedicated_tables = sum(
            len(schema.tables.tables)
            for pool in self.sql_pools.dedicated_pools
            for schema in pool.database.schemas.schemas
        )
        summary["data_warehouse"]["counts"]["dedicated"][
            "tables"
        ] = total_dedicated_tables
        total_dedicated_views = sum(
            len(schema.views.views)
            for pool in self.sql_pools.dedicated_pools
            for schema in pool.database.schemas.schemas
        )
        summary["data_warehouse"]["counts"]["dedicated"][
            "views"
        ] = total_dedicated_views

        if self.column_summary is not None:
            summary["data_warehouse"]["columns"] = {
                "collection_status": self.column_summary.collection_status,
                "objects_considered": self.column_summary.total_objects_considered,
                "objects_collected": self.column_summary.total_objects_collected,
                "total_columns": self.column_summary.total_columns,
                "nullable_columns": self.column_summary.nullable_columns,
                "wide_objects": len(self.column_summary.wide_objects),
                "compatibility_totals": asdict(
                    self.column_summary.compatibility_totals
                ),
            }

        dedicated_table_rows = sum(
            sum(
                schema_table.statistics.table_row_count
                for schema in pool.database.schemas.schemas
                for schema_table in schema.tables.tables
                if schema_table.statistics is not None
            )
            for pool in self.sql_pools.dedicated_pools
        )
        summary["data_warehouse"]["counts"]["dedicated"][
            "table_rows"
        ] = dedicated_table_rows

        dedicated_table_size_gb = sum(
            sum(
                schema_table.statistics.table_reserved_space_gb
                for schema in pool.database.schemas.schemas
                for schema_table in schema.tables.tables
                if schema_table.statistics is not None
            )
            for pool in self.sql_pools.dedicated_pools
        )
        summary["data_warehouse"]["counts"]["dedicated"]["table_size_gb"] = round(
            dedicated_table_size_gb, 2
        )

        summary["data_warehouse"]["counts"]["dedicated"]["views"] = sum(
            sum(
                [
                    obj.count
                    for obj in pool.code_objects
                    if obj.type_description == "VIEW"
                ]
            )
            for pool in self.sql_pools.dedicated_pools
        )

        summary["data_warehouse"]["counts"]["dedicated"]["view_code_lines"] = sum(
            sum(
                [
                    obj.code_line_number
                    for obj in pool.code_lines
                    if obj.type_description == "Views"
                ]
            )
            for pool in self.sql_pools.dedicated_pools
        )

        summary["data_warehouse"]["counts"]["dedicated"]["stored_procedures"] = sum(
            sum(
                [
                    obj.count
                    for obj in pool.code_objects
                    if obj.type_description == "STORED_PROCEDURE"
                ]
            )
            for pool in self.sql_pools.dedicated_pools
        )

        summary["data_warehouse"]["counts"]["dedicated"][
            "stored_procedure_code_lines"
        ] = sum(
            sum(
                [
                    obj.code_line_number
                    for obj in pool.code_lines
                    if obj.type_description == "Procedure"
                ]
            )
            for pool in self.sql_pools.dedicated_pools
        )

        workload_profiles = [
            pool.workload
            for pool in self.sql_pools.dedicated_pools
            if pool.workload is not None
        ]
        collected_profiles = [
            profile
            for profile in workload_profiles
            if profile.collection_status == "collected"
        ]
        summary["data_warehouse"]["workload"] = {
            "pool_count": len(workload_profiles),
            "collected_pool_count": len(collected_profiles),
            "request_count": sum(
                profile.request_count for profile in collected_profiles
            ),
            "session_count": sum(
                profile.session_count for profile in collected_profiles
            ),
            "max_peak_concurrency": max(
                (profile.peak_concurrency for profile in collected_profiles),
                default=0,
            ),
        }

        return summary
