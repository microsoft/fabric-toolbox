import contextlib
import time

import pytest

from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.purview_client import PurviewClient
from dbt.adapters.fabric.purview_sync import _FABRIC_GROUPS_URL
from dbt.tests.util import run_dbt, write_file
from tests.conftest import requires_purview

_CUSTOM_RELATIONSHIP_TYPES = [
    "fabric_warehouse_table_columns",
    "fabric_warehouse_table_schemas",
    "fabric_warehouse_schema_warehouses",
]
_CUSTOM_ENTITY_TYPES = [
    "fabric_warehouse_table_column",
    "fabric_warehouse_table",
    "fabric_warehouse_schema",
    "dbt_transformation",
]
_CUSTOM_BM_TYPES = ["dbt_metadata"]


def _cleanup_custom_types(client: PurviewClient) -> None:
    """Best-effort deletion of custom Purview type definitions.

    Deletion order: relationships first (they reference entity types),
    then entity types, then business metadata types.
    May fail if entities of these types still exist (409 Conflict).
    """
    for name in _CUSTOM_RELATIONSHIP_TYPES + _CUSTOM_ENTITY_TYPES + _CUSTOM_BM_TYPES:
        with contextlib.suppress(Exception):
            client.delete_type_def_by_name(name)


def _build_warehouse_qn(workspace_id: str, warehouse_id: str) -> str:
    return f"{_FABRIC_GROUPS_URL}/{workspace_id}/warehouses/{warehouse_id}"


def _cleanup_test_entities(
    client: PurviewClient,
    workspace_id: str,
    warehouse_id: str,
    schema: str,
    table_names: list[str],
) -> None:
    """Delete all test entities from Purview: process, columns, tables, schema.

    Uses direct qualified-name lookups (not search) so cleanup works even
    immediately after creation (bypasses eventually-consistent search index).
    """
    wh_qn = _build_warehouse_qn(workspace_id, warehouse_id)

    for name in table_names:
        _delete_entity_if_exists(client, "dbt_transformation", f"dbt://model.test.{name}")

    for name in table_names:
        table_qn = f"{wh_qn}/schemas/{schema}/tables/{name}"
        table_result = client.get_entity_by_qualified_name("fabric_warehouse_table", table_qn)
        if table_result and "entity" in table_result:
            for col_guid in table_result.get("referredEntities", {}):
                with contextlib.suppress(Exception):
                    client.delete_entity_by_guid(col_guid)

    for name in table_names:
        _delete_entity_if_exists(
            client, "fabric_warehouse_table", f"{wh_qn}/schemas/{schema}/tables/{name}"
        )

    _delete_entity_if_exists(client, "fabric_warehouse_schema", f"{wh_qn}/schemas/{schema}")

    for proc in client.search_process_entities("dbt://model.test."):
        with contextlib.suppress(Exception):
            client.delete_entity_by_guid(proc["id"])


def _delete_entity_if_exists(client: PurviewClient, type_name: str, qualified_name: str) -> None:
    result = client.get_entity_by_qualified_name(type_name, qualified_name)
    if result and "entity" in result:
        with contextlib.suppress(Exception):
            client.delete_entity_by_guid(result["entity"]["guid"])


@requires_purview
class TestPurviewEnsureTypeDefinitions:
    """Test custom type definition registration from a clean state.

    Deletes existing custom types before testing so the POST (creation) path
    is exercised, not just the PUT (update) path.
    """

    @pytest.fixture(scope="class", autouse=True)
    def clean_types(self, purview_client: PurviewClient):
        _cleanup_custom_types(purview_client)
        yield

    def test_creates_business_metadata_type(self, purview_client: PurviewClient):
        purview_client._bm_type_ensured = False
        purview_client.ensure_business_metadata_type()

        for name in _CUSTOM_BM_TYPES:
            td = purview_client.get_type_def_by_name(name)
            assert td is not None, f"Type {name} not found after registration"
        assert purview_client._bm_type_ensured

    def test_creates_transformation_type(self, purview_client: PurviewClient):
        purview_client._transformation_type_ensured = False
        purview_client.ensure_transformation_type()

        td = purview_client.get_type_def_by_name("dbt_transformation")
        assert td is not None, "dbt_transformation not found after registration"
        assert purview_client._transformation_type_ensured

    def test_creates_warehouse_types(self, purview_client: PurviewClient):
        purview_client._warehouse_types_ensured = False
        purview_client.ensure_warehouse_types()

        for name in _CUSTOM_ENTITY_TYPES:
            if name == "dbt_transformation":
                continue
            td = purview_client.get_type_def_by_name(name)
            assert td is not None, f"Type {name} not found after registration"
        assert purview_client._warehouse_types_ensured

    def test_idempotent_registration(self, purview_client: PurviewClient):
        purview_client._bm_type_ensured = False
        purview_client.ensure_business_metadata_type()
        purview_client._bm_type_ensured = False
        purview_client.ensure_business_metadata_type()
        assert purview_client._bm_type_ensured


