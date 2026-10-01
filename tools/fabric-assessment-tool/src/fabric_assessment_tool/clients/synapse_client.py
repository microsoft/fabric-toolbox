import builtins
import json
import time
from collections import Counter
from argparse import Namespace
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional, cast

from fabric_assessment_tool.errors.api import FATError

from ..assessment.common import AssessmentStatus
from ..assessment.synapse import (
    CodeObjectCount, CodeObjectLines, SqlComplexityAssessment, SynapseAssessment,
    SynapseAssessmentMetadata, SynapseColumnDatabaseStatus, SynapseColumnSummary,
    SynapseCompatibilityTotals, SynapseDataflow, SynapseDataflows, SynapseDataset,
    SynapseDatasets, SynapseDedicatedDatabase, SynapseDedicatedPool, SynapseDedicatedPools,
    SynapseIntegrationRuntime, SynapseIntegrationRuntimes, SynapseLibraries,
    SynapseLibrary, SynapseLinkedService, SynapseLinkedServices,
    SynapseManagedPrivateEndpoint, SynapseManagedPrivateEndpoints, SynapseNotebook,
    SynapseNotebooks, SynapsePipeline, SynapsePipelines, SynapseSchema, SynapseSchemas,
    SynapseServerlessActivity, SynapseServerlessActivityCollectionMetadata,
    SynapseServerlessActivitySourceDiagnostic, SynapseServerlessDatabase,
    SynapseServerlessDatabases, SynapseServerlessPerformanceSummary, SynapseServerlessPool,
    SynapseSparkConfiguration, SynapseSparkConfigurations, SynapseSparkJobDefinition,
    SynapseSparkJobDefinitions, SynapseSparkPool, SynapseSparkPools, SynapseSqlPools,
    SynapseSqlScript, SynapseSqlScripts, SynapseTable, SynapseTables, SynapseView,
    SynapseViews, SynapseWideObject, SynapseWorkspaceInfo, TableStatistics,
    CodeObjectCount,
    CodeObjectLines,
    SynapseAssessment,
    SynapseAssessmentMetadata,
    SynapseDataflow,
    SynapseDataflows,
    SynapseDataset,
    SynapseDatasets,
    SynapseDefinitionSummary,
    SynapseDedicatedDatabase,
    SynapseDedicatedPool,
    SynapseDedicatedPools,
    SynapseIntegrationRuntime,
    SynapseIntegrationRuntimes,
    SynapseLibraries,
    SynapseLibrary,
    SynapseLinkedService,
    SynapseLinkedServices,
    SynapseManagedPrivateEndpoint,
    SynapseManagedPrivateEndpoints,
    SynapseNotebook,
    SynapseNotebooks,
    SynapsePipeline,
    SynapsePipelines,
    SynapseSchema,
    SynapseSchemas,
    SynapseServerlessDatabase,
    SynapseServerlessDatabases,
    SynapseServerlessPool,
    SynapseSparkConfiguration,
    SynapseSparkConfigurations,
    SynapseSparkJobDefinition,
    SynapseSparkJobDefinitions,
    SynapseSparkPool,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlDefinitions,
    SynapseSqlScript,
    SynapseSqlScripts,
    SynapseTable,
    SynapseTables,
    SynapseView,
    SynapseViews,
    SynapseWorkspaceInfo,
    TableStatistics,
)
from ..services.sql_complexity_scorer import SqlComplexityScorer
from ..utils import ui as utils_ui
from ..utils.workload_profile import build_workload_profile, unavailable_workload_profile
from .api_client import ApiClient
from .odbc_client import (
    EndpointKind, OdbcClient, ServerlessActivityExpectedError, SqlAuthMode,
    SynapseColumnMetadataObject, SynapseColumnMetadataResult,
    get_fabric_type_compatibility,
)
from .token_provider import FabricNotebookTokenProvider, TokenProvider, create_token_provider
from .odbc_client import DefinitionRedactionMode, OdbcClient, SqlAuthMode
from .token_provider import (
    FabricNotebookTokenProvider,
    TokenProvider,
    create_token_provider,
)


