import builtins
from argparse import Namespace
from typing import Optional

from fabric_assessment_tool.errors.api import FATError

from ..assessment.common import AssessmentStatus
from ..assessment.synapse import (
    CodeObjectCount,
    CodeObjectLines,
    SynapseAssessment,
    SynapseAssessmentMetadata,
    SynapseDataflow,
    SynapseDataflows,
    SynapseDataset,
    SynapseDatasets,
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
    SynapseSparkJobDefinition,
    SynapseSparkJobDefinitions,
    SynapseSparkPool,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlScript,
    SynapseSqlScripts,
    SynapseTable,
    SynapseTables,
    SynapseView,
    SynapseViews,
    SynapseWorkspaceInfo,
    TableStatistics,
)
from ..utils import ui as utils_ui
from .api_client import ApiClient
from .odbc_client import OdbcClient
from .token_provider import TokenProvider, create_token_provider


class SynapseClient:
    """Client for Azure Synapse Analytics APIs."""

    def __init__(
        self,
        subscription_id: Optional[str] = None,
        token_provider: Optional[TokenProvider] = None,
        auth_method: Optional[str] = None,
        sql_admin_password: Optional[str] = None,
        create_dmv: bool = False,
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
        """
        self.token_provider = token_provider or create_token_provider(auth_method)
        self.custom_subscription_id = subscription_id
        self.sql_admin_password = sql_admin_password
        self.create_dmv = create_dmv
        self.authenticate()
        self._workspace_cache: dict[str, SynapseWorkspaceInfo] = {}
        self.dev_endpoint_permission_issues = False
        self.unreached_components = []
        self.paused_databases = []

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

            # Get table statistics using SQL admin credentials if provided
            if sql_admin_login and sql_admin_password:
                utils_ui.print_extracting("Table Statistics")
                for pool in sql_pools.dedicated_pools:
                    # Get dedicated databases table statistics - odbc client
                    db = pool.database
                    table_statistics, code_object_count, code_object_lines = (
                        self._get_dedicated_database_statistics(
                            workspace_name,
                            db.name,
                            sql_admin_login,
                            sql_admin_password,
                        )
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
                utils_ui.print_extraction_done("Table Statistics")

            else:
                utils_ui.print_warning(
                    "Skipping dedicated SQL databases table statistics collection."
                )

            # Create assessment metadata
            assessment_metadata = SynapseAssessmentMetadata(
                mode=mode, timestamp=self._get_timestamp()
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
                assessment_metadata=assessment_metadata,
                subscription_id=self.subscription_id,
                resource_group=workspace_info.resource_group,
            )

        except Exception as e:
            raise Exception(f"Failed to assess workspace {workspace_name}: {e}")

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

        serverless_pool = SynapseServerlessPool(
            name="Built-in",
            status="Online",
            databases=self._get_serverless_databases(workspace_name),
            queries_last_24h=0,
            json_response=None,
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
                    last_run="",  # TODO
                    activities_count=0,  # TODO
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

        if not sql_admin_login or not sql_admin_password:
            utils_ui.print_warning(
                f"Skipping schema listing for '{database_name}' - SQL credentials not provided."
            )
            return SynapseSchemas(schemas=[])

        try:
            odbc_client = OdbcClient(
                workspace_name=workspace_name,
                database=database_name,
                username=sql_admin_login,
                password=sql_admin_password,
            )

            schema_names = odbc_client.get_schemas()

            schemas = [
                SynapseSchema(
                    name=schema_name,
                    database=database_name,
                    tables=self._get_dedicated_schema_tables(
                        workspace_name,
                        database_name,
                        schema_name,
                        sql_admin_login,
                        sql_admin_password,
                    ),
                    views=SynapseViews(views=[]),
                    json_response={"name": schema_name},
                )
                for schema_name in schema_names
            ]

            return SynapseSchemas(schemas=schemas)

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
            workspace_name, database_name, schema_name,
            sql_admin_login, sql_admin_password,
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

        if not sql_admin_login or not sql_admin_password:
            return SynapseTables(tables=[])

        try:
            odbc_client = OdbcClient(
                workspace_name=workspace_name,
                database=database_name,
                username=sql_admin_login,
                password=sql_admin_password,
            )

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
        self, workspace_name: str, database_name: str, sql_user: str, sql_password: str
    ) -> tuple[list[TableStatistics], list[CodeObjectCount], list[CodeObjectLines]]:
        """Get table statistics from a database."""

        odbc_client = OdbcClient(
            workspace_name=workspace_name,
            database=database_name,
            username=sql_user,
            password=sql_password,
        )

        if not odbc_client.check_table_statistics_dmv_exists():
            if self.create_dmv:
                # Auto-create DMV in non-interactive mode
                utils_ui.print_extracting(
                    f"Creating table statistics DMV in database {database_name}"
                )
                odbc_client.create_table_statistics_dmv()
                utils_ui.print_extraction_done(
                    f"Creating table statistics DMV in database {database_name}"
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
                    utils_ui.print_extraction_done(
                        f"Creating table statistics DMV in database {database_name}"
                    )
                else:
                    utils_ui.print_warning(
                        f"Skipping table statistics collection for database {database_name}"
                    )
                    return ([], [], [])

        return (
            list(odbc_client.get_table_statistics(database_name)),
            list(odbc_client.get_object_count(database_name)),
            list(odbc_client.get_code_lines_statistics(database_name)),
        )

    def _get_sql_admin_credentials(
        self, workspace_name: str, sql_admin_login: Optional[str]
    ) -> Optional[str]:
        """
        Get SQL admin credentials, using stored password if available.

        Args:
            workspace_name: Name of the Synapse workspace
            sql_admin_login: SQL admin login name

        Returns:
            SQL admin password if provided, None otherwise
        """
        if not sql_admin_login:
            return None

        # Use stored password if provided (non-interactive mode)
        if self.sql_admin_password is not None:
            return self.sql_admin_password

        # Display disclaimer about DMV usage
        utils_ui.print_fabric_assessment_tool(
            "NOTICE: This tool leverages the use of DMVs (Dynamic Management Views) and "
            "SQL admin credentials to obtain detailed table statistics from Azure Synapse "
            "Analytics dedicated SQL pools."
        )
        utils_ui.print_fabric_assessment_tool(
            "For more information about table size queries in Azure Synapse Analytics, "
            "please refer to the documentation at: "
            "https://learn.microsoft.com/en-us/azure/synapse-analytics/sql/develop-tables-overview#table-size-queries"
        )

        # Ask for sql admin password to get table statistics
        sql_admin_password = utils_ui.prompt_password(
            f"Enter SQL admin (login: {sql_admin_login}) password for workspace '{workspace_name}' or leave empty to skip: "
        )

        return sql_admin_password

    def _get_timestamp(self) -> str:
        """Get current timestamp."""
        from datetime import datetime

        return datetime.now().isoformat()