_BASE_MODEL_SQL = """
{{ config(materialized='table') }}
SELECT 1 AS id, 'hello' AS name, CAST(GETDATE() AS datetime2(6)) AS created_at
"""
_DERIVED_MODEL_SQL = """
{{ config(materialized='table') }}
SELECT id, name, created_at FROM {{ ref('base_model') }}
"""
_SOURCE_CONSUMER_SQL = """
-- depends_on: {{ ref('base_model') }}
{{ config(materialized='table') }}
SELECT id, name FROM {{ source('raw', 'base_model') }}
"""
_NO_DOCS_MODEL_SQL = """
{{ config(materialized='table') }}
SELECT 42 AS value
"""

_SCHEMA_V1 = """\
version: 2
models:
  - name: base_model
    description: "Base model for Purview integration test"
    columns:
      - name: id
        description: "Primary key"
        data_type: int
        tests:
          - not_null
      - name: name
        description: "Display name"
        data_type: varchar
  - name: derived_model
    description: "Derived model referencing base"
  - name: source_consumer
    description: "Model consuming a source"
  - name: no_docs_model
    description: "This description should NOT be synced to Purview"
    config:
      persist_docs:
        relation: false
        columns: false
    columns:
      - name: value
        description: "This column description should NOT be synced"

sources:
  - name: raw
    schema: "{{ target.schema }}"
    tables:
      - name: base_model
"""

_SCHEMA_V2 = """\
version: 2
models:
  - name: base_model
    description: "Updated base model (v2)"
    columns:
      - name: id
        description: "Primary key (updated)"
        data_type: int
        tests:
          - not_null
          - unique
      - name: name
        description: "Display name (updated)"
        data_type: varchar
        tests:
          - not_null
  - name: derived_model
    description: "Updated derived model (v2)"
    columns:
      - name: id
        tests:
          - not_null
  - name: source_consumer
    description: "Model consuming a source (v2)"
  - name: no_docs_model
    description: "Still should NOT be synced"
    config:
      persist_docs:
        relation: false
        columns: false

sources:
  - name: raw
    schema: "{{ target.schema }}"
    tables:
      - name: base_model
"""

_TABLE_NAMES = ["base_model", "derived_model", "source_consumer", "no_docs_model"]


