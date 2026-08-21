import pytest

from dbt.tests.util import (
    check_relation_types,
    check_relations_equal,
    run_dbt,
    write_file,
)

seed_csv = """id,name
1,Alice
2,Bob
3,Charlie
"""

view_model_sql = """
{{ config(materialized='view') }}

select * from {{ ref('seed') }}
"""

view_on_table_sql = """
{{ config(materialized='view') }}

select * from {{ ref('table_model') }}
"""

table_model_sql = """
{{ config(materialized='table') }}

select * from {{ ref('seed') }}
"""


class TestViewMaterialization:
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"seed.csv": seed_csv}

    @pytest.fixture(scope="class")
    def models(self):
        return {
            "view_model.sql": view_model_sql,
            "table_model.sql": table_model_sql,
            "view_on_table.sql": view_on_table_sql,
        }

    def test_view_materialization(self, project):
        run_dbt(["seed"])
        results = run_dbt(["run"])
        assert len(results) == 3

        expected = {
            "seed": "table",
            "view_model": "view",
            "table_model": "table",
            "view_on_table": "view",
        }
        check_relation_types(project.adapter, expected)
        check_relations_equal(
            project.adapter, ["seed", "view_model", "table_model", "view_on_table"]
        )

    def test_view_idempotent(self, project):
        results = run_dbt(["run"])
        assert len(results) == 3

        expected = {
            "seed": "table",
            "view_model": "view",
            "table_model": "table",
            "view_on_table": "view",
        }
        check_relation_types(project.adapter, expected)


class TestViewFullRefreshFromTable:
    """--full-refresh can replace a table with a view."""

    @pytest.fixture(scope="class")
    def seeds(self):
        return {"seed.csv": seed_csv}

    @pytest.fixture(scope="class")
    def models(self):
        return {"model.sql": table_model_sql}

    def test_table_to_view_full_refresh(self, project):
        run_dbt(["seed"])
        run_dbt(["run"])
        check_relation_types(project.adapter, {"model": "table"})

        write_file(view_model_sql, project.project_root, "models", "model.sql")

        run_dbt(["run", "--full-refresh"])
        check_relation_types(project.adapter, {"model": "view"})
