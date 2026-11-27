"""Tests for SynapseClient serverless activity behavior."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from fabric_assessment_tool.assessment.common import AssessmentStatus
from fabric_assessment_tool.assessment.synapse import (
    SynapseAssessmentMetadata,
    SynapseDataflows,
    SynapseDatasets,
    SynapseIntegrationRuntimes,
    SynapseLibraries,
    SynapseLinkedServices,
    SynapseManagedPrivateEndpoints,
    SynapseNotebooks,
    SynapsePipelines,
    SynapseServerlessActivity,
    SynapseServerlessActivityCollectionMetadata,
    SynapseServerlessDatabases,
    SynapseServerlessPerformanceSummary,
    SynapseServerlessPool,
    SynapseServerlessQueryActivity,
    SynapseSparkConfigurations,
    SynapseSparkJobDefinitions,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlScripts,
    SynapseWorkspaceInfo,
)
from fabric_assessment_tool.clients.odbc_client import ServerlessActivityExpectedError
from fabric_assessment_tool.clients.synapse_client import SynapseClient


class FakeTokenProvider:
    """Simple token provider stub for unit tests."""

    def get_subscription_id(self):
        return "sub"

    def get_token(self, scope):
        return f"token-for-{scope}"


def _build_workspace_info() -> SynapseWorkspaceInfo:
    return SynapseWorkspaceInfo(
        id="/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Synapse/workspaces/ws",
        name="ws",
        resource_group="rg",
        location="eastus",
        status="Online",
        endpoints={"dev": "https://ws.dev.azuresynapse.net"},
        json_response={"properties": {"sqlAdministratorLogin": "sqladmin"}},
    )


def _build_serverless_activity(
    status: str = "completed",
    warnings=None,
    query_offsets_hours=None,
) -> SynapseServerlessActivity:
    warnings = warnings or []
    query_offsets_hours = query_offsets_hours or []

    queries = []
    for index, offset in enumerate(query_offsets_hours, start=1):
        start_time = (
            datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=offset)
        ).isoformat()
        elapsed = 1000 * index
        processed = 1048576 * index
        queries.append(
            SynapseServerlessQueryActivity(
                source_name="sys.dm_exec_requests_history",
                request_id=f"req-{index}",
                database_name="serverless_db",
                principal_name="user@contoso.com",
                status="Succeeded" if index % 2 else "Failed",
                start_time=start_time,
                end_time=start_time,
                elapsed_time_ms=elapsed,
                processed_bytes=processed,
                query_text=f"SELECT {index}",
            )
        )

    total_queries = len(queries)
    total_elapsed = sum(query.elapsed_time_ms or 0 for query in queries)
    total_processed = sum(query.processed_bytes or 0 for query in queries)

    return SynapseServerlessActivity(
        metadata=SynapseServerlessActivityCollectionMetadata(
            status=status,
            attempted=status != "skipped",
            history_days=30,
            top_n=1000,
            requested_sources=["sys.dm_exec_requests_history"],
            available_sources=(
                ["sys.dm_exec_requests_history"] if status != "unavailable" else []
            ),
            detailed_sources_used=(
                ["sys.dm_exec_requests_history"]
                if status in ("completed", "partial")
                else []
            ),
            collected_at="2024-01-15T10:00:00",
            warnings=warnings,
        ),
        queries=queries,
        performance_summary=SynapseServerlessPerformanceSummary(
            total_queries=total_queries,
            total_processed_bytes=total_processed,
            total_elapsed_time_ms=total_elapsed,
            average_elapsed_time_ms=(
                total_elapsed / total_queries if total_queries else 0
            ),
            max_elapsed_time_ms=max(
                (query.elapsed_time_ms or 0 for query in queries), default=0
            ),
            success_count=sum(1 for query in queries if query.status == "Succeeded"),
            failure_count=sum(1 for query in queries if query.status == "Failed"),
        ),
    )


def _build_sql_pools(activity: SynapseServerlessActivity) -> SynapseSqlPools:
    return SynapseSqlPools(
        dedicated_pools=[],
        serverless_pool=SynapseServerlessPool(
            name="Built-in",
            status="Online",
            queries_last_24h=None,
            databases=SynapseServerlessDatabases(databases=[]),
            json_response=None,
            activity=activity,
        ),
    )


def _build_client(**kwargs) -> SynapseClient:
    return SynapseClient(token_provider=FakeTokenProvider(), **kwargs)


def _patch_assessment_methods(
    monkeypatch, client: SynapseClient, sql_pools: SynapseSqlPools
):
    workspace_info = _build_workspace_info()
    monkeypatch.setattr(
        client, "_get_workspace_info", lambda workspace_name: workspace_info
    )
    monkeypatch.setattr(client, "_get_synapse_clients", lambda endpoints: {})
    monkeypatch.setattr(
        client,
        "_get_sql_admin_credentials",
        lambda workspace_name, sql_admin_login: "secret123",
    )
    monkeypatch.setattr(
        client,
        "_get_sql_pools",
        lambda workspace_name, sql_admin_login, sql_admin_password: sql_pools,
    )
    monkeypatch.setattr(
        client,
        "_get_spark_pools",
        lambda workspace_name: SynapseSparkPools(spark_pools=[]),
    )
    monkeypatch.setattr(
        client, "_get_pipelines", lambda workspace_name: SynapsePipelines(pipelines=[])
    )
    monkeypatch.setattr(
        client, "_get_dataflows", lambda workspace_name: SynapseDataflows(dataflows=[])
    )
    monkeypatch.setattr(
        client, "_get_notebooks", lambda workspace_name: SynapseNotebooks(notebooks=[])
    )
    monkeypatch.setattr(
        client,
        "_get_sparkjobdefinitions",
        lambda workspace_name: SynapseSparkJobDefinitions(spark_job_definitions=[]),
    )
    monkeypatch.setattr(
        client,
        "_get_sql_scripts",
        lambda workspace_name: SynapseSqlScripts(sql_scripts=[]),
    )
    monkeypatch.setattr(
        client,
        "_get_integration_runtimes",
        lambda workspace_name: SynapseIntegrationRuntimes(integration_runtimes=[]),
    )
    monkeypatch.setattr(
        client,
        "_get_linked_services",
        lambda workspace_name: SynapseLinkedServices(linked_services=[]),
    )
    monkeypatch.setattr(
        client, "_get_datasets", lambda workspace_name: SynapseDatasets(datasets=[])
    )
    monkeypatch.setattr(
        client,
        "_get_managed_private_endpoints",
        lambda workspace_name: SynapseManagedPrivateEndpoints(
            managed_private_endpoints=[]
        ),
    )
    monkeypatch.setattr(
        client, "_get_libraries", lambda workspace_name: SynapseLibraries(libraries=[])
    )
    monkeypatch.setattr(
        client,
        "_extract_spark_configurations",
        lambda spark_pools, notebooks, spark_job_definitions: SynapseSparkConfigurations(
            spark_configurations=[]
        ),
    )
    monkeypatch.setattr(client, "_has_sql_credentials", lambda *args, **kwargs: False)


def test_get_sql_pools_collects_serverless_activity_and_derives_queries_last_24h(
    monkeypatch,
):
    """Serverless query counts should be derived from collected detailed activity."""
    client = _build_client()
    client.synapse_clients = {
        "dev": MagicMock(
            do_request=MagicMock(
                return_value=MagicMock(json=MagicMock(return_value={"value": []}))
            )
        )
    }
    monkeypatch.setattr(
        client, "_get_workspace_info", lambda workspace_name: _build_workspace_info()
    )
    monkeypatch.setattr(
        client,
        "_get_serverless_databases",
        lambda workspace_name: SynapseServerlessDatabases(databases=[]),
    )
    monkeypatch.setattr(
        client,
        "_collect_serverless_activity",
        lambda workspace_name, sql_admin_login, sql_admin_password: _build_serverless_activity(
            status="completed", query_offsets_hours=[1, 48]
        ),
    )

    sql_pools = client._get_sql_pools("ws", "sqladmin", "secret123")

    assert sql_pools.serverless_pool.activity.metadata.status == "completed"
    assert sql_pools.serverless_pool.queries_last_24h == 1


def test_get_sql_pools_marks_activity_unavailable_on_expected_error(monkeypatch):
    """Expected serverless failures should degrade to unavailable activity metadata."""
    client = _build_client()
    client.synapse_clients = {
        "dev": MagicMock(
            do_request=MagicMock(
                return_value=MagicMock(json=MagicMock(return_value={"value": []}))
            )
        )
    }
    monkeypatch.setattr(
        client, "_get_workspace_info", lambda workspace_name: _build_workspace_info()
    )
    monkeypatch.setattr(
        client,
        "_get_serverless_databases",
        lambda workspace_name: SynapseServerlessDatabases(databases=[]),
    )

    def raise_expected_error(*args, **kwargs):
        raise ServerlessActivityExpectedError("permission", "permission denied")

    monkeypatch.setattr(client, "_collect_serverless_activity", raise_expected_error)

    sql_pools = client._get_sql_pools("ws", "sqladmin", "secret123")

    assert sql_pools.serverless_pool.activity.metadata.status == "unavailable"
    assert sql_pools.serverless_pool.queries_last_24h is None
    assert (
        "permission denied" in sql_pools.serverless_pool.activity.metadata.warnings[0]
    )


def test_get_sql_pools_skips_serverless_activity_when_requested(monkeypatch):
    """Explicit skip should avoid collection attempts and not mark activity unavailable."""
    client = _build_client(skip_serverless_activity=True)
    client.synapse_clients = {
        "dev": MagicMock(
            do_request=MagicMock(
                return_value=MagicMock(json=MagicMock(return_value={"value": []}))
            )
        )
    }
    collect_mock = MagicMock()
    monkeypatch.setattr(
        client, "_get_workspace_info", lambda workspace_name: _build_workspace_info()
    )
    monkeypatch.setattr(
        client,
        "_get_serverless_databases",
        lambda workspace_name: SynapseServerlessDatabases(databases=[]),
    )
    monkeypatch.setattr(client, "_collect_serverless_activity", collect_mock)

    sql_pools = client._get_sql_pools("ws", "sqladmin", "secret123")

    collect_mock.assert_not_called()
    assert sql_pools.serverless_pool.activity.metadata.status == "skipped"
    assert sql_pools.serverless_pool.queries_last_24h is None


def test_resolve_serverless_sql_settings_inherits_and_overrides():
    """Serverless auth settings should inherit existing SQL settings and honor overrides."""
    inherited_client = _build_client(
        sql_auth_mode="entra-default",
        sql_client_id="base-client-id",
        sql_client_secret="base-client-secret",
        sql_tenant_id="base-tenant-id",
    )

    inherited = inherited_client._resolve_serverless_sql_settings(
        "sqladmin", "sqlpassword"
    )

    assert inherited["auth_mode"] == "entra-default"
    assert inherited["username"] == "sqladmin"
    assert inherited["password"] == "sqlpassword"
    assert inherited["client_id"] == "base-client-id"
    assert inherited["client_secret"] == "base-client-secret"
    assert inherited["tenant_id"] == "base-tenant-id"

    override_client = _build_client(
        sql_auth_mode="sql",
        sql_client_id="base-client-id",
        sql_client_secret="base-client-secret",
        sql_tenant_id="base-tenant-id",
        serverless_sql_auth_mode="entra-spn",
        serverless_sql_username="override-user",
        serverless_sql_password="override-password",
        serverless_sql_client_id="override-client-id",
        serverless_sql_client_secret="override-client-secret",
    )

    overridden = override_client._resolve_serverless_sql_settings(
        "sqladmin", "sqlpassword"
    )

    assert overridden["auth_mode"] == "entra-spn"
    assert overridden["username"] == "override-user"
    assert overridden["password"] == "override-password"
    assert overridden["client_id"] == "override-client-id"
    assert overridden["client_secret"] == "override-client-secret"
    assert overridden["tenant_id"] == "base-tenant-id"


def test_assess_workspace_marks_unavailable_serverless_activity_incomplete(monkeypatch):
    """Attempted-but-unavailable serverless activity should mark the workspace incomplete."""
    client = _build_client()
    sql_pools = _build_sql_pools(
        _build_serverless_activity(
            status="unavailable",
            warnings=["Serverless endpoint unavailable"],
            query_offsets_hours=[],
        )
    )
    _patch_assessment_methods(monkeypatch, client, sql_pools)

    assessment = client.assess_workspace("ws", "full")

    assert assessment.status.status == "incomplete"
    assert "serverless SQL activity was unavailable" in assessment.status.description


def test_assess_workspace_keeps_partial_serverless_activity_completed(monkeypatch):
    """Partial serverless activity should keep the workspace assessment completed."""
    client = _build_client()
    sql_pools = _build_sql_pools(
        _build_serverless_activity(
            status="partial",
            warnings=["queryinsights.exec_requests_history: permission denied"],
            query_offsets_hours=[1],
        )
    )
    _patch_assessment_methods(monkeypatch, client, sql_pools)

    assessment = client.assess_workspace("ws", "full")

    assert assessment.status.status == "completed"


def test_assess_workspace_keeps_skipped_serverless_activity_completed(monkeypatch):
    """Explicit skip should not make the workspace incomplete."""
    client = _build_client()
    sql_pools = _build_sql_pools(
        _build_serverless_activity(status="skipped", query_offsets_hours=[])
    )
    _patch_assessment_methods(monkeypatch, client, sql_pools)

    assessment = client.assess_workspace("ws", "full")

    assert assessment.status.status == "completed"