@requires_purview
class TestPurviewSync:
    """Full integration test for Purview sync.

    Creates dbt models, runs them, then syncs metadata to Purview.
    Cleans up all created entities both before (stale state from previous runs)
    and after the test class.
    """

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "base_model.sql": _BASE_MODEL_SQL,
            "derived_model.sql": _DERIVED_MODEL_SQL,
            "source_consumer.sql": _SOURCE_CONSUMER_SQL,
            "no_docs_model.sql": _NO_DOCS_MODEL_SQL,
            "schema.yml": _SCHEMA_V1,
        }

    @pytest.fixture(scope="class")
    def warehouse_info(self, fabric_api_client: FabricApiClient, project):
        workspace_id = fabric_api_client.get_workspace_id()
        warehouses = fabric_api_client.get_warehouses()
        warehouse_id = next(
            (wh["id"] for wh in warehouses if wh["displayName"] == project.database),
            None,
        )
        assert warehouse_id, f"Warehouse '{project.database}' not found in workspace"
        return workspace_id, warehouse_id

    @pytest.fixture(scope="class")
    def synced_entities(self, project, purview_client, warehouse_info):
        """Run dbt models and sync to Purview, then look up created entities.

        Cleans up stale entities from previous runs before syncing.
        Uses get_entity_by_qualified_name (bypasses eventually-consistent search index).
        """
        workspace_id, warehouse_id = warehouse_info
        schema = project.test_schema

        _cleanup_test_entities(purview_client, workspace_id, warehouse_id, schema, _TABLE_NAMES)

        run_dbt(["run"])
        run_dbt(["run-operation", "purview_sync"])

        entities = {}
        for name in _TABLE_NAMES:
            qn = (
                f"{_FABRIC_GROUPS_URL}/{workspace_id}/warehouses/{warehouse_id}"
                f"/schemas/{schema}/tables/{name}"
            )
            result = purview_client.get_entity_by_qualified_name("fabric_warehouse_table", qn)
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
    def cleanup_purview(self, purview_client, synced_entities, warehouse_info, project):
        yield
        workspace_id, warehouse_id = warehouse_info
        _cleanup_test_entities(
            purview_client, workspace_id, warehouse_id, project.test_schema, _TABLE_NAMES
        )

    def test_sync_creates_entities(self, synced_entities):
        assert "base_model" in synced_entities
        assert "derived_model" in synced_entities

    def test_description_landed(self, purview_client, synced_entities):
        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        desc = entity_data["entity"]["attributes"].get("userDescription", "")
        assert desc == "Base model for Purview integration test"

    def test_column_entities_created(self, purview_client, synced_entities):
        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        referred = entity_data.get("referredEntities", {})

        col_names = {
            e["attributes"]["name"]: e
            for e in referred.values()
            if "column" in e.get("typeName", "").lower()
        }
        assert "id" in col_names, "Column 'id' not found"
        assert "name" in col_names, "Column 'name' not found"

        id_col = col_names["id"]
        assert id_col["attributes"].get("userDescription") == "Primary key"

        name_col = col_names["name"]
        assert name_col["attributes"].get("userDescription") == "Display name"

    def test_undocumented_columns_discovered_from_catalog(self, purview_client, synced_entities):
        """Columns not in dbt YAML should still appear in Purview from catalog discovery."""
        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        referred = entity_data.get("referredEntities", {})

        col_names = {
            e["attributes"]["name"]: e
            for e in referred.values()
            if "column" in e.get("typeName", "").lower()
        }
        assert "created_at" in col_names, (
            "Undocumented column 'created_at' should be discovered from catalog"
        )
        created_at = col_names["created_at"]
        assert created_at["attributes"].get("data_type"), (
            "Catalog-discovered column should have a data_type"
        )
        assert "userDescription" not in created_at["attributes"] or not created_at[
            "attributes"
        ].get("userDescription"), "Undocumented column should not have a description"

    def test_business_metadata_landed(self, purview_client, synced_entities):
        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata", {})
        assert bm["dbt_model_id"] == "model.test.base_model"
        assert "dbt_last_sync" in bm
        assert bm.get("dbt_materialization") == "table"
        assert "not_null" in bm.get("dbt_tests", "")

    def test_lineage_created(self, purview_client):
        result = purview_client.get_entity_by_qualified_name(
            "dbt_transformation", "dbt://model.test.derived_model"
        )
        assert result is not None and "entity" in result

    def test_source_lineage_created(self, purview_client, synced_entities):
        """Lineage from source() dependencies should create a transformation entity."""
        result = purview_client.get_entity_by_qualified_name(
            "dbt_transformation", "dbt://model.test.source_consumer"
        )
        assert result is not None and "entity" in result
        inputs = result["entity"]["attributes"].get("inputs", [])
        assert len(inputs) >= 1, "source_consumer should have at least one input (the source)"

    def test_persist_docs_false_skips_model(self, purview_client, synced_entities):
        if "no_docs_model" not in synced_entities:
            return
        entity_data = purview_client.get_entity_by_guid(synced_entities["no_docs_model"]["id"])
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata")
        assert bm is None

    def test_enrich_existing_entities(self, project, purview_client, synced_entities):
        """Re-running sync on already-existing entities should update, not duplicate."""
        run_dbt(["run-operation", "purview_sync"])

        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata", {})
        assert bm.get("dbt_model_id") == "model.test.base_model"

    def test_selective_flags(self, synced_entities, project):
        run_dbt(
            [
                "run-operation",
                "purview_sync",
                "--args",
                "{sync_descriptions: true, sync_lineage: false, sync_metadata: true}",
            ]
        )

    def test_search_finds_entity_by_guid_filter(
        self, purview_client, warehouse_info, synced_entities
    ):
        """Verify search_entities() with database_identifiers finds the right entity.

        Purview's search index is eventually consistent — entities created via the
        bulk API may take several minutes to appear in search results. This test
        retries for up to 3 minutes. If the index still hasn't converged, it skips
        rather than failing, since this is a Purview infrastructure limitation.
        """
        _, warehouse_id = warehouse_info
        results = []
        for _attempt in range(12):
            results = purview_client.search_entities(
                name="base_model", database_identifiers=[warehouse_id]
            )
            if results:
                break
            time.sleep(15)

        if not results:
            pytest.skip(
                "Purview search index did not converge within 3 minutes for custom entity types"
            )
        matched_qns = [r.get("qualifiedName", "") for r in results]
        assert any(warehouse_id in qn for qn in matched_qns)

    def test_update_overwrites(self, project, purview_client, synced_entities):
        write_file(_SCHEMA_V2, project.project_root, "models", "schema.yml")
        run_dbt(["run"])
        run_dbt(["run-operation", "purview_sync"])

        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata", {})
        desc = entity_data["entity"]["attributes"].get("userDescription", "")

        assert desc == "Updated base model (v2)"
        assert "unique" in bm.get("dbt_tests", "")

    def test_full_sync_removes_stale_lineage(self, project, purview_client, warehouse_info):
        """Full sync removes lineage for a model that loses its dependencies.

        Changes derived_model from ref('base_model') to a standalone SELECT,
        then runs a full sync. The stale dbt_transformation for derived_model
        should be deleted because derived_model still exists in the graph
        but no longer has upstream dependencies.
        """
        result = purview_client.get_entity_by_qualified_name(
            "dbt_transformation", "dbt://model.test.derived_model"
        )
        had_lineage = result is not None and "entity" in result
        if not had_lineage:
            pytest.skip("derived_model had no lineage to begin with")

        write_file(
            "{{ config(materialized='table') }}\nSELECT 1 AS id, 'standalone' AS name,"
            " CAST(GETDATE() AS datetime2(6)) AS created_at\n",
            project.project_root,
            "models",
            "derived_model.sql",
        )
        run_dbt(["run"])
        run_dbt(["run-operation", "purview_sync"])

        result = purview_client.get_entity_by_qualified_name(
            "dbt_transformation", "dbt://model.test.derived_model"
        )
        assert result is None or "entity" not in result, (
            "Stale lineage for model without dependencies should be cleaned up"
        )

    def test_persist_docs_false_does_not_overwrite(self, project, purview_client, synced_entities):
        write_file(
            "version: 2\n"
            "models:\n"
            "  - name: base_model\n"
            "    description: 'Should NOT be synced'\n"
            "    config:\n"
            "      persist_docs:\n"
            "        relation: false\n"
            "        columns: false\n"
            "sources:\n"
            "  - name: raw\n"
            "    schema: '{{ target.schema }}'\n"
            "    tables:\n"
            "      - name: base_model\n",
            project.project_root,
            "models",
            "schema.yml",
        )
        run_dbt(["run"])
        run_dbt(
            [
                "run-operation",
                "purview_sync",
                "--args",
                "{sync_lineage: false}",
            ]
        )

        entity = synced_entities["base_model"]
        entity_data = purview_client.get_entity_by_guid(entity["id"])
        desc = entity_data["entity"]["attributes"].get("userDescription", "")
        bm = entity_data["entity"].get("businessAttributes", {}).get("dbt_metadata", {})

        assert desc == "Updated base model (v2)"
        assert "unique" in bm.get("dbt_tests", "")
