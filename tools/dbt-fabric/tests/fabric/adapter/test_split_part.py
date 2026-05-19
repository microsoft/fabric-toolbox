import pytest

from dbt.tests.util import relation_from_name, run_dbt

SEED_CSV = """
id,full_path
1,a.b.c
2,x.y
3,single
""".strip()

MODEL_SQL = """
{{ config(materialized='table') }}

select
    id,
    full_path,
    {{ dbt.split_part('full_path', "'.'", 1) }} as first_part,
    {{ dbt.split_part('full_path', "'.'", 2) }} as second_part
from {{ ref('split_part_seed') }}
"""


class TestSplitPartInSelectClause:
    @pytest.fixture(scope="class")
    def seeds(self):
        return {"split_part_seed.csv": SEED_CSV}

    @pytest.fixture(scope="class")
    def models(self):
        return {"split_part_model.sql": MODEL_SQL}

    def test_split_part_compiles_and_runs(self, project):
        run_dbt(["seed"])
        run_dbt(["run"])

        relation = relation_from_name(project.adapter, "split_part_model")
        result = project.run_sql(
            f"select id, first_part, second_part from {relation} order by id", fetch="all"
        )

        assert len(result) == 3

        assert result[0][1] == "a"
        assert result[0][2] == "b"

        assert result[1][1] == "x"
        assert result[1][2] == "y"

        assert result[2][1] == "single"
