"""Tests for structured export of Synapse serverless activity."""

import json

from fabric_assessment_tool.assessment.common import AssessmentStatus
from fabric_assessment_tool.assessment.synapse import (
    SynapseAssessment,
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
    SynapseServerlessDatabaseSummary,
    SynapseServerlessDatabases,
    SynapseServerlessDailyDatabaseUsage,
    SynapseServerlessPerformanceSummary,
    SynapseServerlessPool,
    SynapseServerlessQueryActivity,
    SynapseServerlessTopQueryMetric,
    SynapseSparkConfigurations,
    SynapseSparkJobDefinitions,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlScripts,
    SynapseWorkspaceInfo,
)
from fabric_assessment_tool.services.structured_export_service import (
    StructuredExportService,
)


def _build_serverless_activity() -> SynapseServerlessActivity:
    query = SynapseServerlessQueryActivity(
        source_name="sys.dm_exec_requests_history",
        request_id="req-1",
        database_name="serverless_db",
        principal_name="user@contoso.com",
        status="Succeeded",
        start_time="2024-01-15T09:00:00",
        end_time="2024-01-15T09:00:01",
        elapsed_time_ms=1000,
        processed_bytes=1048576,
        query_text="SELECT TOP 1 * FROM sensitive_view",
    )

    top_metric = SynapseServerlessTopQueryMetric(
        source_name=query.source_name,
        request_id=query.request_id,
        database_name=query.database_name,
        principal_name=query.principal_name,
        status=query.status,
        start_time=query.start_time,
        end_time=query.end_time,
        elapsed_time_ms=query.elapsed_time_ms,
        processed_bytes=query.processed_bytes,
    )

    return SynapseServerlessActivity(
        metadata=SynapseServerlessActivityCollectionMetadata(
            status="completed",
            attempted=True,
            history_days=30,
            top_n=1000,
            requested_sources=["sys.dm_exec_requests_history"],
            available_sources=["sys.dm_exec_requests_history"],
            detailed_sources_used=["sys.dm_exec_requests_history"],
            collected_at="2024-01-15T10:00:00",
        ),
        queries=[query],
        daily_database_usage=[
            SynapseServerlessDailyDatabaseUsage(
                date="2024-01-15",
                database_name="serverless_db",
                query_count=1,
                processed_bytes=1048576,
                total_elapsed_time_ms=1000,
                average_elapsed_time_ms=1000.0,
            )
        ],
        database_summaries=[
            SynapseServerlessDatabaseSummary(
                database_name="serverless_db",
                query_count=1,
                processed_bytes=1048576,
                average_elapsed_time_ms=1000.0,
                max_elapsed_time_ms=1000,
                success_count=1,
                failure_count=0,
                cancelled_count=0,
            )
        ],
        performance_summary=SynapseServerlessPerformanceSummary(
            total_queries=1,
            total_processed_bytes=1048576,
            total_elapsed_time_ms=1000,
            average_elapsed_time_ms=1000.0,
            max_elapsed_time_ms=1000,
            success_count=1,
            failure_count=0,
            cancelled_count=0,
            collection_window_start="2023-12-16T00:00:00",
            collection_window_end="2024-01-15T10:00:00",
            top_slowest_queries=[top_metric],
            top_largest_queries=[top_metric],
        ),
    )


def _build_synapse_assessment() -> SynapseAssessment:
    return SynapseAssessment(
        status=AssessmentStatus(status="completed"),
        workspace_info=SynapseWorkspaceInfo(
            id="/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Synapse/workspaces/ws",
            name="ws",
            resource_group="rg",
            location="eastus",
            status="Online",
            endpoints={"dev": "https://ws.dev.azuresynapse.net"},
            json_response={"properties": {"sqlAdministratorLogin": "sqladmin"}},
        ),
        sql_pools=SynapseSqlPools(
            dedicated_pools=[],
            serverless_pool=SynapseServerlessPool(
                name="Built-in",
                status="Online",
                queries_last_24h=1,
                databases=SynapseServerlessDatabases(databases=[]),
                json_response=None,
                activity=_build_serverless_activity(),
            ),
        ),
        spark_pools=SynapseSparkPools(spark_pools=[]),
        pipelines=SynapsePipelines(pipelines=[]),
        dataflows=SynapseDataflows(dataflows=[]),
        notebooks=SynapseNotebooks(notebooks=[]),
        spark_job_definitions=SynapseSparkJobDefinitions(spark_job_definitions=[]),
        sql_scripts=SynapseSqlScripts(sql_scripts=[]),
        integration_runtimes=SynapseIntegrationRuntimes(integration_runtimes=[]),
        linked_services=SynapseLinkedServices(linked_services=[]),
        datasets=SynapseDatasets(datasets=[]),
        managed_private_endpoints=SynapseManagedPrivateEndpoints(
            managed_private_endpoints=[]
        ),
        libraries=SynapseLibraries(libraries=[]),
        spark_configurations=SynapseSparkConfigurations(spark_configurations=[]),
        assessment_metadata=SynapseAssessmentMetadata(
            mode="full", timestamp="2024-01-15T10:00:00"
        ),
        subscription_id="sub",
        resource_group="rg",
    )


def test_export_assessment_exports_singular_serverless_pool_with_activity(tmp_path):
    """Serverless pool export should use the singular field and preserve nested activity."""
    service = StructuredExportService()
    assessment = _build_synapse_assessment()

    result = service.export_assessment(
        assessment_data=assessment,
        workspace_name="ws",
        output_path=str(tmp_path),
        format="json",
    )

    pool_file = (
        tmp_path / "ws" / "resources" / "sql_pools" / "serverless_pool_Built-in.json"
    )

    assert pool_file.exists()
    exported = json.loads(pool_file.read_text(encoding="utf-8"))
    assert exported["type"] == "serverless_pool"
    assert exported["pool_data"]["activity"]["metadata"]["status"] == "completed"
    assert (
        exported["pool_data"]["activity"]["queries"][0]["query_text"]
        == "SELECT TOP 1 * FROM sensitive_view"
    )
    assert str(pool_file) in result["files_created"]
