import pytest

from dbt.tests.adapter.ephemeral.test_ephemeral import (
    BaseEphemeralErrorHandling,
    BaseEphemeralMulti,
    BaseEphemeralNested,
    models__base__base_copy_sql,
    models__base__base_sql,
    models__base__female_only_sql,
    models__dependent_sql,
    models__double_dependent_sql,
    models__super_dependent_sql,
    models_n__ephemeral_level_two_sql,
    models_n__ephemeral_sql,
    models_n__source_table_sql,
)
from dbt.tests.util import check_relations_equal, run_dbt

fabricspark_models_n__root_view_sql = """
{{ config(materialized="table") }}
select * from {{ref("ephemeral")}}
"""


class TestEphemeralFabricSpark(BaseEphemeralMulti):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "dependent.sql": "{{ config(materialized='table') }}\n" + models__dependent_sql,
            "double_dependent.sql": "{{ config(materialized='table') }}\n"
            + models__double_dependent_sql,
            "super_dependent.sql": "{{ config(materialized='table') }}\n"
            + models__super_dependent_sql,
            "base": {
                "female_only.sql": models__base__female_only_sql,
                "base.sql": models__base__base_sql,
                "base_copy.sql": models__base__base_copy_sql,
            },
        }

    def test_ephemeral_multi(self, project):
        run_dbt(["seed"])
        results = run_dbt(["run"])
        assert len(results) == 3

        check_relations_equal(project.adapter, ["seed", "dependent"])
        check_relations_equal(project.adapter, ["seed", "double_dependent"])
        check_relations_equal(project.adapter, ["seed", "super_dependent"])


class TestEphemeralNestedFabricSpark(BaseEphemeralNested):
    @pytest.fixture(scope="class")
    def models(self):
        return {
            "ephemeral_level_two.sql": models_n__ephemeral_level_two_sql,
            "root_view.sql": fabricspark_models_n__root_view_sql,
            "ephemeral.sql": models_n__ephemeral_sql,
            "source_table.sql": models_n__source_table_sql,
        }

    def test_ephemeral_nested(self, project):
        results = run_dbt(["run"])
        assert len(results) == 2
        check_relations_equal(project.adapter, ["source_table", "root_view"])


class TestEphemeralErrorHandlingFabricSpark(BaseEphemeralErrorHandling):
    pass
