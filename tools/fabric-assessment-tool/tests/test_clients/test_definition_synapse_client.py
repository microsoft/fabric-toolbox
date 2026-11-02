from unittest.mock import MagicMock, patch

from fabric_assessment_tool.assessment.synapse import (
    SynapseDefinitionSummary,
    SynapseSqlDefinitions,
)
from fabric_assessment_tool.clients.synapse_client import SynapseClient


def make_client(extract_definitions):
    client = SynapseClient.__new__(SynapseClient)
    client.create_dmv = False
    client.extract_definitions = extract_definitions
    client.definition_redaction = "hash"
    client.definition_schema_filter = ["dbo"]
    client.max_definition_size = 2048
    client.definition_extraction_issues = []
    client._create_odbc_client = MagicMock()
    return client


def configure_odbc(client):
    odbc = client._create_odbc_client.return_value
    odbc.check_table_statistics_dmv_exists.return_value = True
    odbc.get_table_statistics.return_value = []
    odbc.get_object_count.return_value = []
    odbc.get_code_lines_statistics.return_value = []
    return odbc


def test_definition_extraction_is_opt_in():
    client = make_client(False)
    odbc = configure_odbc(client)

    result = client._get_dedicated_database_statistics(
        "workspace", "warehouse", "user", "password"
    )

    definitions, summary = result[3], result[4]
    assert definitions.definitions == []
    assert summary.extraction_status == "not_requested"
    odbc.get_sql_definitions.assert_not_called()


def test_definition_options_are_forwarded_to_odbc():
    client = make_client(True)
    odbc = configure_odbc(client)
    odbc.get_sql_definitions.return_value = (
        SynapseSqlDefinitions(),
        SynapseDefinitionSummary(extraction_status="completed"),
    )

    result = client._get_dedicated_database_statistics(
        "workspace", "warehouse", "user", "password"
    )

    assert result[4].extraction_status == "completed"
    odbc.get_sql_definitions.assert_called_once_with(
        redaction_mode="hash",
        schema_filter=["dbo"],
        max_definition_size=2048,
    )


def test_definition_failure_degrades_to_unavailable():
    client = make_client(True)
    odbc = configure_odbc(client)
    odbc.get_sql_definitions.side_effect = RuntimeError("permission denied")

    result = client._get_dedicated_database_statistics(
        "workspace", "warehouse", "user", "password"
    )

    summary = result[4]
    assert summary.extraction_status == "unavailable"
    assert "permission denied" in summary.status_description
    assert client.definition_extraction_issues == [
        "warehouse: definition extraction failed"
    ]


def test_definition_run_does_not_prompt_for_missing_statistics_dmv():
    client = make_client(True)
    odbc = configure_odbc(client)
    odbc.check_table_statistics_dmv_exists.return_value = False
    odbc.get_sql_definitions.return_value = (
        SynapseSqlDefinitions(),
        SynapseDefinitionSummary(extraction_status="completed"),
    )

    with patch(
        "fabric_assessment_tool.clients.synapse_client.utils_ui.prompt_confirm"
    ) as prompt_confirm:
        client._get_dedicated_database_statistics(
            "workspace", "warehouse", "user", "password"
        )

    prompt_confirm.assert_not_called()
    odbc.create_table_statistics_dmv.assert_not_called()
