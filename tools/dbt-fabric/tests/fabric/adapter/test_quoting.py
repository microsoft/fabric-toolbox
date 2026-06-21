import pytest

from dbt.tests.util import run_dbt

_MODEL_WITH_RESERVED_COLUMN_NAMES = """
{{
    config(materialized='table')
}}

select
    1 as id,
    'hello' as [order],
    'world' as [select],
    42 as [group]
"""

_MODEL_INCREMENTAL_APPEND_NEW_COLUMNS = """
{{
    config(
        materialized='incremental',
        unique_key='id',
        on_schema_change='append_new_columns'
    )
}}

{% if is_incremental() %}

select
    1 as id,
    'hello' as [order],
    'world' as [select],
    42 as [group],
    'new_value' as [table]

{% else %}

select
    1 as id,
    'hello' as [order],
    'world' as [select],
    42 as [group]

{% endif %}
"""


class TestBracketQuotingReservedWords:
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "reserved_columns.sql": _MODEL_WITH_RESERVED_COLUMN_NAMES,
        }

    def test_reserved_column_names(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status.value == "success"

        result = project.run_sql(
            f"select [order], [select], [group] from {project.test_schema}.reserved_columns",
            fetch="one",
        )
        assert result[0] == "hello"
        assert result[1] == "world"
        assert result[2] == 42


class TestBracketQuotingSchemaChange:
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "incremental_reserved.sql": _MODEL_INCREMENTAL_APPEND_NEW_COLUMNS,
        }

    def test_incremental_append_new_columns_with_reserved_words(self, project):
        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status.value == "success"

        results = run_dbt(["run"])
        assert len(results) == 1
        assert results[0].status.value == "success"

        result = project.run_sql(
            f"select [order], [select], [group], [table] from {project.test_schema}.incremental_reserved",
            fetch="one",
        )
        assert result[0] == "hello"
        assert result[1] == "world"
        assert result[2] == 42
        assert result[3] == "new_value"
