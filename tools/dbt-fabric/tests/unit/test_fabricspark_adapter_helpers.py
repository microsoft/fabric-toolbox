import pytest
from dbt_common.exceptions import DbtRuntimeError

from dbt.adapters.fabricspark.fabricspark_adapter import FabricSparkAdapter
from dbt.adapters.fabricspark.fabricspark_column import FabricSparkColumn
from dbt.adapters.fabricspark.fabricspark_connection_manager import FabricSparkConnectionManager
from dbt.adapters.fabricspark.fabricspark_relation import (
    FabricSparkRelation,
    FabricSparkRelationType,
)


class TestNamespaceToParts:
    @pytest.fixture
    def adapter(self):
        adapter = object.__new__(FabricSparkAdapter)
        return adapter

    def test_standard_three_part_namespace(self, adapter):
        result = adapter._namespace_to_parts("`workspace`.`database`.`schema`")
        assert result == ("workspace", "database", "schema")

    def test_strips_backticks(self, adapter):
        result = adapter._namespace_to_parts("`my-ws`.`my-db`.`my-schema`")
        assert result == ("my-ws", "my-db", "my-schema")

    def test_no_backticks(self, adapter):
        result = adapter._namespace_to_parts("workspace.database.schema")
        assert result == ("workspace", "database", "schema")

    def test_raises_on_two_parts(self, adapter):
        with pytest.raises(DbtRuntimeError, match="Unexpected namespace format"):
            adapter._namespace_to_parts("database.schema")

    def test_raises_on_four_parts(self, adapter):
        with pytest.raises(DbtRuntimeError, match="Unexpected namespace format"):
            adapter._namespace_to_parts("a.b.c.d")

    def test_raises_on_single_part(self, adapter):
        with pytest.raises(DbtRuntimeError, match="Unexpected namespace format"):
            adapter._namespace_to_parts("onlyone")


class TestTryTranslateType:
    def test_materialized_lake_view_uppercase(self):
        result = FabricSparkRelation.try_translate_type("MATERIALIZED_LAKE_VIEW")
        assert result == FabricSparkRelationType.MaterializedView

    def test_materialized_lake_view_lowercase(self):
        result = FabricSparkRelation.try_translate_type("materialized_lake_view")
        assert result == FabricSparkRelationType.MaterializedView

    def test_managed_uppercase(self):
        result = FabricSparkRelation.try_translate_type("MANAGED")
        assert result == FabricSparkRelationType.Table

    def test_managed_lowercase(self):
        result = FabricSparkRelation.try_translate_type("managed")
        assert result == FabricSparkRelationType.Table

    def test_none_returns_none(self):
        result = FabricSparkRelation.try_translate_type(None)
        assert result is None

    def test_unknown_string_returns_none(self):
        result = FabricSparkRelation.try_translate_type("external")
        assert result is None

    def test_view_uppercase(self):
        result = FabricSparkRelation.try_translate_type("VIEW")
        assert result == FabricSparkRelationType.View

    def test_view_lowercase(self):
        result = FabricSparkRelation.try_translate_type("view")
        assert result == FabricSparkRelationType.View


class TestBuildSparkRelationList:
    @pytest.fixture
    def adapter(self):
        adapter = object.__new__(FabricSparkAdapter)
        adapter.Relation = FabricSparkRelation
        return adapter

    def _make_rows(self, data):
        return data

    def _info_func(self, row):
        return row["namespace"], row["name"], row["information"]

    def test_builds_relations_from_rows(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "my_table",
                    "information": "Type: MANAGED\nProvider: delta",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert len(result) == 1
        assert result[0].identifier == "my_table"
        assert result[0].type == FabricSparkRelationType.Table

    def test_skips_none_namespace_but_processes_valid_rows(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": None,
                    "name": "temp_view",
                    "information": "",
                },
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "valid_table",
                    "information": "Type: MANAGED",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert len(result) == 1
        assert result[0].identifier == "valid_table"

    def test_skips_empty_namespace_but_processes_valid_rows(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "",
                    "name": "temp_view",
                    "information": "",
                },
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "valid_table",
                    "information": "Type: MANAGED",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert len(result) == 1
        assert result[0].identifier == "valid_table"

    def test_detects_materialized_lake_view_type(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "my_view",
                    "information": "Type: MATERIALIZED_LAKE_VIEW\nProvider: delta",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert len(result) == 1
        assert result[0].type == FabricSparkRelationType.MaterializedView

    def test_falls_back_to_table_type_for_unknown_type(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "regular_table",
                    "information": "Type: EXTERNAL\nProvider: delta",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert result[0].type == FabricSparkRelationType.Table

    def test_detects_view_type(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "`ws`.`db`.`schema1`",
                    "name": "my_spark_view",
                    "information": "Type: VIEW\nProvider: delta",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert len(result) == 1
        assert result[0].type == FabricSparkRelationType.View

    def test_extracts_workspace_database_schema(self, adapter):
        rows = self._make_rows(
            [
                {
                    "namespace": "`my-workspace`.`my-lakehouse`.`my-schema`",
                    "name": "tbl",
                    "information": "Type: MANAGED",
                },
            ]
        )
        result = adapter._build_spark_relation_list(rows, self._info_func)
        assert result[0].catalog == "my-workspace"
        assert result[0].path.database == "my-lakehouse"
        assert result[0].path.schema == "my-schema"


class TestFabricSparkColumnTypeChecks:
    def test_is_string_for_string_dtype(self):
        col = FabricSparkColumn(column="col1", dtype="string")
        assert col.is_string() is True

    def test_is_string_case_insensitive(self):
        col = FabricSparkColumn(column="col1", dtype="STRING")
        assert col.is_string() is True

    def test_is_string_false_for_int(self):
        col = FabricSparkColumn(column="col1", dtype="int")
        assert col.is_string() is False

    def test_is_integer_for_int_dtype(self):
        col = FabricSparkColumn(column="col1", dtype="int")
        assert col.is_integer() is True

    def test_is_integer_for_bigint(self):
        col = FabricSparkColumn(column="col1", dtype="bigint")
        assert col.is_integer() is True

    def test_is_integer_false_for_string(self):
        col = FabricSparkColumn(column="col1", dtype="string")
        assert col.is_integer() is False

    def test_is_numeric_for_decimal(self):
        col = FabricSparkColumn(column="col1", dtype="decimal(10,2)")
        assert col.is_numeric() is True

    def test_is_numeric_for_decimal_no_params(self):
        col = FabricSparkColumn(column="col1", dtype="decimal")
        assert col.is_numeric() is True

    def test_is_numeric_false_for_string(self):
        col = FabricSparkColumn(column="col1", dtype="string")
        assert col.is_numeric() is False


class TestDataTypeCodeToName:
    def test_string_input_passthrough(self):
        result = FabricSparkConnectionManager.data_type_code_to_name("varchar")
        assert result == "varchar"

    def test_type_class_returns_uppercase_name(self):
        result = FabricSparkConnectionManager.data_type_code_to_name(int)
        assert result == "INT"

    def test_type_class_str(self):
        result = FabricSparkConnectionManager.data_type_code_to_name(str)
        assert result == "STR"

    def test_type_class_float(self):
        result = FabricSparkConnectionManager.data_type_code_to_name(float)
        assert result == "FLOAT"
