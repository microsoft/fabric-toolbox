import os

import pytest

from dbt.tests.util import run_dbt

freshness_via_metadata_schema_yml = """version: 2
sources:
  - name: test_source
    freshness:
      warn_after: {count: 10, period: hour}
      error_after: {count: 1, period: day}
    schema: "{{ env_var('DBT_GET_LAST_RELATION_TEST_SCHEMA') }}"
    tables:
      - name: test_table
"""


class TestGetLastRelationModified:
    @pytest.fixture(scope="class", autouse=True)
    def set_env_vars(self, project):
        os.environ["DBT_GET_LAST_RELATION_TEST_SCHEMA"] = project.test_schema
        yield
        del os.environ["DBT_GET_LAST_RELATION_TEST_SCHEMA"]

    @pytest.fixture(scope="class")
    def models(self):
        return {"schema.yml": freshness_via_metadata_schema_yml}

    @pytest.fixture(scope="class")
    def custom_schema(self, project, set_env_vars):
        with project.adapter.connection_named("__test"):
            relation = project.adapter.Relation.create(
                database=project.database, schema=os.environ["DBT_GET_LAST_RELATION_TEST_SCHEMA"]
            )
            project.adapter.drop_schema(relation)
            project.adapter.create_schema(relation)

        yield relation.schema

        with project.adapter.connection_named("__test"):
            project.adapter.drop_schema(relation)

    def test_get_last_relation_modified(self, project, set_env_vars, custom_schema):
        project.run_sql(
            f"create table {custom_schema}.test_table (id int, name varchar(100) not null);"
        )

        results = run_dbt(["source", "freshness"])
        assert len(results) == 1
        assert results[0].status == "pass"
