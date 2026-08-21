import os

import pytest

from dbt.tests.util import run_dbt

freshness_via_loaded_at_datetime_schema_yml = """version: 2
sources:
  - name: test_source
    freshness:
      warn_after: {count: 10, period: hour}
      error_after: {count: 1, period: day}
    loaded_at_field: updated_at
    schema: "{{ env_var('DBT_COLLECT_FRESHNESS_TEST_SCHEMA') }}"
    tables:
      - name: test_freshness_datetime
"""

freshness_via_loaded_at_varchar_schema_yml = """version: 2
sources:
  - name: test_source
    freshness:
      warn_after: {count: 10, period: hour}
      error_after: {count: 1, period: day}
    loaded_at_field: updated_at
    schema: "{{ env_var('DBT_COLLECT_FRESHNESS_TEST_SCHEMA') }}"
    tables:
      - name: test_freshness_varchar
"""


class TestCollectFreshnessDatetime:
    @pytest.fixture(scope="class", autouse=True)
    def set_env_vars(self, project):
        os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"] = project.test_schema
        yield
        del os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"]

    @pytest.fixture(scope="class")
    def models(self):
        return {"schema.yml": freshness_via_loaded_at_datetime_schema_yml}

    @pytest.fixture(scope="class")
    def custom_schema(self, project, set_env_vars):
        with project.adapter.connection_named("__test"):
            relation = project.adapter.Relation.create(
                database=project.database,
                schema=os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"],
            )
            project.adapter.drop_schema(relation)
            project.adapter.create_schema(relation)

        yield relation.schema

        with project.adapter.connection_named("__test"):
            project.adapter.drop_schema(relation)

    def test_collect_freshness_datetime(self, project, set_env_vars, custom_schema):
        project.run_sql(
            f"create table {custom_schema}.test_freshness_datetime"
            f" (id int, updated_at datetime2(6));"
        )
        project.run_sql(
            f"insert into {custom_schema}.test_freshness_datetime values (1, current_timestamp);"
        )

        results = run_dbt(["source", "freshness"])
        assert len(results) == 1
        assert results[0].status == "pass"


class TestCollectFreshnessVarchar:
    @pytest.fixture(scope="class", autouse=True)
    def set_env_vars(self, project):
        os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"] = project.test_schema
        yield
        del os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"]

    @pytest.fixture(scope="class")
    def models(self):
        return {"schema.yml": freshness_via_loaded_at_varchar_schema_yml}

    @pytest.fixture(scope="class")
    def custom_schema(self, project, set_env_vars):
        with project.adapter.connection_named("__test"):
            relation = project.adapter.Relation.create(
                database=project.database,
                schema=os.environ["DBT_COLLECT_FRESHNESS_TEST_SCHEMA"],
            )
            project.adapter.drop_schema(relation)
            project.adapter.create_schema(relation)

        yield relation.schema

        with project.adapter.connection_named("__test"):
            project.adapter.drop_schema(relation)

    def test_collect_freshness_varchar(self, project, set_env_vars, custom_schema):
        project.run_sql(
            f"create table {custom_schema}.test_freshness_varchar"
            f" (id int, updated_at varchar(100));"
        )
        project.run_sql(
            f"insert into {custom_schema}.test_freshness_varchar"
            f" values (1, CONVERT(varchar(100), current_timestamp, 126));"
        )

        results = run_dbt(["source", "freshness"])
        assert len(results) == 1
        assert results[0].status == "pass"
