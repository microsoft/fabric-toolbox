import hashlib
import time
from datetime import datetime, timezone
from types import SimpleNamespace

from fabric_assessment_tool.clients.odbc_client import (
    PARTIAL_REDACTION_MARKER,
    OdbcClient,
)


def make_row(
    *,
    name="object_name",
    schema="dbo",
    sql_type="P",
    definition="SELECT 1",
    is_encrypted=0,
    has_view_definition=1,
    modified_at=datetime(2026, 1, 1),
):
    return SimpleNamespace(
        database_name="warehouse",
        schema_name=schema,
        object_name=name,
        sql_type=sql_type,
        sql_type_description="SQL_STORED_PROCEDURE",
        create_date=datetime(2025, 1, 1),
        modify_date=modified_at,
        is_encrypted=is_encrypted,
        has_view_definition=has_view_definition,
        has_database_view_definition=1,
        definition_length=len(definition) if definition is not None else None,
        definition=definition,
    )


def make_client():
    return OdbcClient(
        workspace_name="workspace",
        database="warehouse",
        auth_mode="entra-default",
    )


def test_extracts_complete_definition_and_parameterizes_schema_filter(monkeypatch):
    client = make_client()
    definition = "CREATE PROCEDURE dbo.large AS\n" + ("SELECT 1;\n" * 600)
    captured = {}

    def execute_query(query, parameters=None):
        captured["query"] = query
        captured["parameters"] = parameters
        yield make_row(definition=definition)

    monkeypatch.setattr(client, "execute_query", execute_query)

    definitions, summary = client.get_sql_definitions(
        redaction_mode="none",
        schema_filter=["dbo", "reporting"],
        max_definition_size=0,
    )

    item = definitions.definitions[0]
    assert item.definition == definition
    assert item.original_length > 4000
    assert item.is_truncated is False
    assert captured["parameters"] == ["dbo", "reporting"]
    assert "IN (?, ?)" in captured["query"]
    assert "ROUTINE_DEFINITION" not in captured["query"]
    assert summary.total_objects == 1


def test_redaction_modes_never_duplicate_raw_definition_in_metadata(monkeypatch):
    client = make_client()
    source = "CREATE VIEW dbo.secret AS SELECT password FROM credentials"
    monkeypatch.setattr(
        client,
        "execute_query",
        lambda query, parameters=None: iter([make_row(definition=source)]),
    )

    partial, _ = client.get_sql_definitions(redaction_mode="partial")
    partial_item = partial.definitions[0]
    assert PARTIAL_REDACTION_MARKER in partial_item.definition
    assert partial_item.definition != source
    assert source not in str(partial_item.json_response)

    full, _ = client.get_sql_definitions(redaction_mode="full")
    assert full.definitions[0].definition is None
    assert full.definitions[0].definition_hash is None

    hashed, _ = client.get_sql_definitions(redaction_mode="hash")
    assert hashed.definitions[0].definition is None
    assert (
        hashed.definitions[0].definition_hash
        == hashlib.sha256(source.encode("utf-8")).hexdigest()
    )


def test_truncation_preserves_original_length(monkeypatch):
    client = make_client()
    source = "0123456789" * 100
    monkeypatch.setattr(
        client,
        "execute_query",
        lambda query, parameters=None: iter([make_row(definition=source)]),
    )

    definitions, summary = client.get_sql_definitions(
        redaction_mode="none", max_definition_size=100
    )

    item = definitions.definitions[0]
    assert item.original_length == 1000
    assert item.stored_length == 100
    assert item.is_truncated is True
    assert summary.truncated_objects == 1
    assert summary.total_definition_characters == 1000


