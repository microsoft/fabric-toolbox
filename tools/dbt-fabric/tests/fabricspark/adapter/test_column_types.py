import pytest

from dbt.tests.adapter.column_types.fixtures import schema_yml
from dbt.tests.adapter.column_types.test_column_types import BasePostgresColumnTypes

model_sql = """
{{ config(materialized="view") }}
select
    CAST(1 AS smallint) as smallint_col,
    CAST(2 AS int) as int_col,
    CAST(3 AS bigint) as bigint_col,
    CAST(4.0 AS float) as real_col,
    CAST(5.0 AS double) as double_col,
    CAST(6.0 AS decimal(10,2)) as numeric_col,
    CAST('7' AS string) as text_col,
    CAST('8' AS string) as varchar_col
"""


class TestFabricSparkColumnTypes(BasePostgresColumnTypes):
    @pytest.fixture(scope="class")
    def models(self):
        return {"model.sql": model_sql, "schema.yml": schema_yml}
