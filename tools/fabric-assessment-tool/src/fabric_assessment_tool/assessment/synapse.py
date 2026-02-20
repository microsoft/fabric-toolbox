from dataclasses import asdict, dataclass
from typing import Any, List, Optional

from .common import AssessmentStatus


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
    size_gb: int
    code_lines: list[CodeObjectLines]
    code_objects: list[CodeObjectCount]
    json_response: Any


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
class SynapseServerlessPool:
    """Synapse serverless SQL pool information."""

    name: str
    status: str
    queries_last_24h: Optional[int]
    databases: SynapseServerlessDatabases
    json_response: Any


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


@dataclass
class SynapseSparkJobDefinitions:
    """Collection of Spark Job Definitions in a Synapse workspace."""

    spark_job_definitions: List[SynapseSparkJobDefinition]


@dataclass
class SynapseAssessmentMetadata:
    """Assessment metadata for Synapse workspace."""

    mode: str
    timestamp: str


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

    assessment_metadata: SynapseAssessmentMetadata

    # Connection information
    subscription_id: Optional[str] = None
    resource_group: Optional[str] = None

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

        return summary
