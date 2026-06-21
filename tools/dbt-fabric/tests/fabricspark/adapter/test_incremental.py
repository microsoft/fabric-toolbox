import pytest

from dbt.tests.adapter.incremental.test_incremental_merge_exclude_columns import (
    BaseMergeExcludeColumns,
)
from dbt.tests.adapter.incremental.test_incremental_microbatch import BaseMicrobatch
from dbt.tests.adapter.incremental.test_incremental_on_schema_change import (
    BaseIncrementalOnSchemaChange,
)
from dbt.tests.adapter.incremental.test_incremental_predicates import BaseIncrementalPredicates
from dbt.tests.adapter.incremental.test_incremental_unique_id import BaseIncrementalUniqueKey


class TestBaseIncrementalUniqueKeyFabricSpark(BaseIncrementalUniqueKey):
    pass


class TestIncrementalOnSchemaChangeFabricSpark(BaseIncrementalOnSchemaChange):
    @pytest.mark.skip(
        "DELTA_MERGE_UNRESOLVED_EXPRESSION when appending new columns after column removal"
    )
    def test_run_incremental_append_new_columns(self, project):
        pass

    @pytest.mark.skip("Apache Spark does not support dropping columns from Delta tables")
    def test_run_incremental_sync_all_columns(self, project):
        pass


@pytest.mark.skip(
    "Delta Lake on Fabric Lakehouse does not support subqueries in DELETE statements"
)
class TestIncrementalPredicatesDeleteInsertFabricSpark(BaseIncrementalPredicates):
    pass


class TestMergeExcludeColumnsFabricSpark(BaseMergeExcludeColumns):
    pass


_microbatch_model_sql = """
{{ config(
    materialized='incremental',
    incremental_strategy='microbatch',
    unique_key='id',
    event_time='event_time',
    batch_size='day',
    begin='2020-01-01 00:00:00',
    partition_by='event_time'
) }}
select * from {{ ref('input_model') }}
"""

_input_model_sql = """
{{ config(materialized='table', event_time='event_time') }}
select 1 as id, cast('2020-01-01 00:00:00' as timestamp) as event_time
union all
select 2 as id, cast('2020-01-02 00:00:00' as timestamp) as event_time
union all
select 3 as id, cast('2020-01-03 00:00:00' as timestamp) as event_time
"""


class TestFabricSparkMicrobatch(BaseMicrobatch):
    @pytest.fixture(scope="class")
    def microbatch_model_sql(self) -> str:
        return _microbatch_model_sql

    @pytest.fixture(scope="class")
    def input_model_sql(self) -> str:
        return _input_model_sql

    @pytest.fixture(scope="class")
    def insert_two_rows_sql(self, project) -> str:
        target_relation = project.adapter.Relation.create(
            database=project.database,
            schema=project.test_schema,
            identifier="input_model",
        )
        return (
            f"merge into {target_relation} as t "
            "using (select 4 as id, cast('2020-01-04 00:00:00' as timestamp) as event_time "
            "union all "
            "select 5 as id, cast('2020-01-05 00:00:00' as timestamp) as event_time) as s "
            "on false "
            "when not matched then insert *"
        )
