import contextlib
import os

import pytest

from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.purview_client import PurviewClient
from dbt.adapters.fabric.purview_sync import _FABRIC_GROUPS_URL
from dbt.tests.util import run_dbt
from tests.conftest import requires_purview


def _build_lakehouse_table_qn(
    workspace_id: str, lakehouse_id: str, schema: str, table_name: str
) -> str:
    table_segment = f"{schema}%252F{table_name}" if schema else table_name
    return f"{_FABRIC_GROUPS_URL}/{workspace_id}/lakehouses/{lakehouse_id}/tables/{table_segment}"


def _delete_entity_if_exists(client: PurviewClient, type_name: str, qualified_name: str) -> None:
    result = client.get_entity_by_qualified_name(type_name, qualified_name)
    if result and "entity" in result:
        with contextlib.suppress(Exception):
            client.delete_entity_by_guid(result["entity"]["guid"])


def _cleanup_lakehouse_entities(
    client: PurviewClient,
    workspace_id: str,
    lakehouse_id: str,
    schema: str,
    table_names: list[str],
) -> None:
    for name in table_names:
        _delete_entity_if_exists(client, "dbt_transformation", f"dbt://model.test.{name}")

    # Search-based cleanup: delete ALL lakehouse entities with these names in this lakehouse,
    # regardless of schema. Handles stale entities from previous test runs.
    for name in table_names:
        results = client.search_entities(name=name, database_identifiers=[lakehouse_id])
        for entity in results:
            guid = entity.get("id")
            if guid:
                full = client.get_entity_by_guid(guid)
                if full and "entity" in full:
                    for ref in full.get("referredEntities", {}).values():
                        if ref.get("typeName") == "fabric_lakehouse_table_column":
                            with contextlib.suppress(Exception):
                                client.delete_entity_by_guid(ref["guid"])
                with contextlib.suppress(Exception):
                    client.delete_entity_by_guid(guid)

    # Direct QN-based cleanup for the current schema
    for name in table_names:
        table_qn = _build_lakehouse_table_qn(workspace_id, lakehouse_id, schema, name)
        table_result = client.get_entity_by_qualified_name("fabric_lakehouse_table", table_qn)
        if table_result and "entity" in table_result:
            for ref in table_result.get("referredEntities", {}).values():
                if ref.get("typeName") == "fabric_lakehouse_table_column":
                    with contextlib.suppress(Exception):
                        client.delete_entity_by_guid(ref["guid"])

    for name in table_names:
        table_qn = _build_lakehouse_table_qn(workspace_id, lakehouse_id, schema, name)
        _delete_entity_if_exists(client, "fabric_lakehouse_table", table_qn)


_LH_BASE_MODEL_SQL = """
{{ config(materialized='table') }}
SELECT 1 AS id, 'hello' AS name, current_timestamp() AS created_at
"""
_LH_DERIVED_MODEL_SQL = """
{{ config(materialized='table') }}
SELECT id, name, created_at FROM {{ ref('lh_base_model') }}
"""

_LH_SCHEMA = """\
version: 2
models:
  - name: lh_base_model
    description: "Lakehouse model for Purview integration test"
    columns:
      - name: id
        description: "Primary key"
        data_type: int
      - name: name
        description: "Display name"
        data_type: string
  - name: lh_derived_model
    description: "Derived lakehouse model referencing base"
"""

_LH_TABLE_NAMES = ["lh_base_model", "lh_derived_model"]