class SynapseClient:
    """Client for Azure Synapse Analytics APIs."""

    def __init__(
        self,
        subscription_id: Optional[str] = None,
        token_provider: Optional[TokenProvider] = None,
        auth_method: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
        create_dmv: bool = False,
        sql_auth_mode: SqlAuthMode = "sql",
        sql_client_id: Optional[str] = None,
        sql_client_secret: Optional[str] = None,
        sql_tenant_id: Optional[str] = None,
        query_history_days: int = 7,
        query_history_top: int = 1000,
        include_sql_text: bool = False,
        skip_query_history: bool = False,
        serverless_history_days: int = 30,
        serverless_top_n: int = 1000,
        skip_serverless_activity: bool = False,
        serverless_sql_auth_mode: Optional[str] = None,
        serverless_sql_username: Optional[str] = None,
        serverless_sql_password: Optional[str] = None,
        serverless_sql_client_id: Optional[str] = None,
        serverless_sql_client_secret: Optional[str] = None,
        serverless_sql_tenant_id: Optional[str] = None,
        skip_columns: bool = False,
        max_column_objects: Optional[int] = None,
        sql_complexity: bool = False,
        sql_definition_redaction: str = "full",
        sql_complexity_schemas: Optional[list[str]] = None,
        extract_definitions: bool = False,
        definition_redaction: DefinitionRedactionMode = "partial",
        definition_schema_filter: Optional[list[str]] = None,
        max_definition_size: int = 1_000_000,
        **kwargs,
    ):
        """
        Initialize Synapse client.

        Args:
            subscription_id: Azure subscription ID (optional, will use Azure CLI default if not provided)
            token_provider: Optional TokenProvider instance for authentication
            auth_method: Authentication method ("azure-cli", "fabric", or None for auto-detect)
            sql_admin_password: SQL admin password for dedicated SQL pools (bypasses interactive prompt)
            create_dmv: Auto-create vTableSizes DMV without confirmation prompt
            sql_auth_mode: SQL pool authentication mode:
                - "sql": Traditional SQL authentication (default)
                - "entra-interactive": Entra ID interactive authentication (browser popup)
                - "entra-spn": Entra ID Service Principal authentication
                - "entra-default": Entra ID default (Azure CLI, managed identity, etc.)
            sql_client_id: Service principal client ID (required for 'entra-spn' mode)
            sql_client_secret: Service principal client secret (required for 'entra-spn' mode)
            sql_tenant_id: Azure tenant ID (optional for 'entra-spn' mode)
            serverless_history_days: Number of days of serverless SQL history to collect
            serverless_top_n: Maximum number of detailed serverless SQL records to keep
            skip_serverless_activity: Skip serverless SQL activity collection
            serverless_sql_auth_mode: Optional auth-mode override for serverless SQL
            serverless_sql_username: Optional SQL username override for serverless SQL
            serverless_sql_password: Optional SQL password override for serverless SQL
            serverless_sql_client_id: Optional SPN client ID override for serverless SQL
            serverless_sql_client_secret: Optional SPN secret override for serverless SQL
            serverless_sql_tenant_id: Optional SPN tenant override for serverless SQL
            skip_columns: Skip column metadata collection
            max_column_objects: Optional positive per-database table/view collection cap
            sql_complexity: Enable SQL code complexity scoring
            sql_definition_redaction: Definition export mode ('full' or 'none')
            sql_complexity_schemas: Optional schema allowlist for scoring
            extract_definitions: Extract SQL module definitions from dedicated pools
            definition_redaction: Definition protection mode
            definition_schema_filter: Exact schema names to include
            max_definition_size: Maximum stored definition characters; 0 is unlimited
        """
        if max_column_objects is not None and max_column_objects <= 0:
            raise ValueError("max_column_objects must be a positive integer")
        self.token_provider = token_provider or create_token_provider(auth_method)
        self.custom_subscription_id = subscription_id
        self.sql_admin_password = sql_admin_password
        self.create_dmv = create_dmv
        self.sql_auth_mode = sql_auth_mode
        self.sql_client_id = sql_client_id
        self.sql_client_secret = sql_client_secret
        self.sql_tenant_id = sql_tenant_id
        self.query_history_days = query_history_days
        self.query_history_top = query_history_top
        self.include_sql_text = include_sql_text
        self.skip_query_history = skip_query_history
        self.serverless_history_days = serverless_history_days
        self.serverless_top_n = serverless_top_n
        self.skip_serverless_activity = skip_serverless_activity
        self.serverless_sql_auth_mode = serverless_sql_auth_mode
        self.serverless_sql_username = serverless_sql_username
        self.serverless_sql_password = serverless_sql_password
        self.serverless_sql_client_id = serverless_sql_client_id
        self.serverless_sql_client_secret = serverless_sql_client_secret
        self.serverless_sql_tenant_id = serverless_sql_tenant_id
        self._validate_serverless_options()
        self.skip_columns = skip_columns
        self.max_column_objects = max_column_objects
        self.sql_complexity = sql_complexity
        self.sql_definition_redaction = sql_definition_redaction
        self.sql_complexity_schemas = sql_complexity_schemas or []
        self.sql_complexity_scorer = SqlComplexityScorer(sql_definition_redaction)
        self.extract_definitions = extract_definitions
        self.definition_redaction = definition_redaction
        self.definition_schema_filter = definition_schema_filter or []
        self.max_definition_size = max_definition_size
        self.authenticate()
        self._workspace_cache: dict[str, SynapseWorkspaceInfo] = {}
        self.dev_endpoint_permission_issues = False
        self.unreached_components: list[str] = []
        self.paused_databases: list[str] = []

    def _validate_serverless_options(self) -> None:
        """Validate serverless activity collection options."""
        if not 1 <= self.serverless_history_days <= 45:
            raise ValueError("serverless_history_days must be between 1 and 45")
        if not 1 <= self.serverless_top_n <= 10000:
            raise ValueError("serverless_top_n must be between 1 and 10000")
        self._column_metadata_cache: dict[
            tuple[str, str], SynapseColumnMetadataResult
        ] = {}
        self._object_inventory_cache: dict[
            tuple[str, str], list[SynapseColumnMetadataObject]
        ] = {}
        self.sql_complexity_issues: list[str] = []
        self.definition_extraction_issues: list[str] = []

    def authenticate(self) -> None:
        """Authenticate with Azure using the configured token provider."""
        try:
            self.synapse_clients: dict[str, ApiClient] = {}

            # Use custom subscription_id if provided, otherwise use provider default
            default_sub = self.token_provider.get_subscription_id()
            self.subscription_id = self.custom_subscription_id or default_sub

        except Exception as e:
            raise Exception(f"Failed to authenticate with Azure: {e}")

    def _ensure_azure_client(self) -> bool:
        """Lazily create the Azure management API client when needed.

        Returns:
            True if the Azure management client is available, False otherwise.
        """
        if "azure" in self.synapse_clients:
            return True

        # Skip Azure Management API for Fabric notebooks - notebookutils.credentials.getToken()
        # hangs indefinitely when requesting the management.azure.com scope
        if isinstance(self.token_provider, FabricNotebookTokenProvider):
            return False

        try:
            azure_token = self.token_provider.get_token(
                "https://management.azure.com/.default"
            )
            self.synapse_clients["azure"] = ApiClient(token=azure_token)
            return True
        except Exception:
            return False

    @property
    def _has_azure_client(self) -> bool:
        """Check if the Azure management API client is available."""
        return "azure" in self.synapse_clients or self._ensure_azure_client()

    def get_workspaces(self) -> list[SynapseWorkspaceInfo]:
        """Get all Synapse workspaces in the subscription.

        Used for interactive workspace selection when no workspace names are provided.
        Requires Azure management API access.
        """
        if not self.subscription_id:
            raise Exception(
                "No subscription ID available. "
                "Please provide --subscription-id when using Fabric notebook authentication."
            )

        self._ensure_azure_client()
        args = Namespace()
        args.uri = f"/subscriptions/{self.subscription_id}/providers/Microsoft.Synapse/workspaces"
        req = self.synapse_clients["azure"].do_request(args)

        json_req = req.json()

        workspaces = [
            SynapseWorkspaceInfo(
                id=workspace["id"],
                name=workspace["name"],
                resource_group=workspace["id"].split("/")[4],
                location=workspace["location"],
                status=workspace["properties"]["provisioningState"],
                endpoints=workspace["properties"].get("connectivityEndpoints"),
                json_response=workspace,
            )
            for workspace in json_req["value"]
        ]

        # Populate cache
        for ws in workspaces:
            self._workspace_cache[ws.name.lower()] = ws

        return workspaces

    def assess_workspace(self, workspace_name: str, mode: str) -> SynapseAssessment:
        """
        Assess a Synapse workspace.

        Args:
            workspace_name: Name of the Synapse workspace
            mode: Assessment mode (full, etc.)

        Returns:
            SynapseAssessment object with all assessment data
        """
        utils_ui.print(f"Assessing Synapse workspace: {workspace_name} (mode: {mode})")

        try:
            # Reset permission issues tracking for this assessment
            self.dev_endpoint_permission_issues = False
            self.unreached_components = []
            self.paused_databases = []
            self._column_metadata_cache = {}
            self._object_inventory_cache = {}
            self.sql_complexity_issues = []
            self.definition_extraction_issues = []

            # Get workspace details
            workspace_info = self._get_workspace_info(workspace_name)

            # At this stage we should probably check if the workspace has network restrictions and, if it is positive, prompt for user
            # confirmation that the client can reach the workspace in order to follow up with the assessment.
            # If negative, we should cancel the assessment (maybe with guidelines on how to configure the client to be able to reach)

            # Potential properties to look for when assessing network connectivity:
            # * 'privateEndpointConnections'
            # * 'publicNetworkAccess'
            # * 'managedVirtualNetworkSettings'

            self._get_synapse_clients(workspace_info.endpoints)

            # Gather SQL admin credentials early (needed for dedicated pool schema/table listing and statistics)
            sql_admin_login = workspace_info.json_response.get("properties").get(
                "sqlAdministratorLogin"
            )
            sql_admin_password = self._get_sql_admin_credentials(
                workspace_name, sql_admin_login
            )

            # Get SQL pools - dev endpoint
            utils_ui.print_extracting("SQL Pools")
            sql_pools = self._get_sql_pools(
                workspace_name, sql_admin_login, sql_admin_password
            )
            utils_ui.print_extraction_done("SQL Pools")

            utils_ui.print_extracting("Dedicated SQL Pool Workload")
            for pool in sql_pools.dedicated_pools:
                pool.workload = self._get_dedicated_pool_workload(
                    workspace_name,
                    pool,
                    sql_admin_login,
                    sql_admin_password,
                )
            utils_ui.print_extraction_done("Dedicated SQL Pool Workload")
            utils_ui.print_extracting("Column Metadata")
            column_summary = self._collect_column_metadata(
                workspace_name,
                sql_pools,
                sql_admin_login,
                sql_admin_password,
            )
            utils_ui.print_extraction_done("Column Metadata")

            # Get Spark pools - azure endpoint
            utils_ui.print_extracting("Spark Pools")
            spark_pools = self._get_spark_pools(workspace_name)
            utils_ui.print_extraction_done("Spark Pools")

            # Get pipelines - dev endpoint
            utils_ui.print_extracting("Pipelines")
            pipelines = self._get_pipelines(workspace_name)
            utils_ui.print_extraction_done("Pipelines")

            # Get dataflows - dev endpoint
            utils_ui.print_extracting("Dataflows")
            dataflows = self._get_dataflows(workspace_name)
            utils_ui.print_extraction_done("Dataflows")

            # Get notebooks - dev endpoint
            utils_ui.print_extracting("Notebooks")
            notebooks = self._get_notebooks(workspace_name)
            utils_ui.print_extraction_done("Notebooks")

            # Get SJDs - dev endpoint
            utils_ui.print_extracting("Spark Job Definitions")
            spark_job_definitions = self._get_sparkjobdefinitions(workspace_name)
            utils_ui.print_extraction_done("Spark Job Definitions")

            # Get SQL scripts - dev endpoint
            utils_ui.print_extracting("SQL Scripts")
            sql_scripts = self._get_sql_scripts(workspace_name)
            utils_ui.print_extraction_done("SQL Scripts")

            # Get integration runtimes - dev endpoint
            utils_ui.print_extracting("Integration Runtimes")
            integration_runtimes = self._get_integration_runtimes(workspace_name)
            utils_ui.print_extraction_done("Integration Runtimes")

            # Get linked services - dev endpoint
            utils_ui.print_extracting("Linked Services")
            linked_services = self._get_linked_services(workspace_name)
            utils_ui.print_extraction_done("Linked Services")

            # Get datasets - dev endpoint
            utils_ui.print_extracting("Datasets")
            datasets = self._get_datasets(workspace_name)
            utils_ui.print_extraction_done("Datasets")

            # Get managed private endpoints - dev endpoint
            utils_ui.print_extracting("Managed Private Endpoints")
            managed_private_endpoints = self._get_managed_private_endpoints(
                workspace_name
            )
            utils_ui.print_extraction_done("Managed Private Endpoints")

            # Get libraries - dev endpoint
            utils_ui.print_extracting("Libraries")
            libraries = self._get_libraries(workspace_name)
            utils_ui.print_extraction_done("Libraries")

            # Extract spark configurations from spark pools, notebooks, and SJDs
            utils_ui.print_extracting("Spark Configurations")
            spark_configurations = self._extract_spark_configurations(
                spark_pools, notebooks, spark_job_definitions
            )
            utils_ui.print_extraction_done("Spark Configurations")

            # Get table statistics using SQL admin credentials if provided
            if self._has_sql_credentials(sql_admin_login, sql_admin_password):
                utils_ui.print_extracting("Table Statistics")
                for pool in sql_pools.dedicated_pools:
                    # Get dedicated databases table statistics - odbc client
                    db = pool.database
                    (
                        table_statistics,
                        code_object_count,
                        code_object_lines,
                        definitions,
                        definition_summary,
                    ) = self._get_dedicated_database_statistics(
                        workspace_name,
                        db.name,
                        sql_admin_login,
                        sql_admin_password,
                    )

                    for schema in db.schemas.schemas:
                        for table in schema.tables.tables:
                            # Find matching statistics
                            matching_stats = next(
                                (
                                    stats
                                    for stats in table_statistics
                                    if stats.database_name == db.name
                                    and stats.schema_name == schema.name
                                    and stats.table_name == table.name
                                ),
                                None,
                            )
                            if matching_stats:
                                table.statistics = matching_stats

                    pool.code_lines = code_object_lines
                    pool.code_objects = code_object_count
                    pool.tables_count = sum(
                        len(schema.tables.tables) for schema in db.schemas.schemas
                    )
                    pool.size_gb = round(
                        sum(
                            table.statistics.table_reserved_space_gb
                            for schema in db.schemas.schemas
                            for table in schema.tables.tables
                            if table.statistics is not None
                        ),
                        2,
                    )
                    db.definitions = definitions
                    db.definition_summary = definition_summary
                utils_ui.print_extraction_done("Table Statistics")

            else:
                utils_ui.print_warning(
                    "Skipping dedicated SQL databases table statistics collection."
                )
                if self.extract_definitions:
                    for pool in sql_pools.dedicated_pools:
                        pool.database.definition_summary = SynapseDefinitionSummary(
                            extraction_status="unavailable",
                            status_description=(
                                "Definition extraction requires dedicated SQL pool "
                                "authentication."
                            ),
                        )
                    self.definition_extraction_issues.append(
                        "dedicated SQL authentication was not available"
                    )

            if self.sql_complexity:
                utils_ui.print_extracting("SQL Complexity")
                self._collect_sql_complexity(
                    workspace_name=workspace_name,
                    sql_pools=sql_pools,
                    sql_admin_login=sql_admin_login,
                    sql_admin_password=sql_admin_password,
                )
                utils_ui.print_extraction_done("SQL Complexity")

            # Create assessment metadata
            assessment_metadata = SynapseAssessmentMetadata(
                mode=mode,
                timestamp=self._get_timestamp(),
                query_history_days=self.query_history_days,
                query_history_top=self.query_history_top,
                sql_text_redacted=not self.include_sql_text,
                query_history_skipped=self.skip_query_history,
                skip_columns=self.skip_columns,
                max_column_objects=self.max_column_objects,
            )

            # Determine final status based on permission issues
            incomplete_reasons = []

            if self.dev_endpoint_permission_issues:
                incomplete_reasons.append(
                    "lack of permissions on the dev endpoint: ["
                    + ", ".join(self.unreached_components)
                    + "]"
                )

            if len(self.paused_databases) > 0:
                incomplete_reasons.append(
                    f"paused dedicated SQL databases: [{', '.join(self.paused_databases)}]"
                )

            unavailable_workload_pools = [
                pool.name
                for pool in sql_pools.dedicated_pools
                if pool.workload is not None
                and pool.workload.collection_status == "unavailable"
                and pool.name not in self.paused_databases
            ]
            if unavailable_workload_pools:
                incomplete_reasons.append(
                    "unavailable dedicated SQL workload DMVs: ["
                    + ", ".join(unavailable_workload_pools)
                    + "]"
                )
            serverless_activity_status = (
                sql_pools.serverless_pool.activity.metadata.status
            )
            if serverless_activity_status == "unavailable":
                incomplete_reasons.append("serverless SQL activity was unavailable")
            if column_summary.collection_status in ("partial", "unavailable"):
                limited_databases = (
                    column_summary.partial_databases
                    + column_summary.unavailable_databases
                )
                incomplete_reasons.append(
                    "column metadata incomplete for databases: ["
                    + ", ".join(limited_databases)
                    + "]"
                )
            if self.sql_complexity_issues:
                incomplete_reasons.append(
                    "SQL complexity collection issues: ["
                    + "; ".join(self.sql_complexity_issues)
                    + "]"
                )
            if self.definition_extraction_issues:
                incomplete_reasons.append(
                    "definition extraction issues: ["
                    + "; ".join(self.definition_extraction_issues)
                    + "]"
                )

            if incomplete_reasons:
                status = AssessmentStatus(
                    status="incomplete",
                    description=f"Assessment completed with limited information due to: {'; '.join(incomplete_reasons)}.",
                )
            else:
                status = AssessmentStatus(status="completed")

            # Return complete assessment object
            return SynapseAssessment(
                status=status,
                workspace_info=workspace_info,
                sql_pools=sql_pools,
                spark_pools=spark_pools,
                pipelines=pipelines,
                dataflows=dataflows,
                notebooks=notebooks,
                spark_job_definitions=spark_job_definitions,
                sql_scripts=sql_scripts,
                integration_runtimes=integration_runtimes,
                linked_services=linked_services,
                datasets=datasets,
                managed_private_endpoints=managed_private_endpoints,
                libraries=libraries,
                spark_configurations=spark_configurations,
                assessment_metadata=assessment_metadata,
                subscription_id=self.subscription_id,
                resource_group=workspace_info.resource_group,
                column_summary=column_summary,
            )

        except Exception as e:
            raise Exception(f"Failed to assess workspace {workspace_name}: {e}")

    def _collect_column_metadata(
        self,
        workspace_name: str,
        sql_pools: SynapseSqlPools,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> SynapseColumnSummary:
        """Collect, attach, and summarize column metadata for every SQL database."""

        database_entries: list[tuple[Literal["dedicated", "serverless"], Any]] = [
            ("dedicated", pool.database) for pool in sql_pools.dedicated_pools
        ] + [
            ("serverless", database)
            for database in sql_pools.serverless_pool.databases.databases
        ]
        statuses: list[SynapseColumnDatabaseStatus] = []

        if self.skip_columns:
            reason = "Column collection was disabled by --skip-columns."
            if self._has_sql_credentials(sql_admin_login, sql_admin_password):
                for database_type, database in database_entries:
                    if database_type != "dedicated":
                        continue
                    try:
                        self._attach_column_metadata(
                            database,
                            self._get_or_collect_table_view_objects(
                                workspace_name,
                                database.name,
                                sql_admin_login,
                                sql_admin_password,
                            ),
                        )
                    except Exception as error:
                        utils_ui.print_warning(
                            "Dedicated view inventory unavailable for database "
                            f"'{database.name}': "
                            f"{self._safe_odbc_error(error, sql_admin_password, self.sql_client_secret)}"
                        )
            statuses = [
                SynapseColumnDatabaseStatus(
                    database=database.name,
                    database_type=database_type,
                    status="skipped",
                    objects_considered=self._count_database_objects(database),
                    objects_collected=0,
                    columns_collected=0,
                    reason=reason,
                )
                for database_type, database in database_entries
            ]
            return self._build_column_summary(
                statuses=statuses,
                sql_pools=sql_pools,
                collection_status="skipped",
                skipped_reason=reason,
            )

        if not database_entries:
            return self._build_column_summary(
                statuses=[],
                sql_pools=sql_pools,
                collection_status="completed",
            )

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            reason = (
                "SQL/Entra credentials were not available for ODBC metadata collection."
            )
            statuses = [
                SynapseColumnDatabaseStatus(
                    database=database.name,
                    database_type=database_type,
                    status="unavailable",
                    objects_considered=self._count_database_objects(database),
                    objects_collected=0,
                    columns_collected=0,
                    reason=reason,
                )
                for database_type, database in database_entries
            ]
            return self._build_column_summary(
                statuses=statuses,
                sql_pools=sql_pools,
                collection_status="unavailable",
            )

        for database_type, database in database_entries:
            try:
                metadata = self._get_or_collect_column_metadata(
                    workspace_name,
                    database.name,
                    sql_admin_login,
                    sql_admin_password,
                )
                self._attach_column_metadata(database, metadata.objects)
                objects_considered = self._count_database_objects(database)
                database_status: Literal["collected", "capped", "partial"]
                status_reason: Optional[str] = None
                if metadata.capped:
                    database_status = "capped"
                    status_reason = (
                        f"Limited to the first {self.max_column_objects} objects "
                        "ordered by schema, object type, and object name."
                    )
                elif metadata.selected_objects < objects_considered:
                    database_status = "partial"
                    status_reason = (
                        f"{objects_considered - metadata.selected_objects} inventory "
                        "objects were not returned by INFORMATION_SCHEMA.COLUMNS."
                    )
                else:
                    database_status = "collected"
                statuses.append(
                    SynapseColumnDatabaseStatus(
                        database=database.name,
                        database_type=database_type,
                        status=database_status,
                        objects_considered=objects_considered,
                        objects_collected=metadata.selected_objects,
                        columns_collected=sum(
                            len(item.columns)
                            for item in metadata.objects
                            if item.columns_collected
                        ),
                        reason=status_reason,
                    )
                )
            except Exception as error:
                reason = self._safe_odbc_error(
                    error, sql_admin_password, self.sql_client_secret
                )
                statuses.append(
                    SynapseColumnDatabaseStatus(
                        database=database.name,
                        database_type=database_type,
                        status="unavailable",
                        objects_considered=self._count_database_objects(database),
                        objects_collected=0,
                        columns_collected=0,
                        reason=reason,
                    )
                )
                utils_ui.print_warning(
                    f"Column metadata unavailable for database '{database.name}': {reason}"
                )

        unavailable = any(status.status == "unavailable" for status in statuses)
        partial = any(status.status == "partial" for status in statuses)
        collected = any(
            status.status in ("collected", "capped", "partial") for status in statuses
        )
        capped = any(status.status == "capped" for status in statuses)
        if unavailable and collected:
            collection_status: Literal[
                "completed", "capped", "partial", "skipped", "unavailable"
            ] = "partial"
        elif unavailable:
            collection_status = "unavailable"
        elif partial:
            collection_status = "partial"
        elif capped:
            collection_status = "capped"
        else:
            collection_status = "completed"

        return self._build_column_summary(
            statuses=statuses,
            sql_pools=sql_pools,
            collection_status=collection_status,
        )

    def _build_column_summary(
        self,
        statuses: list[SynapseColumnDatabaseStatus],
        sql_pools: SynapseSqlPools,
        collection_status: Literal[
            "completed", "capped", "partial", "skipped", "unavailable"
        ],
        skipped_reason: Optional[str] = None,
    ) -> SynapseColumnSummary:
        """Build a typed workspace summary from attached column lists."""

        data_type_counts: Counter[str] = Counter()
        compatibility_counts: Counter[str] = Counter()
        wide_objects: list[SynapseWideObject] = []
        total_columns = 0
        nullable_columns = 0

        database_entries: list[tuple[Literal["dedicated", "serverless"], Any]] = [
            ("dedicated", pool.database) for pool in sql_pools.dedicated_pools
        ] + [
            ("serverless", database)
            for database in sql_pools.serverless_pool.databases.databases
        ]
        for database_type, database in database_entries:
            for schema in database.schemas.schemas:
                for object_type, objects in (
                    ("table", schema.tables.tables),
                    ("view", schema.views.views),
                ):
                    for item in objects:
                        column_count = len(item.columns)
                        total_columns += column_count
                        nullable_columns += sum(
                            1 for column in item.columns if column.is_nullable
                        )
                        data_type_counts.update(
                            column.data_type for column in item.columns
                        )
                        compatibility_counts.update(
                            column.compatibility for column in item.columns
                        )
                        if column_count >= 100:
                            wide_objects.append(
                                SynapseWideObject(
                                    database=database.name,
                                    schema=schema.name,
                                    object_type=cast(
                                        Literal["table", "view"], object_type
                                    ),
                                    name=item.name,
                                    column_count=column_count,
                                )
                            )

        data_types = []
        for data_type, count in sorted(
            data_type_counts.items(), key=lambda item: (-item[1], item[0])
        ):
            compatibility = get_fabric_type_compatibility(data_type)
            data_types.append(
                SynapseDataTypeSummary(
                    data_type=data_type,
                    column_count=count,
                    compatibility=compatibility.classification,
                    compatibility_note=compatibility.note,
                )
            )

        wide_objects.sort(
            key=lambda item: (
                item.database.lower(),
                item.schema.lower(),
                item.object_type,
                item.name.lower(),
            )
        )
        return SynapseColumnSummary(
            collection_status=collection_status,
            generated_at=self._get_timestamp(),
            configured_max_column_objects=self.max_column_objects,
            wide_object_threshold=100,
            total_objects_considered=sum(
                status.objects_considered for status in statuses
            ),
            total_objects_collected=sum(
                status.objects_collected for status in statuses
            ),
            total_columns=total_columns,
            nullable_columns=nullable_columns,
            data_types=data_types,
            compatibility_totals=SynapseCompatibilityTotals(
                compatible=compatibility_counts["compatible"],
                review=compatibility_counts["review"],
                unsupported=compatibility_counts["unsupported"],
            ),
            wide_objects=wide_objects,
            database_statuses=statuses,
            capped_databases=[
                status.database for status in statuses if status.status == "capped"
            ],
            partial_databases=[
                status.database for status in statuses if status.status == "partial"
            ],
            unavailable_databases=[
                status.database for status in statuses if status.status == "unavailable"
            ],
            skipped_reason=skipped_reason,
        )

    def _get_or_collect_column_metadata(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> SynapseColumnMetadataResult:
        """Return cached database metadata or execute its single batch query."""

        cache_key = (workspace_name.lower(), database_name.lower())
        if cache_key not in self._column_metadata_cache:
            with self._create_odbc_client(
                workspace_name=workspace_name,
                database_name=database_name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            ) as odbc_client:
                self._column_metadata_cache[cache_key] = (
                    odbc_client.get_column_metadata(self.max_column_objects)
                )
        return self._column_metadata_cache[cache_key]

    def _get_or_collect_table_view_objects(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> list[SynapseColumnMetadataObject]:
        """Return cached table/view inventory without querying columns."""

        cache_key = (workspace_name.lower(), database_name.lower())
        if cache_key not in self._object_inventory_cache:
            with self._create_odbc_client(
                workspace_name=workspace_name,
                database_name=database_name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            ) as odbc_client:
                self._object_inventory_cache[cache_key] = (
                    odbc_client.get_table_view_objects()
                )
        return self._object_inventory_cache[cache_key]

    def _attach_column_metadata(
        self, database, metadata_objects: list[SynapseColumnMetadataObject]
    ) -> None:
        """Attach columns and add ODBC-discovered tables/views to a database."""

        schemas = {schema.name.lower(): schema for schema in database.schemas.schemas}
        for metadata_object in metadata_objects:
            schema_key = metadata_object.schema.lower()
            schema = schemas.get(schema_key)
            if schema is None:
                schema = SynapseSchema(
                    name=metadata_object.schema,
                    database=database.name,
                    tables=SynapseTables(tables=[]),
                    views=SynapseViews(views=[]),
                    json_response={
                        "name": metadata_object.schema,
                        "source": "INFORMATION_SCHEMA",
                    },
                )
                database.schemas.schemas.append(schema)
                schemas[schema_key] = schema

            collection: Any = (
                schema.tables.tables
                if metadata_object.object_type == "table"
                else schema.views.views
            )
            item = next(
                (
                    existing
                    for existing in collection
                    if existing.name.lower() == metadata_object.name.lower()
                ),
                None,
            )
            if item is None:
                raw_response = {
                    "name": metadata_object.name,
                    "schema": metadata_object.schema,
                    "object_type": metadata_object.object_type,
                    "source": "INFORMATION_SCHEMA",
                }
                if metadata_object.object_type == "table":
                    item = SynapseTable(
                        name=metadata_object.name,
                        database=database.name,
                        schema=metadata_object.schema,
                        statistics=None,
                        json_response=raw_response,
                    )
                else:
                    item = SynapseView(
                        name=metadata_object.name,
                        database=database.name,
                        schema=metadata_object.schema,
                        json_response=raw_response,
                    )
                collection.append(item)

            if metadata_object.columns_collected:
                item.columns = sorted(
                    metadata_object.columns,
                    key=lambda column: column.ordinal_position,
                )

        database.schemas.schemas.sort(key=lambda schema: schema.name.lower())
        for schema in database.schemas.schemas:
            schema.tables.tables.sort(key=lambda table: table.name.lower())
            schema.views.views.sort(key=lambda view: view.name.lower())

    @staticmethod
    def _count_database_objects(database) -> int:
        return sum(
            len(schema.tables.tables) + len(schema.views.views)
            for schema in database.schemas.schemas
        )

    @staticmethod
    def _safe_odbc_error(error: Exception, *sensitive_values: Optional[str]) -> str:
        message = str(error)
        for value in sensitive_values:
            if value and value != "__entra_auth__":
                message = message.replace(value, "***")
        return f"ODBC metadata query failed ({type(error).__name__}): {message[:500]}"

    def _get_workspace_info(self, workspace_name: str) -> SynapseWorkspaceInfo:
        """Get Synapse workspace information.

        Returns cached info if available, otherwise fetches directly
        from the workspace dev endpoint.
        """
        cache_key = workspace_name.lower()
        if cache_key in self._workspace_cache:
            return self._workspace_cache[cache_key]

        # Fetch workspace details via the dev endpoint
        # https://learn.microsoft.com/en-us/rest/api/synapse/data-plane/workspace/get?view=rest-synapse-data-plane-2020-12-01
        dev_base_url = f"{workspace_name}.dev.azuresynapse.net"
        dev_scope = "https://dev.azuresynapse.net/.default"
        dev_token = self.token_provider.get_token(dev_scope)
        dev_client = ApiClient(
            base_url=dev_base_url,
            scope=dev_scope,
            api_version="2020-12-01",
            token=dev_token,
        )

        args = Namespace()
        args.uri = "/workspace"
        req = dev_client.do_request(args)
        workspace = req.json()

        ws = SynapseWorkspaceInfo(
            id=workspace["id"],
            name=workspace["name"],
            resource_group=workspace["id"].split("/")[4],
            location=workspace["location"],
            status=workspace["properties"]["provisioningState"],
            endpoints=workspace["properties"].get("connectivityEndpoints"),
            json_response=workspace,
        )

        self._workspace_cache[cache_key] = ws
        return ws

    def _get_synapse_clients(
        self, connectivityEndpoints: dict[str, str]
    ) -> dict[str, ApiClient]:
        for key, value in connectivityEndpoints.items():
            # Remove http:// or https:// if present in value to build base url
            base_url = value.replace("http://", "").replace("https://", "")
            api_version = None
            scope = None
            match key:
                case "dev":
                    api_version = "2020-12-01"  # https://learn.microsoft.com/en-us/rest/api/synapse/data-plane/operation-groups?view=rest-synapse-data-plane-2020-12-01
                    scope = "https://dev.azuresynapse.net/.default"

            self.synapse_clients[key] = ApiClient(
                base_url=base_url,
                scope=scope,
                api_version=api_version,
                token=self.token_provider.get_token(scope) if scope else None,
            )
        return self.synapse_clients

    def _get_sql_pools(
        self,
        workspace_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseSqlPools:
        """Get SQL pools in the workspace."""

        ws = self._get_workspace_info(workspace_name)

        args = Namespace()
        # https://learn.microsoft.com/en-us/rest/api/synapse/data-plane/sql-pools/list?view=rest-synapse-data-plane-2020-12-01&tabs=HTTP
        args.uri = f"/sqlPools"
        req = self.synapse_clients["dev"].do_request(args)

        json_req = req.json()

        dedicated_pools = [
            SynapseDedicatedPool(
                name=pool["name"],
                status=pool["properties"]["status"],
                sku=pool["sku"]["name"],
                database=SynapseDedicatedDatabase(
                    name=pool["name"],
                    schemas=self._get_dedicated_schemas(
                        workspace_name,
                        pool["name"],
                        sql_admin_login,
                        sql_admin_password,
                    ),
                    json_response=pool,
                ),
                tables_count=0,
                size_gb=0,
                code_lines=[],
                code_objects=[],
                json_response=pool,
            )
            for pool in json_req["value"]
        ]
        for pool in dedicated_pools:
            pool.tables_count = sum(
                len(schema.tables.tables) for schema in pool.database.schemas.schemas
            )

        serverless_databases = self._get_serverless_databases(workspace_name)

        if self.skip_serverless_activity:
            serverless_activity = self._build_skipped_serverless_activity()
        else:
            try:
                serverless_activity = self._collect_serverless_activity(
                    workspace_name=workspace_name,
                    sql_admin_login=sql_admin_login,
                    sql_admin_password=sql_admin_password,
                )
            except ServerlessActivityExpectedError as exc:
                utils_ui.print_warning(
                    f"Serverless SQL activity collection unavailable: {exc.message}"
                )
                serverless_activity = self._build_unavailable_serverless_activity(
                    warning=exc.message
                )

        serverless_queries_last_24h = self._count_queries_last_24h(serverless_activity)

        serverless_pool = SynapseServerlessPool(
            name="Built-in",
            status="Online",
            databases=serverless_databases,
            queries_last_24h=serverless_queries_last_24h,
            json_response=None,
            activity=serverless_activity,
        )

        return SynapseSqlPools(
            dedicated_pools=dedicated_pools, serverless_pool=serverless_pool
        )

    def _get_spark_pools(self, workspace_name: str) -> SynapseSparkPools:
        """Get Spark pools in the workspace."""

        ws = self._get_workspace_info(workspace_name)

        args = Namespace()
        # https://learn.microsoft.com/en-us/rest/api/synapse/data-plane/big-data-pools/list?view=rest-synapse-data-plane-2020-12-01&tabs=HTTP
        args.uri = "/bigDataPools"
        req = self.synapse_clients["dev"].do_request(args)

        json_req = req.json()

        spark_pools = [
            SynapseSparkPool(
                name=pool["name"],
                location=pool.get("location", ws.location),
                node_size=pool["properties"]["nodeSize"],
                node_count=pool["properties"]["nodeCount"],
                spark_version=pool["properties"]["sparkVersion"],
                json_response=pool,
            )
            for pool in json_req["value"]
        ]

        return SynapseSparkPools(spark_pools=spark_pools)

    def _get_pipelines(self, workspace_name: str) -> SynapsePipelines:
        """Get pipelines in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/pipelines"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            pipelines = [
                SynapsePipeline(
                    name=pipe["name"],
                    description=pipe["properties"].get("description", ""),
                    last_run=pipe["properties"].get("lastPublishTime", ""),
                    activities_count=len(pipe["properties"].get("activities", [])),
                    json_response=pipe,
                )
                for pipe in json_req["value"]
            ]

            return SynapsePipelines(pipelines=pipelines)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("pipelines")
                return SynapsePipelines(pipelines=[])
            raise e

    def _get_dataflows(self, workspace_name: str) -> SynapseDataflows:
        """Get dataflows in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/dataflows"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            dataflows = [
                SynapseDataflow(
                    name=df["name"],
                    description=df["properties"].get("description", ""),
                    json_response=df,
                )
                for df in json_req["value"]
            ]

            return SynapseDataflows(dataflows=dataflows)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("dataflows")
                return SynapseDataflows(dataflows=[])
            raise e

    def _get_notebooks(self, workspace_name: str) -> SynapseNotebooks:
        """Get notebooks in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/notebooks"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            notebooks = [
                SynapseNotebook(
                    name=nb["name"],
                    language=nb.get("properties", {})
                    .get("metadata", {})
                    .get("language_info", {})
                    .get("name"),
                    etag=nb.get("etag"),
                    json_response=nb,
                    uses_mssparkutils=self._check_notebook_for_mssparkutils(nb),
                    spark_configuration=self._get_target_spark_configuration(nb),
                )
                for nb in json_req["value"]
            ]

            return SynapseNotebooks(notebooks=notebooks)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("notebooks")
                return SynapseNotebooks(notebooks=[])
            raise e

    def _get_target_spark_configuration(self, resource: dict) -> Optional[str]:
        """Extract the target Spark configuration name from a resource.

        Args:
            resource: The resource JSON response (notebook or spark job definition)

        Returns:
            The Spark configuration name if found, None otherwise
        """
        target_config = resource.get("properties", {}).get("targetSparkConfiguration")
        if target_config and isinstance(target_config, dict):
            return target_config.get("referenceName")
        return None

    def _check_notebook_for_mssparkutils(self, notebook: dict) -> bool:
        """Check if notebook content contains mssparkutils references.

        Args:
            notebook: The notebook JSON response

        Returns:
            True if mssparkutils is found in any cell source
        """
        cells = notebook.get("properties", {}).get("cells", [])
        for cell in cells:
            source = cell.get("source", [])
            # source can be a list of strings or a single string
            if isinstance(source, list):
                content = "".join(source)
            else:
                content = str(source)
            if "mssparkutils" in content:
                return True
        return False

    def _get_sparkjobdefinitions(
        self, workspace_name: str
    ) -> SynapseSparkJobDefinitions:
        """Get Spark Job Definitions in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/sparkJobDefinitions"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            spark_job_definitions = [
                SynapseSparkJobDefinition(
                    name=nb["name"],
                    etag=nb.get("etag"),
                    json_response=nb,
                    spark_configuration=self._get_target_spark_configuration(nb),
                )
                for nb in json_req["value"]
            ]

            return SynapseSparkJobDefinitions(
                spark_job_definitions=spark_job_definitions
            )
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("spark_job_definitions")
                return SynapseSparkJobDefinitions(spark_job_definitions=[])
            raise e

    def _get_sql_scripts(self, workspace_name: str) -> SynapseSqlScripts:
        """Get SQL scripts in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/sqlScripts"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            sql_scripts = [
                SynapseSqlScript(
                    name=df["name"],
                    description=df["properties"].get("description", ""),
                    json_response=df,
                )
                for df in json_req["value"]
            ]

            return SynapseSqlScripts(sql_scripts=sql_scripts)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("sql_scripts")
                return SynapseSqlScripts(sql_scripts=[])
            raise e

    def _get_integration_runtimes(
        self, workspace_name: str
    ) -> SynapseIntegrationRuntimes:
        """Get Integration Runtimes in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/integrationRuntimes"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            integration_runtimes = [
                SynapseIntegrationRuntime(
                    name=df["name"],
                    description=df["properties"].get("description", ""),
                    type=df["properties"]["type"],
                    json_response=df,
                )
                for df in json_req["value"]
            ]

            return SynapseIntegrationRuntimes(integration_runtimes=integration_runtimes)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("integration_runtimes")
                return SynapseIntegrationRuntimes(integration_runtimes=[])
            raise e

    def _get_linked_services(self, workspace_name: str) -> SynapseLinkedServices:
        """Get Linked Services in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/linkedServices"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            linked_services = [
                SynapseLinkedService(
                    name=df["name"],
                    type=df["properties"]["type"],
                    json_response=df,
                )
                for df in json_req["value"]
            ]

            return SynapseLinkedServices(linked_services=linked_services)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("linked_services")
                return SynapseLinkedServices(linked_services=[])
            raise e

    def _get_datasets(self, workspace_name: str) -> SynapseDatasets:
        """Get Datasets in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/datasets"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            datasets = [
                SynapseDataset(
                    name=df["name"],
                    type=df["properties"]["type"],
                    json_response=df,
                )
                for df in json_req["value"]
            ]

            return SynapseDatasets(datasets=datasets)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("datasets")
                return SynapseDatasets(datasets=[])
            raise e

    def _get_managed_private_endpoints(
        self, workspace_name: str
    ) -> SynapseManagedPrivateEndpoints:
        """Get Managed Private Endpoints in the workspace."""

        args = Namespace()
        args.uri = f"/managedVirtualNetworks/default/managedPrivateEndpoints"

        try:

            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            managed_private_endpoints = [
                SynapseManagedPrivateEndpoint(
                    name=mp["name"],
                    type=mp["properties"]["privateLinkResourceId"].split("/")[6],
                    status=mp["properties"]["connectionState"]["status"],
                    json_response=mp,
                )
                for mp in json_req["value"]
            ]

            return SynapseManagedPrivateEndpoints(
                managed_private_endpoints=managed_private_endpoints
            )

        except FATError as e:
            if e.status_code == "BadRequest" and "InvalidManagedVnetName" in e.message:
                # The workspace does not have a managed virtual network associated.
                return SynapseManagedPrivateEndpoints(managed_private_endpoints=[])
            elif e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("managed_private_endpoints")
                return SynapseManagedPrivateEndpoints(managed_private_endpoints=[])
            else:
                raise e

    def _get_libraries(self, workspace_name: str) -> SynapseLibraries:
        """Get libraries in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/libraries"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            libraries = [
                SynapseLibrary(
                    name=lib["name"],
                    type=lib["properties"]["type"],
                    json_response=lib,
                )
                for lib in json_req["value"]
            ]

            return SynapseLibraries(libraries=libraries)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("libraries")
                return SynapseLibraries(libraries=[])
            raise e

    def _get_serverless_databases(
        self, workspace_name: str
    ) -> SynapseServerlessDatabases:
        """Get databases in the workspace."""

        try:
            args = Namespace()
            args.uri = f"/databases"
            args.request_params = {"api-version": "2021-04-01"}
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            databases = [
                SynapseServerlessDatabase(
                    name=db["name"],
                    source_provider=db["properties"]
                    .get("Source", {})
                    .get("Provider", ""),
                    origin_type=db["properties"].get("Origin", {}).get("Type", ""),
                    schemas=self._get_serverless_database_schemas(
                        workspace_name, db["name"]
                    ),
                    json_response=db,
                )
                for db in json_req["items"]
            ]

            return SynapseServerlessDatabases(databases=databases)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("serverless_databases")
                return SynapseServerlessDatabases(databases=[])
            raise e

    def _get_serverless_database_schemas(
        self, workspace_name: str, database_name: str
    ) -> SynapseSchemas:
        """Get schemas in a database."""
        try:
            args = Namespace()
            args.request_params = {"api-version": "2021-04-01"}
            args.uri = f"/databases/{database_name}/schemas"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            tables = self._get_serverless_database_tables(workspace_name, database_name)
            views = self._get_serverless_database_views(workspace_name, database_name)

            schemas = [
                SynapseSchema(
                    name=schema["name"],
                    database=database_name,
                    tables=SynapseTables(
                        [
                            table
                            for table in tables.tables
                            if table.schema == schema["name"]
                        ]
                    ),
                    views=SynapseViews(
                        [view for view in views.views if view.schema == schema["name"]]
                    ),
                    json_response=schema,
                )
                for schema in json_req["items"]
            ]

            # Add all unparented tables and views to the default schema (empty string)
            empty_schema_tables = [
                table
                for table in tables.tables
                if table.schema is None or table.schema == ""
            ]
            empty_schema_views = [
                view for view in views.views if view.schema is None or view.schema == ""
            ]
            if len(empty_schema_tables) > 0 or len(empty_schema_views) > 0:
                schemas.append(
                    SynapseSchema(
                        name=database_name,
                        database=database_name,
                        tables=SynapseTables(
                            [
                                table
                                for table in tables.tables
                                if table.schema is None or table.schema == ""
                            ]
                        ),
                        views=SynapseViews(
                            [
                                view
                                for view in views.views
                                if view.schema is None or view.schema == ""
                            ]
                        ),
                        json_response=None,
                    )
                )

            return SynapseSchemas(schemas=schemas)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("serverless_databases")
                return SynapseSchemas(schemas=[])
            raise e

    def _get_serverless_database_tables(
        self, workspace_name: str, database_name: str
    ) -> SynapseTables:
        """Get schemas in a database."""
        try:
            args = Namespace()
            args.request_params = {"api-version": "2021-04-01"}
            args.uri = f"/databases/{database_name}/tables"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            tables = [
                SynapseTable(
                    name=table["name"],
                    database=database_name,
                    schema=table["properties"]
                    .get("Namespace", {})
                    .get("SchemaName", "")
                    or "",
                    statistics=None,
                    json_response=table,
                )
                for table in json_req["items"]
            ]

            return SynapseTables(tables=tables)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("serverless_databases")
                return SynapseTables(tables=[])
            raise e

    def _get_serverless_database_views(
        self, workspace_name: str, database_name: str
    ) -> SynapseViews:
        """Get schemas in a database."""
        try:
            args = Namespace()
            args.request_params = {"api-version": "2021-04-01"}
            args.uri = f"/databases/{database_name}/views"
            req = self.synapse_clients["dev"].do_request(args)

            json_req = req.json()

            schemas = [
                SynapseView(
                    name=schema["name"],
                    database=database_name,
                    schema=schema["properties"]
                    .get("Namespace", {})
                    .get("SchemaName", ""),
                    json_response=schema,
                )
                for schema in json_req["items"]
            ]

            return SynapseViews(views=schemas)
        except FATError as e:
            if e.status_code == "Forbidden":
                self.dev_endpoint_permission_issues = True
                self.unreached_components.append("serverless_databases")
                return SynapseViews(views=[])
            raise e

    def _get_dedicated_schemas(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseSchemas:
        """Get schemas in a dedicated SQL pool.

        Uses Azure Management API when available, falls back to ODBC.
        """
        # Try Azure Management API first
        if self._has_azure_client and self.subscription_id:
            return self._get_dedicated_schemas_arm(
                workspace_name, database_name, sql_admin_login, sql_admin_password
            )

        # Fall back to ODBC
        return self._get_dedicated_schemas_odbc(
            workspace_name, database_name, sql_admin_login, sql_admin_password
        )

    def _get_dedicated_schemas_arm(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseSchemas:
        """Get schemas via Azure Management API."""
        ws = self._get_workspace_info(workspace_name)

        try:
            args = Namespace()
            args.uri = f"/subscriptions/{self.subscription_id}/resourceGroups/{ws.resource_group}/providers/Microsoft.Synapse/workspaces/{workspace_name}/sqlPools/{database_name}/schemas"
            req = self.synapse_clients["azure"].do_request(args)

            json_req = req.json()

            schemas = [
                SynapseSchema(
                    name=schema["name"],
                    database=database_name,
                    tables=self._get_dedicated_schema_tables(
                        workspace_name,
                        database_name,
                        schema["name"],
                        sql_admin_login,
                        sql_admin_password,
                    ),
                    views=SynapseViews(views=[]),
                    json_response=schema,
                )
                for schema in json_req["value"]
            ]

            return SynapseSchemas(schemas=schemas)

        except FATError as e:
            if e.status_code == "UpdateNotAllowedOnPausedDatabase":
                self.paused_databases = self.paused_databases + [database_name]
                return SynapseSchemas(schemas=[])
            raise e

    def _get_dedicated_schemas_odbc(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseSchemas:
        """Get schemas via ODBC using INFORMATION_SCHEMA."""

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            utils_ui.print_warning(
                f"Skipping schema listing for '{database_name}' - SQL credentials not provided."
            )
            return SynapseSchemas(schemas=[])

        try:
            if self.skip_columns:
                metadata_objects = self._get_or_collect_table_view_objects(
                    workspace_name,
                    database_name,
                    sql_admin_login,
                    sql_admin_password,
                )
            else:
                metadata_objects = self._get_or_collect_column_metadata(
                    workspace_name,
                    database_name,
                    sql_admin_login,
                    sql_admin_password,
                ).objects

            database = SynapseDedicatedDatabase(
                name=database_name,
                schemas=SynapseSchemas(schemas=[]),
                json_response={"name": database_name},
            )
            self._attach_column_metadata(database, metadata_objects)
            return database.schemas

        except FATError as e:
            if e.status_code == "UpdateNotAllowedOnPausedDatabase":
                self.paused_databases = self.paused_databases + [database_name]
                return SynapseSchemas(schemas=[])
            raise e

    def _get_dedicated_schema_tables(
        self,
        workspace_name: str,
        database_name: str,
        schema_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseTables:
        """Get tables in a dedicated schema.

        Uses Azure Management API when available, falls back to ODBC.
        """
        # Try Azure Management API first
        if self._has_azure_client and self.subscription_id:
            return self._get_dedicated_schema_tables_arm(
                workspace_name, database_name, schema_name
            )

        # Fall back to ODBC
        return self._get_dedicated_schema_tables_odbc(
            workspace_name,
            database_name,
            schema_name,
            sql_admin_login,
            sql_admin_password,
        )

    def _get_dedicated_schema_tables_arm(
        self,
        workspace_name: str,
        database_name: str,
        schema_name: str,
    ) -> SynapseTables:
        """Get tables via Azure Management API."""
        ws = self._get_workspace_info(workspace_name)

        try:
            args = Namespace()
            args.uri = f"/subscriptions/{self.subscription_id}/resourceGroups/{ws.resource_group}/providers/Microsoft.Synapse/workspaces/{workspace_name}/sqlPools/{database_name}/schemas/{schema_name}/tables"
            req = self.synapse_clients["azure"].do_request(args)

            json_req = req.json()

            tables = [
                SynapseTable(
                    name=table["name"],
                    database=database_name,
                    schema=schema_name,
                    statistics=None,
                    json_response=table,
                )
                for table in json_req["value"]
            ]

            return SynapseTables(tables=tables)
        except FATError as e:
            if e.status_code == "UpdateNotAllowedOnPausedDatabase":
                self.paused_databases = self.paused_databases + [database_name]
                return SynapseTables(tables=[])
            raise e

    def _get_dedicated_schema_tables_odbc(
        self,
        workspace_name: str,
        database_name: str,
        schema_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> SynapseTables:
        """Get tables via ODBC using INFORMATION_SCHEMA."""

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            return SynapseTables(tables=[])

        try:
            with self._create_odbc_client(
                workspace_name=workspace_name,
                database_name=database_name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            ) as odbc_client:
                table_names = odbc_client.get_tables(schema_name)

            tables = [
                SynapseTable(
                    name=table_name,
                    database=database_name,
                    schema=schema_name,
                    statistics=None,
                    json_response={"name": table_name},
                )
                for table_name in table_names
            ]

            return SynapseTables(tables=tables)
        except FATError as e:
            if e.status_code == "UpdateNotAllowedOnPausedDatabase":
                self.paused_databases = self.paused_databases + [database_name]
                return SynapseTables(tables=[])
            raise e

    def _get_dedicated_database_statistics(
        self,
        workspace_name: str,
        database_name: str,
        sql_user: Optional[str],
        sql_password: Optional[str],
    ) -> tuple[
        list[TableStatistics],
        list[CodeObjectCount],
        list[CodeObjectLines],
        SynapseSqlDefinitions,
        SynapseDefinitionSummary,
    ]:
        """Get table statistics from a database."""

        odbc_client = self._create_odbc_client(
            workspace_name=workspace_name,
            database_name=database_name,
            sql_admin_login=sql_user,
            sql_admin_password=sql_password,
        )

        table_statistics: list[TableStatistics] = []
        collect_table_statistics = odbc_client.check_table_statistics_dmv_exists()
        if not collect_table_statistics:
            if self.create_dmv:
                # Auto-create DMV in non-interactive mode
                utils_ui.print_extracting(
                    f"Creating table statistics DMV in database {database_name}"
                )
                odbc_client.create_table_statistics_dmv()
                collect_table_statistics = True
                utils_ui.print_extraction_done(
                    f"Creating table statistics DMV in database {database_name}"
                )
            elif self.sql_complexity:
                utils_ui.print_warning(
                    f"Skipping table statistics for '{database_name}' because "
                    "vTableSizes does not exist. SQL complexity collection will continue."
                )
                return ([], [], [])
            elif self.extract_definitions:
                utils_ui.print_warning(
                    f"Skipping table statistics for database {database_name}; "
                    "the vTableSizes DMV does not exist."
                )
            else:
                # Ask for permission to create the view
                builtins.print("\r")  # Clear previous line
                confirmation = utils_ui.prompt_confirm(
                    f"Do you want to create the vTableSizes DMV in database '{database_name}' to obtain detailed table statistics? (y/n): "
                )
                if confirmation:
                    utils_ui.print_extracting(
                        f"Creating table statistics DMV in database {database_name}"
                    )
                    odbc_client.create_table_statistics_dmv()
                    collect_table_statistics = True
                    utils_ui.print_extraction_done(
                        f"Creating table statistics DMV in database {database_name}"
                    )
                else:
                    utils_ui.print_warning(
                        f"Skipping table statistics collection for database {database_name}"
                    )
                    return (
                        [],
                        [],
                        [],
                        SynapseSqlDefinitions(),
                        SynapseDefinitionSummary(),
                    )

        if collect_table_statistics:
            table_statistics = list(odbc_client.get_table_statistics(database_name))

        definitions = SynapseSqlDefinitions()
        definition_summary = SynapseDefinitionSummary()
        if self.extract_definitions:
            try:
                definitions, definition_summary = odbc_client.get_sql_definitions(
                    redaction_mode=self.definition_redaction,
                    schema_filter=self.definition_schema_filter,
                    max_definition_size=self.max_definition_size,
                )
                if definition_summary.extraction_status in ("partial", "unavailable"):
                    self.definition_extraction_issues.append(
                        f"{database_name}: {definition_summary.status_description}"
                    )
            except Exception as exc:
                definition_summary = SynapseDefinitionSummary(
                    extraction_status="unavailable",
                    status_description=f"Definition extraction failed: {exc}",
                )
                self.definition_extraction_issues.append(
                    f"{database_name}: definition extraction failed"
                )

        return (
            table_statistics,
            list(odbc_client.get_object_count(database_name)),
            list(odbc_client.get_code_lines_statistics(database_name)),
            definitions,
            definition_summary,
        )

    def _collect_sql_complexity(
        self,
        workspace_name: str,
        sql_pools: SynapseSqlPools,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> None:
        """Collect SQL complexity for every discovered database."""
        databases = [pool.database for pool in sql_pools.dedicated_pools] + list(
            sql_pools.serverless_pool.databases.databases
        )

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            reason = "SQL credentials were not provided"
            for database in databases:
                database.complexity = self.sql_complexity_scorer.unavailable_assessment(
                    reason
                )
            self.sql_complexity_issues.append(reason)
            utils_ui.print_warning(f"Skipping SQL complexity collection: {reason}.")
            return

        for database in databases:
            database.complexity = self._get_database_sql_complexity(
                workspace_name=workspace_name,
                database_name=database.name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            )
            summary = database.complexity.summary
            if summary.status == "unavailable":
                self.sql_complexity_issues.append(
                    f"{database.name}: {summary.errors[0]}"
                )
            elif summary.unavailable_definitions:
                self.sql_complexity_issues.append(
                    f"{database.name}: {summary.unavailable_definitions} definitions unavailable"
                )

    def _get_dedicated_pool_workload(
        self,
        workspace_name: str,
        pool: SynapseDedicatedPool,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ):
        """Collect request/session history and derive a workload profile."""
        collected_at = datetime.now(timezone.utc)
        redacted = not self.include_sql_text

        if self.skip_query_history:
            return unavailable_workload_profile(
                status="skipped",
                description="Workload collection was disabled by --skip-query-history.",
                window_days=self.query_history_days,
                top_n=self.query_history_top,
                sql_text_redacted=redacted,
                collected_at=collected_at,
            )

        if pool.name in self.paused_databases or pool.status.lower() == "paused":
            return unavailable_workload_profile(
                status="unavailable",
                description="The dedicated SQL pool is paused.",
                window_days=self.query_history_days,
                top_n=self.query_history_top,
                sql_text_redacted=redacted,
                collected_at=collected_at,
            )

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            utils_ui.print_warning(
                f"Skipping workload collection for '{pool.name}' - SQL authentication is not available."
            )
            return unavailable_workload_profile(
                status="skipped",
                description="SQL authentication was not available for workload collection.",
                window_days=self.query_history_days,
                top_n=self.query_history_top,
                sql_text_redacted=redacted,
                collected_at=collected_at,
            )

        try:
            odbc_client = self._create_odbc_client(
                workspace_name=workspace_name,
                database_name=pool.database.name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            )
            requests = odbc_client.get_query_history(
                history_days=self.query_history_days,
                top_n=self.query_history_top,
                include_sql_text=self.include_sql_text,
            )
            sessions = odbc_client.get_session_history(
                history_days=self.query_history_days,
                top_n=self.query_history_top,
            )
            return build_workload_profile(
                requests=requests,
                sessions=sessions,
                window_days=self.query_history_days,
                top_n=self.query_history_top,
                sql_text_redacted=redacted,
                collected_at=collected_at,
            )
        except Exception as exc:
            if not self._is_expected_workload_access_error(exc):
                raise
            description = (
                "Workload DMVs could not be queried. Verify CONNECT, "
                "VIEW DATABASE STATE, and DMV SELECT permissions."
            )
            utils_ui.print_warning(
                f"Workload collection unavailable for '{pool.name}': {exc}"
            )
            return unavailable_workload_profile(
                status="unavailable",
                description=description,
                window_days=self.query_history_days,
                top_n=self.query_history_top,
                sql_text_redacted=redacted,
                collected_at=collected_at,
            )

    @staticmethod
    def _is_expected_workload_access_error(exc: Exception) -> bool:
        """Identify database access/state failures that should degrade per pool."""
        message = str(exc).lower()
        expected_markers = (
            "permission",
            "denied",
            "forbidden",
            "not authorized",
            "login failed",
            "cannot open",
            "not accessible",
            "paused",
            "view database state",
            "dm_pdw_exec",
            "invalid object name",
            "connection",
            "timeout",
        )
        return isinstance(exc, (FATError, OSError, RuntimeError)) or any(
            marker in message for marker in expected_markers
        )

    def _collect_sql_complexity(
        self,
        workspace_name: str,
        sql_pools: SynapseSqlPools,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> None:
        """Collect SQL complexity for every discovered database."""
        databases = [pool.database for pool in sql_pools.dedicated_pools] + list(
            sql_pools.serverless_pool.databases.databases
        )

        if not self._has_sql_credentials(sql_admin_login, sql_admin_password):
            reason = "SQL credentials were not provided"
            for database in databases:
                database.complexity = self.sql_complexity_scorer.unavailable_assessment(
                    reason
                )
            self.sql_complexity_issues.append(reason)
            utils_ui.print_warning(f"Skipping SQL complexity collection: {reason}.")
            return

        for database in databases:
            database.complexity = self._get_database_sql_complexity(
                workspace_name=workspace_name,
                database_name=database.name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            )
            summary = database.complexity.summary
            if summary.status == "unavailable":
                self.sql_complexity_issues.append(
                    f"{database.name}: {summary.errors[0]}"
                )
            elif summary.unavailable_definitions:
                self.sql_complexity_issues.append(
                    f"{database.name}: {summary.unavailable_definitions} definitions unavailable"
                )

    def _get_database_sql_complexity(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> SqlComplexityAssessment:
        started_at = time.perf_counter()
        try:
            with self._create_odbc_client(
                workspace_name=workspace_name,
                database_name=database_name,
                sql_admin_login=sql_admin_login,
                sql_admin_password=sql_admin_password,
            ) as odbc_client:
                definitions = odbc_client.get_sql_code_objects(
                    self.sql_complexity_schemas
                )
            extraction_elapsed = time.perf_counter() - started_at
            return self.sql_complexity_scorer.score_database(
                definitions, elapsed_seconds=extraction_elapsed
            )
        except Exception as error:
            elapsed_seconds = time.perf_counter() - started_at
            reason = f"definition query failed: {error}"
            utils_ui.print_warning(
                f"SQL complexity collection failed for '{database_name}': {error}"
            )
            return self.sql_complexity_scorer.unavailable_assessment(
                reason, elapsed_seconds=elapsed_seconds
            )

    def _has_sql_credentials(
        self,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
    ) -> bool:
        """
        Check if SQL credentials are available for the current auth mode.

        For Entra ID authentication modes, credentials are considered available
        if the mode is properly configured. For SQL auth, both login and password
        must be provided.

        Args:
            sql_admin_login: SQL admin login (for SQL auth mode)
            sql_admin_password: SQL admin password (for SQL auth mode)

        Returns:
            True if credentials are available for the current auth mode
        """
        if self.sql_auth_mode in ("entra-interactive", "entra-default"):
            return True
        elif self.sql_auth_mode == "entra-spn":
            return bool(self.sql_client_id and self.sql_client_secret)
        else:  # sql mode
            return bool(sql_admin_login and sql_admin_password)

    def _get_sql_admin_credentials(
        self, workspace_name: str, sql_admin_login: Optional[str]
    ) -> Optional[str]:
        """
        Get SQL admin credentials, using stored password if available.

        For Entra ID authentication modes (entra-interactive, entra-spn, entra-default),
        this method returns a placeholder value since the actual authentication is handled
        by the mssql-python driver.

        Args:
            workspace_name: Name of the Synapse workspace
            sql_admin_login: SQL admin login name

        Returns:
            SQL admin password if provided, None otherwise
        """
        # If auth mode was explicitly set via CLI (not default "sql") or password provided, use it
        if self.sql_auth_mode in ("entra-interactive", "entra-default"):
            return "__entra_auth__"  # Placeholder to indicate credentials are available
        elif self.sql_auth_mode == "entra-spn":
            if self.sql_client_id and self.sql_client_secret:
                return "__entra_auth__"  # Placeholder
            else:
                utils_ui.print_warning(
                    "Entra ID Service Principal authentication requires --sql-client-id and --sql-client-secret"
                )
                return None

        # If password was provided via CLI, use SQL auth directly
        if self.sql_admin_password is not None:
            if not sql_admin_login:
                return None
            return self.sql_admin_password

        # Interactive mode - prompt user to choose authentication type
        utils_ui.print_fabric_assessment_tool(
            "NOTICE: This tool can collect table/view column metadata and detailed "
            "table statistics from Azure Synapse Analytics SQL endpoints."
        )
        utils_ui.print_fabric_assessment_tool(
            "For more information: "
            "https://learn.microsoft.com/en-us/azure/synapse-analytics/sql/develop-tables-overview#table-size-queries"
        )

        # Prompt for authentication type
        auth_choices = [
            "Skip - Do not collect SQL metadata or dedicated pool statistics",
            "SQL Authentication - Use SQL admin username and password",
            "Entra ID Interactive - Browser login with MFA support",
            "Entra ID Default - Use Azure CLI credentials or managed identity",
        ]

        selected_auth = utils_ui.prompt_select_item(
            f"How would you like to authenticate to dedicated SQL pools in '{workspace_name}'?",
            auth_choices,
        )

        if selected_auth is None or selected_auth.startswith("Skip"):
            return None

        elif selected_auth.startswith("SQL Authentication"):
            if not sql_admin_login:
                utils_ui.print_warning(
                    "SQL admin login not available for this workspace."
                )
                return None
            sql_admin_password = utils_ui.prompt_password(
                f"Enter SQL admin (login: {sql_admin_login}) password: "
            )
            return sql_admin_password

        elif selected_auth.startswith("Entra ID Interactive"):
            self.sql_auth_mode = "entra-interactive"
            return "__entra_auth__"

        elif selected_auth.startswith("Entra ID Default"):
            self.sql_auth_mode = "entra-default"
            return "__entra_auth__"

        return None

    def _create_odbc_client(
        self,
        workspace_name: str,
        database_name: str,
        sql_admin_login: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
        auth_mode: Optional[SqlAuthMode] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        tenant_id: Optional[str] = None,
        endpoint_kind: EndpointKind = "dedicated",
        server_host: Optional[str] = None,
    ) -> OdbcClient:
        """Create an OdbcClient with the appropriate authentication parameters."""
        return OdbcClient(
            workspace_name=workspace_name,
            database=database_name,
            username=sql_admin_login,
            password=sql_admin_password,
            auth_mode=cast(SqlAuthMode, auth_mode or self.sql_auth_mode),
            client_id=client_id or self.sql_client_id,
            client_secret=client_secret or self.sql_client_secret,
            tenant_id=tenant_id or self.sql_tenant_id,
            endpoint_kind=cast(EndpointKind, endpoint_kind),
            server_host=server_host,
        )

    def _resolve_serverless_sql_settings(
        self,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> Dict[str, Optional[str]]:
        """Resolve serverless SQL settings using override-then-inherit precedence."""
        auth_mode = self.serverless_sql_auth_mode or self.sql_auth_mode
        username = self.serverless_sql_username or sql_admin_login
        password = (
            self.serverless_sql_password
            if self.serverless_sql_password is not None
            else sql_admin_password
        )

        if auth_mode == "sql" and password == "__entra_auth__":
            password = None

        return {
            "auth_mode": auth_mode,
            "username": username,
            "password": password,
            "client_id": self.serverless_sql_client_id or self.sql_client_id,
            "client_secret": self.serverless_sql_client_secret
            or self.sql_client_secret,
            "tenant_id": self.serverless_sql_tenant_id or self.sql_tenant_id,
        }

    def _collect_serverless_activity(
        self,
        workspace_name: str,
        sql_admin_login: Optional[str],
        sql_admin_password: Optional[str],
    ) -> SynapseServerlessActivity:
        """Collect serverless SQL activity using inherited or overridden SQL settings."""
        serverless_settings = self._resolve_serverless_sql_settings(
            sql_admin_login, sql_admin_password
        )

        try:
            odbc_client = self._create_odbc_client(
                workspace_name=workspace_name,
                database_name="master",
                sql_admin_login=serverless_settings.get("username"),
                sql_admin_password=serverless_settings.get("password"),
                auth_mode=cast(
                    Optional[SqlAuthMode], serverless_settings.get("auth_mode")
                ),
                client_id=serverless_settings.get("client_id"),
                client_secret=serverless_settings.get("client_secret"),
                tenant_id=serverless_settings.get("tenant_id"),
                endpoint_kind="serverless",
            )
            try:
                return odbc_client.collect_serverless_activity(
                    history_days=self.serverless_history_days,
                    top_n=self.serverless_top_n,
                )
            finally:
                odbc_client.close()
        except ServerlessActivityExpectedError:
            raise
        except ValueError as exc:
            raise ServerlessActivityExpectedError("configuration", str(exc)) from exc

    def _build_skipped_serverless_activity(self) -> SynapseServerlessActivity:
        """Build skipped activity metadata without opening a serverless connection."""
        return SynapseServerlessActivity(
            metadata=SynapseServerlessActivityCollectionMetadata(
                status="skipped",
                attempted=False,
                history_days=self.serverless_history_days,
                top_n=self.serverless_top_n,
                requested_sources=[
                    "sys.dm_exec_requests_history",
                    "queryinsights.exec_requests_history",
                    "queryinsights.long_running_queries",
                    "queryinsights.frequently_run_queries",
                ],
                collected_at=self._get_timestamp(),
            ),
            performance_summary=SynapseServerlessPerformanceSummary(),
        )

    def _build_unavailable_serverless_activity(
        self, warning: Optional[str]
    ) -> SynapseServerlessActivity:
        """Build unavailable activity metadata for expected serverless failures."""
        warnings = [warning] if warning else []
        diagnostics = []
        if warning:
            diagnostics.append(
                SynapseServerlessActivitySourceDiagnostic(
                    source_name="serverless_activity",
                    status="unavailable",
                    message=warning,
                )
            )

        return SynapseServerlessActivity(
            metadata=SynapseServerlessActivityCollectionMetadata(
                status="unavailable",
                attempted=True,
                history_days=self.serverless_history_days,
                top_n=self.serverless_top_n,
                requested_sources=[
                    "sys.dm_exec_requests_history",
                    "queryinsights.exec_requests_history",
                    "queryinsights.long_running_queries",
                    "queryinsights.frequently_run_queries",
                ],
                collected_at=self._get_timestamp(),
                warnings=warnings,
                source_diagnostics=diagnostics,
            ),
            performance_summary=SynapseServerlessPerformanceSummary(),
        )

    def _count_queries_last_24h(
        self, activity: SynapseServerlessActivity
    ) -> Optional[int]:
        """Derive queries_last_24h from collected serverless activity."""
        if activity.metadata.status == "skipped":
            return None
        if activity.metadata.status == "unavailable" and not activity.queries:
            return None
        if activity.performance_summary.queries_last_24h is not None:
            return activity.performance_summary.queries_last_24h

        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
        query_count = 0
        for query in activity.queries:
            start_time = query.start_time
            if not start_time:
                continue
            try:
                parsed = (
                    datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                    if start_time.endswith("Z")
                    else datetime.fromisoformat(start_time)
                )
                if parsed.tzinfo is not None:
                    parsed = parsed.replace(tzinfo=None)
            except ValueError:
                continue
            if parsed >= cutoff:
                query_count += 1
        return query_count

    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime

        return datetime.now().isoformat()

    def _extract_spark_configurations(
        self,
        spark_pools: SynapseSparkPools,
        notebooks: SynapseNotebooks,
        spark_job_definitions: SynapseSparkJobDefinitions,
    ) -> SynapseSparkConfigurations:
        """Extract Spark Configurations from spark pools and count references.

        Spark configurations are defined in spark pools via sparkConfigProperties.
        They can be referenced by notebooks and spark job definitions via
        targetSparkConfiguration.

        Args:
            spark_pools: Collection of spark pools
            notebooks: Collection of notebooks
            spark_job_definitions: Collection of spark job definitions

        Returns:
            SynapseSparkConfigurations containing all configurations with ref counts
        """
        # Track configurations by name
        configs: Dict[str, Dict] = {}

        # Extract configurations from spark pools
        for pool in spark_pools.spark_pools:
            pool_json = pool.json_response or {}
            props = pool_json.get("properties", {})
            spark_config_props = props.get("sparkConfigProperties")

            if spark_config_props and isinstance(spark_config_props, dict):
                config_type = spark_config_props.get("configurationType")
                if config_type == "Artifact":
                    content_str = spark_config_props.get("content", "{}")
                    try:
                        content = json.loads(content_str)
                        config_name = content.get("name", "")
                        if config_name:
                            config_props = content.get("properties", {})
                            configs[config_name] = {
                                "name": config_name,
                                "description": config_props.get("description", ""),
                                "configs": config_props.get("configs", {}),
                                "created": config_props.get("created", ""),
                                "created_by": config_props.get("createdBy", ""),
                                "source_pool": pool.name,
                                "notebook_refs": 0,
                                "sjd_refs": 0,
                                "json_response": content,
                            }
                    except (json.JSONDecodeError, TypeError):
                        pass

        # Count references from notebooks
        for notebook in notebooks.notebooks:
            nb_json = notebook.json_response or {}
            props = nb_json.get("properties", {})
            target_config = props.get("targetSparkConfiguration")

            if target_config and isinstance(target_config, dict):
                config_name = target_config.get("referenceName", "")
                if config_name:
                    if config_name not in configs:
                        # Config referenced but not found in pools
                        configs[config_name] = {
                            "name": config_name,
                            "description": "",
                            "configs": {},
                            "created": "",
                            "created_by": "",
                            "source_pool": "",
                            "notebook_refs": 0,
                            "sjd_refs": 0,
                            "json_response": {},
                        }
                    configs[config_name]["notebook_refs"] += 1

        # Count references from spark job definitions
        for sjd in spark_job_definitions.spark_job_definitions:
            sjd_json = sjd.json_response or {}
            props = sjd_json.get("properties", {})
            target_config = props.get("targetSparkConfiguration")

            if target_config and isinstance(target_config, dict):
                config_name = target_config.get("referenceName", "")
                if config_name:
                    if config_name not in configs:
                        # Config referenced but not found in pools
                        configs[config_name] = {
                            "name": config_name,
                            "description": "",
                            "configs": {},
                            "created": "",
                            "created_by": "",
                            "source_pool": "",
                            "notebook_refs": 0,
                            "sjd_refs": 0,
                            "json_response": {},
                        }
                    configs[config_name]["sjd_refs"] += 1

        # Create SynapseSparkConfiguration objects
        spark_configurations = [
            SynapseSparkConfiguration(
                name=cfg["name"],
                description=cfg["description"],
                configs=cfg["configs"],
                created=cfg["created"],
                created_by=cfg["created_by"],
                source_pool=cfg["source_pool"],
                notebook_refs=cfg["notebook_refs"],
                sjd_refs=cfg["sjd_refs"],
                json_response=cfg["json_response"],
            )
            for cfg in configs.values()
        ]

        return SynapseSparkConfigurations(spark_configurations=spark_configurations)
