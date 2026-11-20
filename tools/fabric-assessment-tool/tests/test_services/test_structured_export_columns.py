import json
from pathlib import Path

from fabric_assessment_tool.assessment.common import AssessmentStatus
from fabric_assessment_tool.assessment.synapse import (
    SynapseAssessment,
    SynapseAssessmentMetadata,
    SynapseColumn,
    SynapseColumnDatabaseStatus,
    SynapseColumnSummary,
    SynapseCompatibilityTotals,
    SynapseDataflows,
    SynapseDatasets,
    SynapseDedicatedDatabase,
    SynapseDedicatedPool,
    SynapseIntegrationRuntimes,
    SynapseLibraries,
    SynapseLinkedServices,
    SynapseManagedPrivateEndpoints,
    SynapseNotebooks,
    SynapsePipelines,
    SynapseSchema,
    SynapseSchemas,
    SynapseServerlessDatabases,
    SynapseServerlessPool,
    SynapseSparkConfigurations,
    SynapseSparkJobDefinitions,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlScripts,
    SynapseTable,
    SynapseTables,
    SynapseView,
    SynapseViews,
    SynapseWorkspaceInfo,
)
from fabric_assessment_tool.services.structured_export_service import (
    StructuredExportService,
)


def _assessment():
    column = SynapseColumn(
        name="id",
        ordinal_position=1,
        data_type="int",
        is_nullable=False,
        character_maximum_length=None,
        numeric_precision=10,
        numeric_scale=0,
        datetime_precision=None,
        column_default=None,
        character_set_name=None,
        collation_name=None,
        compatibility="compatible",
        compatibility_note="Directly supported.",
        json_response={"column_name": "id"},
    )
    schema = SynapseSchema(
        name="dbo",
        database="warehouse",
        tables=SynapseTables(
            tables=[
                SynapseTable(
                    name="table_one",
                    database="warehouse",
                    schema="dbo",
                    statistics=None,
                    json_response={},
                    columns=[column],
                )
            ]
        ),
        views=SynapseViews(
            views=[
                SynapseView(
                    name="view_one",
                    database="warehouse",
                    schema="dbo",
                    json_response={},
                    columns=[column],
                )
            ]
        ),
        json_response={},
    )
    database = SynapseDedicatedDatabase(
        name="warehouse",
        schemas=SynapseSchemas(schemas=[schema]),
        json_response={},
    )
    summary = SynapseColumnSummary(
        collection_status="completed",
        generated_at="2026-01-01T00:00:00",
        configured_max_column_objects=None,
        wide_object_threshold=100,
        total_objects_considered=2,
        total_objects_collected=2,
        total_columns=2,
        nullable_columns=0,
        compatibility_totals=SynapseCompatibilityTotals(compatible=2),
        database_statuses=[
            SynapseColumnDatabaseStatus(
                database="warehouse",
                database_type="dedicated",
                status="collected",
                objects_considered=2,
                objects_collected=2,
                columns_collected=2,
            )
        ],
    )
    return SynapseAssessment(
        status=AssessmentStatus(status="completed"),
        workspace_info=SynapseWorkspaceInfo(
            id="id",
            name="workspace",
            resource_group="rg",
            location="region",
            status="Online",
            endpoints={},
            json_response={},
        ),
        sql_pools=SynapseSqlPools(
            dedicated_pools=[
                SynapseDedicatedPool(
                    name="warehouse",
                    status="Online",
                    sku="DW100c",
                    database=database,
                    tables_count=1,
                    size_gb=0,
                    code_lines=[],
                    code_objects=[],
                    json_response={},
                )
            ],
            serverless_pool=SynapseServerlessPool(
                name="Built-in",
                status="Online",
                queries_last_24h=0,
                databases=SynapseServerlessDatabases(databases=[]),
                json_response={},
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
            mode="full", timestamp="2026-01-01T00:00:00"
        ),
        column_summary=summary,
    )


def test_json_export_writes_columns_and_column_summary(tmp_path):
    result = StructuredExportService().export_assessment(
        assessment_data=_assessment(),
        workspace_name="workspace",
        output_path=str(tmp_path),
        format="json",
    )

    workspace = Path(tmp_path) / "workspace"
    column_summary_path = workspace / "column_summary.json"
    summary_path = workspace / "summary.json"
    table_path = (
        workspace
        / "data"
        / "dedicated_databases"
        / "databases"
        / "warehouse"
        / "schemas"
        / "dbo"
        / "tables"
        / "table_one.json"
    )
    view_path = table_path.parent.parent / "views" / "view_one.json"
    assert column_summary_path.exists()
    assert str(column_summary_path) in result["files_created"]
    assert result["total_files"] == len(result["files_created"])
    assert (
        workspace / "resources" / "sql_pools" / "serverless_pool_Built-in.json"
    ).exists()

    with open(column_summary_path, encoding="utf-8") as file:
        summary = json.load(file)
    assert summary["total_columns"] == 2
    assert summary["collection_status"] == "completed"
    with open(summary_path, encoding="utf-8") as file:
        workspace_summary = json.load(file)
    assert workspace_summary["data_warehouse"]["columns"]["total_columns"] == 2
    assert (
        workspace_summary["data_warehouse"]["columns"]["collection_status"]
        == "completed"
    )

    with open(table_path, encoding="utf-8") as file:
        table = json.load(file)
    with open(view_path, encoding="utf-8") as file:
        view = json.load(file)
    assert table["data"]["columns"][0]["name"] == "id"
    assert view["data"]["columns"][0]["compatibility"] == "compatible"