def test_partial_redaction_preserves_marker_and_suffix_with_size_limit(
    monkeypatch,
):
    client = make_client()
    source = "BEGIN-" + ("sensitive-" * 100) + "-END"
    monkeypatch.setattr(
        client,
        "execute_query",
        lambda query, parameters=None: iter([make_row(definition=source)]),
    )

    definitions, summary = client.get_sql_definitions(
        redaction_mode="partial", max_definition_size=100
    )

    item = definitions.definitions[0]
    assert item.stored_length <= 100
    assert item.definition.startswith("BEGIN-")
    assert PARTIAL_REDACTION_MARKER in item.definition
    assert item.definition.endswith("-END")
    assert item.is_truncated is True
    assert summary.truncated_objects == 1


def test_encrypted_and_permission_hidden_objects_are_distinguished(monkeypatch):
    client = make_client()
    rows = [
        make_row(name="encrypted_proc", definition=None, is_encrypted=1),
        make_row(
            name="hidden_view",
            sql_type="V",
            definition=None,
            has_view_definition=0,
        ),
    ]
    monkeypatch.setattr(
        client, "execute_query", lambda query, parameters=None: iter(rows)
    )

    definitions, summary = client.get_sql_definitions(redaction_mode="none")

    encrypted, hidden = definitions.definitions
    assert encrypted.is_encrypted is True
    assert encrypted.is_unavailable is False
    assert hidden.is_encrypted is False
    assert hidden.is_unavailable is True
    assert summary.encrypted_objects == 1
    assert summary.unavailable_objects == 1
    assert summary.extraction_status == "partial"


def test_database_permission_sentinel_reports_unavailable(monkeypatch):
    client = make_client()
    sentinel = make_row(name=None, definition=None, has_view_definition=0)
    sentinel.object_name = None
    sentinel.has_database_view_definition = 0
    monkeypatch.setattr(
        client, "execute_query", lambda query, parameters=None: iter([sentinel])
    )

    definitions, summary = client.get_sql_definitions()

    assert definitions.definitions == []
    assert summary.extraction_status == "unavailable"
    assert "VIEW DEFINITION" in summary.status_description


def test_summary_type_size_and_age_analysis():
    client = make_client()
    rows = [
        make_row(name="proc", sql_type="P", definition="x" * 300),
        make_row(
            name="function",
            sql_type="IF",
            definition="x" * 200,
            modified_at=datetime(2022, 1, 1),
        ),
        make_row(
            name="view",
            sql_type="V",
            definition="x" * 100,
            modified_at=None,
        ),
    ]
    definitions = [client._transform_definition_row(row, "none", 0) for row in rows]

    summary = client.build_definition_summary(
        SimpleNamespace(definitions=definitions),
        now=datetime(2026, 7, 30, tzinfo=timezone.utc),
    )

    assert summary.counts_by_type == {
        "stored_procedure": 1,
        "function": 1,
        "view": 1,
    }
    assert summary.largest_objects[0]["name"] == "proc"
    assert summary.age_buckets["less_than_1_year"] == 1
    assert summary.age_buckets["3_to_5_years"] == 1
    assert summary.age_buckets["unknown"] == 1


def test_normalizes_padded_sql_type_codes():
    client = make_client()

    procedure = client._transform_definition_row(make_row(sql_type="P "), "none", 0)
    view = client._transform_definition_row(make_row(sql_type="V "), "none", 0)

    assert procedure.sql_type == "P"
    assert procedure.object_type == "stored_procedure"
    assert view.sql_type == "V"
    assert view.object_type == "view"


def test_processes_5000_objects_with_one_query(monkeypatch):
    client = make_client()
    rows = [
        make_row(name=f"proc_{index}", definition="SELECT 1") for index in range(5000)
    ]
    calls = 0

    def execute_query(query, parameters=None):
        nonlocal calls
        calls += 1
        return iter(rows)

    monkeypatch.setattr(client, "execute_query", execute_query)

    started = time.perf_counter()
    definitions, summary = client.get_sql_definitions(redaction_mode="hash")
    elapsed = time.perf_counter() - started

    assert calls == 1
    assert len(definitions.definitions) == 5000
    assert summary.total_objects == 5000
    assert elapsed < 5
