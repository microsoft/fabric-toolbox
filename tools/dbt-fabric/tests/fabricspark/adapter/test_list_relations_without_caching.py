import pytest

from dbt.tests.util import run_dbt

TABLE_BASE_SQL = """
{{ config(materialized='table') }}

select 1 as id
""".lstrip()


class TestListRelationsWithoutCachingSchemaNotFound:
    """Verify that list_relations_without_caching gracefully returns an empty list
    when queried against a non-existent schema, instead of raising [SCHEMA_NOT_FOUND].

    Ported from upstream microsoft/dbt-fabricspark@9d2a8136.
    """

    @pytest.fixture(scope="class")
    def models(self):
        return {"my_model_base.sql": TABLE_BASE_SQL}

    def test_nonexistent_schema_returns_empty(self, project):
        run_dbt(["run"])

        fake_schema_relation = project.adapter.Relation.create(
            database=project.database,
            schema="this_schema_does_not_exist_xyz",
        )

        result = project.adapter.list_relations_without_caching(fake_schema_relation)
        assert result == []