@requires_purview
class TestPurviewSyncLakehouse:
    @pytest.fixture(scope="class")
    def dbt_profile_target_update(self):
        return {"purview_endpoint": os.getenv("FABRIC_TEST_PURVIEW_ENDPOINT")}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "lh_base_model.sql": _LH_BASE_MODEL_SQL,
            "lh_derived_model.sql": _LH_DERIVED_MODEL_SQL,
            "schema.yml": _LH_SCHEMA,
        }

    @pytest.fixture(scope="class")
    def lakehouse_info(self, fabric_api_client: FabricApiClient, project):
        workspace_id = fabric_api_client.get_workspace_id()
        lakehouses = fabric_api_client.get_lakehouses()
        lakehouse_id = next(
            (lh["id"] for lh in lakehouses if lh["displayName"] == project.database),
            None,
        )
        assert lakehouse_id, f"Lakehouse '{project.database}' not found in workspace"
        return workspace_id, lakehouse_id

    @pytest.fixture(scope="class")
    def synced_entities(self, project, purview_client, lakehouse_info):
        workspace_id, lakehouse_id = lakehouse_info
        schema = project.test_schema

        _cleanup_lakehouse_entities(
            purview_client, workspace_id, lakehouse_id, schema, _LH_TABLE_NAMES
        )

        run_dbt(["run"])
        run_dbt(["run-operation", "purview_sync"])

        entities = {}
        for name in _LH_TABLE_NAMES:
            qn = _build_lakehouse_table_qn(workspace_id, lakehouse_id, schema, name)
            result = purview_client.get_entity_by_qualified_name("fabric_lakehouse_table", qn)
            if result and "entity" in result:
                entity = result["entity"]
                entities[name] = {
                    "id": entity["guid"],
                    "name": entity["attributes"].get("name", name),
                    "entityType": entity["typeName"],
                    "qualifiedName": entity["attributes"]["qualifiedName"],
                }
        return entities

    @pytest.fixture(scope="class", autouse=True)
    def cleanup_purview(self, purview_client, synced_entities, lakehouse_info, project):
        yield
        workspace_id, lakehouse_id = lakehouse_info
        _cleanup_lakehouse_entities(
            purview_client, workspace_id, lakehouse_id, project.test_schema, _LH_TABLE_NAMES
        )

    def test_entities_created(self, synced_entities):
        assert "lh_base_model" in synced_entities, "lh_base_model not found in Purview"
        assert "lh_derived_model" in synced_entities, "lh_derived_model not found in Purview"

    def test_entity_type_is_lakehouse(self, synced_entities):
        for name, entity in synced_entities.items():
            assert entity["entityType"] == "fabric_lakehouse_table", (
                f"{name} has type {entity['entityType']}, expected fabric_lakehouse_table"
            )

    def test_qualified_name_format(self, synced_entities, lakehouse_info, project):
        workspace_id, lakehouse_id = lakehouse_info
        schema = project.test_schema

        for name, entity in synced_entities.items():
            expected_qn = _build_lakehouse_table_qn(workspace_id, lakehouse_id, schema, name)
            assert entity["qualifiedName"] == expected_qn, (
                f"Expected qualifiedName {expected_qn}, got {entity['qualifiedName']}"
            )
            assert f"/lakehouses/{lakehouse_id}/tables/" in entity["qualifiedName"]
            assert f"{schema}%252F{name}" in entity["qualifiedName"]

    def test_column_type_and_data_type_attribute(self, purview_client, synced_entities):
        entity = synced_entities["lh_base_model"]
        table_qn = entity["qualifiedName"]

        col_entities = []
        for col_name in ("id", "name"):
            col_qn = f"{table_qn}/columns/{col_name}"
            result = purview_client.get_entity_by_qualified_name(
                "fabric_lakehouse_table_column", col_qn
            )
            if result and "entity" in result:
                col_entities.append(result["entity"])

        assert len(col_entities) >= 2, (
            f"Expected at least 2 column entities, found {len(col_entities)}"
        )
        for col in col_entities:
            assert col["typeName"] == "fabric_lakehouse_table_column"
            assert col["attributes"].get("dataType"), (
                f"Column {col['attributes'].get('name')} missing dataType attribute"
            )

    def test_column_descriptions(self, purview_client, synced_entities):
        entity = synced_entities["lh_base_model"]
        table_qn = entity["qualifiedName"]

        expected = {"id": "Primary key", "name": "Display name"}
        for col_name, expected_desc in expected.items():
            col_qn = f"{table_qn}/columns/{col_name}"
            result = purview_client.get_entity_by_qualified_name(
                "fabric_lakehouse_table_column", col_qn
            )
            assert result and "entity" in result, f"Column entity {col_name} not found"
            actual_desc = result["entity"]["attributes"].get("userDescription", "")
            assert actual_desc == expected_desc, (
                f"Column {col_name}: expected userDescription '{expected_desc}', got '{actual_desc}'"
            )

    def test_description_landed(self, purview_client, synced_entities):
        entity = synced_entities["lh_base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        desc = entity_data["entity"]["attributes"].get("userDescription", "")
        assert desc == "Lakehouse model for Purview integration test"

    def test_business_metadata(self, purview_client, synced_entities):
        entity = synced_entities["lh_base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata", {})
        assert bm.get("dbt_model_id") == "model.test.lh_base_model"
        assert "dbt_last_sync" in bm
        assert bm.get("dbt_materialization") == "table"

    def test_lineage_created(self, purview_client):
        result = purview_client.get_entity_by_qualified_name(
            "dbt_transformation", "dbt://model.test.lh_derived_model"
        )
        assert result is not None and "entity" in result

    def test_no_custom_type_registration_needed(self, purview_client):
        for type_name in ("fabric_lakehouse_table", "fabric_lakehouse_table_column"):
            td = purview_client.get_type_def_by_name(type_name)
            assert td is not None, f"Built-in type {type_name} not found in Purview"
